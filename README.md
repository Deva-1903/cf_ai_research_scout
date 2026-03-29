# AI Research Scout

**Live demo:** https://cf-ai-research-scout.pages.dev

A research assistant built on Cloudflare. You paste URLs, it reads and indexes them, then you can chat with an AI that answers questions based on what it actually read — not general knowledge.

---

## Try these pre-built sessions

I've already set up two sessions with sources indexed and questions answered. Just open them and try asking something.

**Session 1 — Cloudflare Agents Deep Dive**
Research question: *How does the Cloudflare Agents SDK work, and how does it differ from raw Durable Objects?*
Sources: the official Agents docs, Durable Objects docs, and the launch blog post.
→ [Open session](https://cf-ai-research-scout.pages.dev/session/05551eb0-8c00-4c44-ac5f-699b3b85c4f6)

Try asking:
- What is AIChatAgent and how does it differ from a raw Durable Object?
- What does the `@callable()` decorator do?
- When should I use a Workflow instead of an Agent?

**Session 2 — RAG Pipeline Research**
Research question: *What are the most effective techniques for improving RAG accuracy in production?*
Sources: Anthropic's contextual retrieval paper, Cloudflare Vectorize docs, Agents docs.
→ [Open session](https://cf-ai-research-scout.pages.dev/session/180a92ca-febb-4262-8b97-c042f31781e8)

Try asking:
- What is contextual retrieval and how does it improve on naive chunking?
- How does Cloudflare Vectorize fit into a RAG pipeline?
- Or just hit **Generate Digest** — that triggers the `DigestWorkflow` and produces a structured summary of all sources.

---

## How it works

You create a session, give it a research question, and paste in URLs. The worker fetches each page, strips the HTML, splits the text into chunks, runs them through `@cf/baai/bge-base-en-v1.5` on Workers AI to generate embeddings, and stores everything in D1. That's the ingestion pipeline — it runs in the background via `ctx.waitUntil()`.

When you chat, the backend embeds your question, runs cosine similarity against all stored chunks, picks the top 6, and injects them into the system prompt before calling the LLM. The model always answers from your actual sources.

The digest is a separate Cloudflare Workflow (`WorkflowEntrypoint`) — it loads all chunks, builds a prompt, calls the LLM, and stores the result in D1. The frontend polls a GET endpoint until it's ready.

---

## Architecture

```
Browser (React 19 + Vite) on Cloudflare Pages
  │
  ├── WebSocket  →  /agents/research-session/:id
  │       ResearchSession (AIChatAgent / Durable Object)
  │       - chat history stored in DO's SQLite storage
  │       - pre-retrieves RAG context before each LLM call
  │       - streams responses via llama-3.3-70b on Workers AI
  │
  └── HTTPS  →  /api/*  (Hono)
          session + source CRUD
          DigestWorkflow (4-step WorkflowEntrypoint)
          D1 — sessions, sources, chunks+embeddings, digests
```

### Data flow

**Ingestion:**
```
POST /api/sessions/:id/sources
  → insert source in D1 (status = queued)
  → ctx.waitUntil(ingestSource())
      fetch URL → strip HTML → chunk text → embed via Workers AI → store in D1
  → source status → indexed | failed
```

**Chat (where the Agents SDK comes in):**
```
useAgent() + useAgentChat()  ──WebSocket──►  ResearchSession (AIChatAgent)
  → onChatMessage() fires
  → embed user query → cosine similarity over D1 chunks → top-6 retrieved
  → streamText() with system prompt + retrieved context injected
  → response streams back token by token via toUIMessageStreamResponse()
  → AIChatAgent persists full conversation in Durable Object SQLite storage
```

**Digest:**
```
POST /api/sessions/:id/digest
  → DigestWorkflow.create({ sessionId })   ← WorkflowEntrypoint
      step 1: load chunks from D1
      step 2: load session metadata
      step 3: call llama-3.3-70b → generate digest
      step 4: store result in D1
GET /api/sessions/:id/digest  ← poll until { ready: true }
```

---

## Agents SDK usage

The chat system uses the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) rather than a raw Durable Object:

- `AIChatAgent` — base class for `ResearchSession`. Handles WebSocket upgrades, message persistence in SQLite-backed DO storage, and the `onChatMessage()` lifecycle hook
- `routeAgentRequest(request, env)` — in `worker/src/index.ts`, routes all `/agents/*` requests to the right DO instance automatically
- `@callable()` decorator — on `addSourceFromChat()` in `ResearchSession.ts`, lets the frontend call it as an RPC method via the agent stub instead of a separate REST endpoint
- `useAgent` + `useAgentChat` — React hooks in `ChatPanel.tsx` that connect to the WebSocket and handle streaming message state

---

## Stack

| What | How |
|------|-----|
| Worker + API | Cloudflare Workers, Hono router |
| AI Agent / chat | `AIChatAgent` from `@cloudflare/ai-chat` |
| Agent routing | `routeAgentRequest` from Cloudflare Agents SDK |
| Digest workflow | `WorkflowEntrypoint` (Cloudflare Workflows) |
| Database | Cloudflare D1 |
| LLM | Workers AI — `llama-3.3-70b-instruct-fp8-fast` |
| Embeddings | Workers AI — `bge-base-en-v1.5` |
| Frontend | React 19, React Router, Vite |
| Frontend hooks | `useAgent` + `useAgentChat` from Agents SDK |
| Hosting | Cloudflare Pages |

---

## Project structure

```
worker/src/
  index.ts                 ← routeAgentRequest + Hono app
  durable-objects/
    ResearchSession.ts     ← AIChatAgent: chat, RAG, @callable
  workflows/
    DigestWorkflow.ts      ← WorkflowEntrypoint: 4-step digest
  routes/
    sessions.ts / sources.ts / chat.ts
  services/
    ingestion.ts           ← fetch → chunk → embed → store
    retrieval.ts           ← cosine similarity over D1 embeddings
  prompts/
    system.ts              ← system prompt + context block builder

frontend/src/
  components/
    ChatPanel.tsx          ← useAgent + useAgentChat
    SourcePanel.tsx        ← source list with status polling
  lib/
    api.ts                 ← typed REST client
```

---

## Running locally

You'll need Node 18+, a Cloudflare account, and `wrangler login` done.

```bash
cd worker && npm install
cd ../frontend && npm install --legacy-peer-deps
```

The `--legacy-peer-deps` is needed because the Agents SDK requires React 19.

**First-time D1 setup:**

```bash
cd worker
wrangler d1 create cf-ai-research-scout-db
# copy the database_id into wrangler.toml
npm run db:init
```

**Start both dev servers:**

```bash
# terminal 1
cd worker && npm run dev      # localhost:8787

# terminal 2
cd frontend && npm run dev    # localhost:5173
```

Workers AI runs remotely even in local dev, so you need an internet connection.

---

## Deploying

```bash
cd worker && npm run deploy

cd ../frontend
npm run build
npx wrangler pages deploy dist --project-name cf-ai-research-scout
```

Set `FRONTEND_ORIGIN` in `worker/wrangler.toml` to your Pages URL, and add `frontend/.env.production`:

```
VITE_WORKER_URL=https://your-worker.workers.dev
VITE_API_URL=https://your-worker.workers.dev/api
```

---

## Known limitations

- No auth — sessions are public to anyone with the link
- Only works with public HTTP/HTTPS URLs (no PDFs, no paywalled pages)
- Embeddings stored as JSON in D1 with in-process cosine similarity — works fine up to a few hundred chunks per session, Vectorize would be the right move at scale

---

## What I'd add next

- Swap D1 embeddings for Cloudflare Vectorize — better performance at scale
- Authentication via Cloudflare Access
- PDF support via R2 + a parsing step before chunking
- Scheduled digest using a Cron Trigger instead of manual trigger
- Source content preview so you can see what was actually indexed
