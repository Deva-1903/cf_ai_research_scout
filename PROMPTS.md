# PROMPTS.md

This file documents how I used Claude Code (AI-assisted coding) during development. I planned the architecture, set up the project structure, wrote the D1 schema, and handled the Cloudflare config myself — then used Claude Code as a pair programmer for implementation, debugging, and refactoring specific parts.

---

## Development Prompts (Claude Code)

### Ingestion service

I had the schema and wrangler setup done, and knew the flow I wanted: fetch URL → strip HTML → chunk text → embed → store. Asked Claude to implement it:

> I'm building a Cloudflare Worker that ingests URLs for a RAG app. I have a D1 database with a `sources` table (id, session_id, url, title, status) and a `chunks` table (id, source_id, session_id, text, embedding, chunk_order). Write an `ingestSource(sourceId, url, sessionId, env)` function that: fetches the URL, extracts readable text from HTML, chunks it at ~500 chars with overlap, calls `@cf/baai/bge-base-en-v1.5` via Workers AI to embed each chunk, and stores them in D1. Update the source status to 'processing' → 'indexed' or 'failed' throughout.

### Cosine similarity retrieval

I wrote the basic retrieval function myself but wanted a review and to add the early-exit for empty sessions (which was causing a 1031 Workers AI error):

> Here's my retrieval function — it loads all indexed chunks from D1, embeds the query, and ranks by cosine similarity. The problem is it calls Workers AI to embed even when there are no indexed chunks, which causes a 1031 error. Add a check to skip the embed call if the chunk query returns empty, and wrap the embed call in a try/catch so a transient AI error doesn't crash the whole chat request.

### AIChatAgent refactor

After getting the basic flow working with a raw Durable Object, I decided to switch to `AIChatAgent` from `@cloudflare/ai-chat` to get proper WebSocket handling and message persistence for free. I needed help with the migration:

> Refactor my `ResearchSession` Durable Object to extend `AIChatAgent` from `@cloudflare/ai-chat` instead of `DurableObject`. It should: sync session metadata and sources from D1 on `onStart()`, implement `onChatMessage()` using `streamText` from the AI SDK with `workers-ai-provider`, pre-retrieve RAG context before the LLM call and inject it into the system prompt, and keep the existing `@callable addSourceFromChat` method. Use `pruneMessages` and `convertToModelMessages` from the AI SDK to keep context manageable.

### DigestWorkflow

I wanted the digest to run as a proper durable Workflow so it survives interruptions. Knew the 4 steps, needed help with the WorkflowEntrypoint pattern:

> Implement a `DigestWorkflow` using Cloudflare's `WorkflowEntrypoint`. It takes a `sessionId` param. Steps: (1) load all indexed chunks from D1, (2) load session metadata, (3) call `@cf/meta/llama-3.3-70b-instruct-fp8-fast` directly via `env.AI.run()` with a digest prompt, (4) insert the result into a `digests` table. The REST endpoint should return `{ workflowId }` immediately and a GET endpoint polls D1 until the digest row exists.

### Workers AI 1031 error

Hit this after switching to `streamText` with `tools`:

> I'm getting `InferenceUpstreamError: error code 1031` when calling `streamText` with a `tools` block using `workers-ai-provider` and `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. The error comes from inside `WorkersAIChatLanguageModel.doStream`. Is this a model limitation? How should I restructure `onChatMessage` to do RAG without using the tools API — just pre-retrieve the chunks and inject context into the system prompt instead?

### Frontend chat panel layout bug

> The digest content renders inside the fixed-height chat card, so when a long digest appears it pushes the message list out of view. The chat card uses `height: calc(100vh - 200px)` and flexbox. Fix the layout so the digest lives in a separate card below the chat panel entirely, and the chat messages area always stays at its correct height.

### React 19 + agents SDK dependency conflict

> `npm install` is failing because `agents@0.8.6` requires `react@^19.0.0` as a peer but my frontend is on React 18. The error is ERESOLVE. What's the cleanest fix — upgrade React or use legacy-peer-deps?

---

## Application Prompts (used inside the app at runtime)

These are the prompts the app itself sends to the LLM. I designed these — Claude helped me tighten the wording.

### System prompt (`buildSystemPrompt`)

Sets the assistant's behavior for the whole session. The research question is injected so the model stays on topic across many turns.

```
You are a research assistant helping the user reason over a curated set of sources they have provided.

The user's primary research question is: "{researchQuestion}"

- Answer based primarily on the retrieved source excerpts provided.
- Cite sources by title or URL with a brief supporting snippet.
- If sources agree or conflict, say so explicitly.
- If evidence is weak or absent, admit it — do not invent citations.
- Keep answers concise and structured. Use bullet points where it helps.
- If answering from general knowledge, clearly label it as such.
{customInstructions}
```

### Context block (`buildContextBlock`)

Injected with each chat turn — the top-6 chunks retrieved for the user's question.

```
Here are the most relevant excerpts from the user's indexed sources:

[Source 1: {title or URL}]
{chunk text}

---

[Source 2: {title or URL}]
{chunk text}

Use these excerpts to answer the user's question. Cite by label (e.g. "Source 1") or URL.
```

### Digest prompt (`buildDigestPrompt`)

Single-shot synthesis prompt for the DigestWorkflow. Designed to go beyond summarization into comparative analysis.

```
You are producing a research digest for the following question: "{researchQuestion}"

{contextBlock}

Write a structured digest that:
1. Summarizes the key themes and findings across all sources.
2. Highlights agreements and disagreements between sources.
3. Identifies gaps or unanswered aspects of the research question.
4. Ends with 3-5 takeaways or recommended next steps.

Format the output in Markdown with headers.
```
