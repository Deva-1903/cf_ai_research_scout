# PROMPTS.md — cf_ai_research_scout

This file documents the AI prompts used within the application, with explanations of their purpose and design decisions.

---

## 1. Research Assistant System Prompt

**Location:** `worker/src/prompts/system.ts` → `buildSystemPrompt()`

**Prompt:**
```
You are a research assistant helping the user reason over a curated set of sources they have provided.

The user's primary research question is: "{researchQuestion}"

Your job:
- Answer questions based primarily on the retrieved source excerpts provided in each message.
- When citing, include the source title or URL and a brief snippet that supports your claim.
- If multiple sources agree or conflict, note this explicitly.
- If the retrieved evidence is weak, incomplete, or absent, say so clearly — do not invent source-backed claims.
- Keep answers well-structured: use short paragraphs or bullet points for clarity.
- If the user asks something unrelated to the sources, you may answer from general knowledge but clearly label it as such.
- Prefer precision over length. Be concise unless the user asks to go deep.
{customInstructions}
```

**Why this prompt exists:**
The system prompt establishes the assistant's identity as a *grounded* research tool, not a general chatbot. The key constraints are:
- "Do not invent source-backed claims" — prevents hallucination of citations, which is a major failure mode for RAG systems
- "If multiple sources agree or conflict, note this" — surfaces disagreements rather than flattening them into a single confident answer
- "clearly label it as such" when using general knowledge — maintains source transparency
- The session's `researchQuestion` is injected so the model can stay on-topic across many follow-up turns

---

## 2. Retrieved Context Block Prompt

**Location:** `worker/src/prompts/system.ts` → `buildContextBlock()`

**Prompt:**
```
Here are the most relevant excerpts from the user's indexed sources:

[Source 1: {title or URL}]
{chunk text}

---

[Source 2: {title or URL}]
{chunk text}

...

Use these excerpts to answer the user's question. Cite sources by their label (e.g. "Source 1") or URL.
```

**Why this prompt exists:**
The retrieval context is injected as a second system message immediately before the conversation history. This structure:
- Keeps the retrieved chunks clearly labeled with their provenance
- Uses numeric labels ("Source 1", "Source 2") that the model can reference in its output, which are then mapped back to real citations in the API response
- Separates context injection from the system identity prompt so each can be updated independently
- Using a second `system` message (rather than a `user` turn) keeps it out of the visible conversation history

---

## 3. Digest / Summary Prompt

**Location:** `worker/src/prompts/system.ts` → `buildDigestPrompt()`

**Prompt:**
```
You are producing a research digest for the following question: "{researchQuestion}"

Here are the most relevant excerpts from the user's indexed sources:
{contextBlock}

Write a structured digest that:
1. Summarizes the key themes and findings across all sources.
2. Highlights agreements and disagreements between sources.
3. Identifies gaps or unanswered aspects of the research question.
4. Ends with 3-5 takeaways or recommended next steps.

Format the digest in clear Markdown with headers.
```

**Why this prompt exists:**
The digest serves as a one-shot synthesis of all indexed material. The numbered structure forces the model to go beyond summarization into comparative analysis (agreements/disagreements) and gap identification — the two things a human researcher would want to know. The Markdown output format is intentional: it renders cleanly in the UI and can be copied directly into notes.

---

## 4. Ingestion Pipeline (not an LLM prompt — AI model used directly)

**Location:** `worker/src/services/llm.ts` → `embedBatch()`

**Model:** `@cf/baai/bge-base-en-v1.5`
**Input:** Array of text chunks (plain text, ~500 chars each)
**Output:** Array of 768-dimensional float vectors

**Why bge-base-en-v1.5:**
- Strong performance on retrieval benchmarks (MTEB)
- 768-dimension output — compact enough to store as JSON in D1 without bloat
- Fast inference via Workers AI — critical for processing many chunks during ingestion
- No instruction prefix needed for retrieval tasks (unlike some other models)

**Chunking strategy:**
- Target ~500 characters per chunk with 80-char overlap
- Prefer paragraph breaks, then sentence boundaries
- Minimum chunk length of 80 chars to discard noise
- Capped at 50,000 chars per source to prevent excessive embedding cost

**Why this design:**
Smaller chunks (vs. 2000-char chunks) improve retrieval precision — a short relevant sentence scores higher than a large paragraph that only partially matches the query. The overlap ensures that a sentence split across two chunks doesn't disappear from both.

---

## 5. Retrieval Strategy (not a prompt — algorithmic)

**Location:** `worker/src/services/retrieval.ts`

**Method:** Cosine similarity between query embedding and stored chunk embeddings

**Parameters:**
- `TOP_K = 6` — retrieve up to 6 chunks per question
- `SIMILARITY_THRESHOLD = 0.2` — discard chunks below this score to avoid injecting irrelevant context

**Why cosine similarity over D1 (not Vectorize):**
For sessions with up to a few hundred chunks, in-process cosine similarity is fast enough (~1-5ms) and avoids the complexity of managing a Vectorize index. This keeps local development straightforward and the architecture explainable. Vectorize would be the right upgrade path at scale.

**Why TOP_K = 6:**
Six chunks at ~500 chars each = ~3000 chars of context. This fits comfortably in the llama-3.1-8b-instruct context window alongside the system prompt and conversation history, without pushing against token limits that cause truncation.

---

## 6. Chat Message Construction

**Location:** `worker/src/routes/chat.ts`

**Message stack sent to the LLM:**
```
[system]  → buildSystemPrompt()        (assistant identity + research question)
[system]  → buildContextBlock()        (retrieved chunks for this turn)
[user]    → prior turn 1
[assistant] → prior response 1
...
[user]    → current question
```

**Why this structure:**
- Two system messages: Cloudflare's llama model handles this correctly and it avoids polluting the visible conversation history
- Prior turns are included (up to 10) so the model can handle follow-up questions like "expand on the third point"
- The context block is rebuilt fresh every turn — this ensures retrieval is always query-specific rather than using a fixed "session summary"

---

## Construction Prompts (Prompts Used to Build This App)

The following prompts were used in the AI-assisted development session that produced this codebase.

### Architecture Planning Prompt
> Build an app called `cf_ai_research_scout`. A user creates a research session, enters a topic/question, adds a few URLs, and the app ingests those sources in the background. Once processed, the user can chat with an AI assistant that answers questions grounded in the ingested material and remembers the ongoing research thread. Use Cloudflare Workers, D1, Durable Objects, and Workers AI. Skip Vectorize and store embeddings in D1 — compute cosine similarity in the worker. Keep it simple and deployable.

### UI Scaffolding Prompt
> Build a clean dark-mode React + Vite frontend with no component libraries. Create: a home page with session list and create modal, and a session page with a two-column layout: left column has source input + status list with polling, right column has a chat interface with citation cards below each assistant message. No auth. Minimal dependencies.

### Retrieval Prompt Design
> Design a retrieval context block for a RAG system where chunks are labeled [Source 1], [Source 2], etc. The instruction to the model should emphasize using these excerpts for answers and citing by label. Keep it under 100 words.

### System Prompt Design
> Write a system prompt for a research assistant LLM that: grounds answers in retrieved sources, cites evidence explicitly, admits when evidence is weak, handles source conflicts by noting them, falls back to general knowledge with clear labeling, and stays concise. Inject the session's research question into the prompt so the model stays on topic.

### Digest Prompt Design
> Write a one-shot digest prompt that takes a research question and a set of source excerpts and produces a structured Markdown summary with: key themes, source agreements/conflicts, identified gaps, and 3-5 takeaways. Designed for a single LLM call, not a conversation.
