# cf_ai_research_scout

A Cloudflare-native AI research assistant. Create a research session, add article/document URLs, wait for background ingestion, then chat with an AI that answers questions **grounded in your sources** — with citations.

---

## What It Does

1. **Create a research session** — give it a title, a research question, and optional style instructions.
2. **Add source URLs** — paste any publicly accessible article or documentation page.
3. **Background ingestion** — the worker fetches, extracts text, chunks it, generates embeddings, and indexes everything in the database automatically.
4. **Chat over your sources** — ask follow-up questions. The AI retrieves the most relevant chunks via cosine similarity and grounds its answers in evidence.
5. **Citations with snippets** — every assistant response links back to the exact source excerpts it used.
6. **Generate a digest** — ask the app to summarize all indexed sources into a structured research brief.

---

## Architecture

```
Browser (React 19 + Vite)
  │  Cloudflare Pages
  │
  ├─► WebSocket /agents/research-session/:id
  │     └─ ResearchSession AIChatAgent (Durable Object)
  │           ├─ Persists chat history in SQLite-backed DO storage
  │           ├─ RAG: rag_search tool → cosine similarity over D1 chunks
  │           └─ Streams responses via Workers AI (llama-3.3-70b)
  │
  └─► HTTPS /api/*  (Hono REST)
        ├─ D1 Database     — sessions, sources, chunks (+embeddings), digests
        ├─ DigestWorkflow  — durable multi-step digest generation
        └─ Workers AI
             ├─ bge-base-en-v1.5           — embeddings for chunks + queries
             └─ llama-3.3-70b-instruct-fp8-fast — answer generation + digest
```

### Data Flow

**Ingestion (background):**
```
POST /api/sessions/:id/sources
  → D1: insert source (status=queued)
  → ctx.waitUntil(ingestSource(...)):
      fetch URL → extract text → chunk → embed (Workers AI) → store chunks in D1
  → D1: update source status (indexed | failed)
```

**Chat (real-time WebSocket):**
```
Browser useAgentChat() ──WebSocket──► ResearchSession AIChatAgent (DO)
  → onChatMessage() called
  → rag_search tool: embed query → cosine similarity over D1 chunks → top-6
  → streamText() with system prompt + retrieved context
  → streams tokens back to browser via AI SDK UI stream protocol
  → AIChatAgent persists full conversation in DO SQLite storage
```

**Digest (async Workflow):**
```
POST /api/sessions/:id/digest
  → DigestWorkflow.create({ sessionId })
  → step 1: load chunks from D1
  → step 2: load session metadata
  → step 3: generate digest (llama-3.3-70b via Workers AI)
  → step 4: store result in D1 digests table
GET /api/sessions/:id/digest  ← poll until { ready: true }
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, React Router, Vite |
| Chat hooks | `agents/react` (`useAgent`) + `@cloudflare/ai-chat/react` (`useAgentChat`) |
| Hosting | Cloudflare Pages |
| API | Cloudflare Workers + Hono |
| AI Agent | `AIChatAgent` from `@cloudflare/ai-chat` (Durable Object) |
| Agentic tools | `tool()` from `ai` SDK with `inputSchema` — `rag_search` |
| Agent orchestration | Cloudflare Agents SDK (`agents`) — `routeAgentRequest`, `@callable()` |
| Async workflow | Cloudflare Workflows — `WorkflowEntrypoint` (`DigestWorkflow`) |
| Database | Cloudflare D1 (SQLite) |
| Embeddings | Workers AI — `@cf/baai/bge-base-en-v1.5` |
| Text generation | Workers AI — `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| Language | TypeScript everywhere |

---

## Project Structure

```
cf_ai_research_scout/
├── README.md
├── PROMPTS.md
├── .gitignore
├── .dev.vars.example
│
├── worker/
│   ├── wrangler.toml
│   ├── package.json
│   ├── tsconfig.json
│   ├── schema.sql
│   └── src/
│       ├── index.ts                    ← main entry, Hono app
│       ├── types.ts                    ← shared types + Env bindings
│       ├── routes/
│       │   ├── sessions.ts             ← CRUD for sessions
│       │   ├── sources.ts              ← add/delete/retry sources
│       │   └── chat.ts                 ← chat, messages, digest
│       ├── services/
│       │   ├── ingestion.ts            ← fetch → chunk → embed → store
│       │   ├── retrieval.ts            ← cosine similarity retrieval
│       │   └── llm.ts                  ← Workers AI wrappers
│       ├── durable-objects/
│       │   └── ResearchSession.ts      ← AIChatAgent: WebSocket chat, RAG, @callable addSourceFromChat
│       ├── workflows/
│       │   └── DigestWorkflow.ts       ← durable 4-step digest generation workflow
│       ├── prompts/
│       │   └── system.ts               ← system prompt + context builder
│       └── utils/
│           ├── html.ts                 ← HTML → plain text extraction
│           ├── chunking.ts             ← text chunking with overlap
│           ├── cors.ts                 ← CORS headers
│           └── id.ts                   ← UUID generator
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── lib/
        │   ├── api.ts                  ← typed API client
        │   └── types.ts                ← frontend type definitions
        ├── pages/
        │   ├── Home.tsx                ← session list + create
        │   └── Session.tsx             ← session detail view
        ├── components/
        │   ├── SessionCard.tsx
        │   ├── CreateSessionModal.tsx
        │   ├── SourcePanel.tsx         ← URL input + status list (polls during ingestion)
        │   ├── ChatPanel.tsx           ← chat UI + digest
        │   ├── CitationCard.tsx        ← expandable citation with snippet
        │   └── StatusBadge.tsx
        └── styles/
            └── index.css
```

---

## Required Environment Variables

### Worker

Set these in `wrangler.toml` (for production) or `.dev.vars` (local):

| Variable | Description |
|----------|-------------|
| `FRONTEND_ORIGIN` | URL of the frontend (for CORS). Defaults to `http://localhost:5173`. Set to your Pages URL in production. |

Workers AI and D1 are configured via `wrangler.toml` bindings — no API keys needed beyond your Cloudflare account credentials.

---

## Local Setup

### Prerequisites

- Node.js 18+
- A Cloudflare account
- `wrangler` CLI: `npm install -g wrangler` then `wrangler login`

### 1. Install dependencies

```bash
# Worker
cd worker
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Create the D1 database

```bash
cd worker
wrangler d1 create cf-ai-research-scout-db
```

Copy the `database_id` from the output and paste it into `worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "cf-ai-research-scout-db"
database_id = "YOUR_DATABASE_ID_HERE"
```

### 3. Initialize the schema

```bash
cd worker
npm run db:init       # applies schema to local D1
npm run db:init:remote  # applies schema to remote D1 (needed for deploy)
```

### 4. Run locally

Open two terminals:

**Terminal 1 — Worker:**
```bash
cd worker
npm run dev
# Worker starts at http://localhost:8787
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm install --legacy-peer-deps   # agents SDK requires React 19
npm run dev
# Vite starts at http://localhost:5173
# /api and /agents requests are proxied to localhost:8787
```

Open `http://localhost:5173` in your browser.

> **Note:** Workers AI calls are made remotely to Cloudflare even in local dev, so you need an active internet connection and to be logged in with `wrangler login`.

---

## Deployment

### Deploy the Worker

```bash
cd worker
npm run deploy
```

Note the Worker URL from the output (e.g. `https://cf-ai-research-scout-worker.your-subdomain.workers.dev`).

### Deploy the Frontend to Pages

```bash
cd frontend
npm run build
wrangler pages deploy dist --project-name cf-ai-research-scout
```

Or connect the `frontend/` directory to Cloudflare Pages via the dashboard with:
- Build command: `npm run build`
- Build output: `dist`
- Root directory: `frontend`

### Update CORS and worker URL for production

In `worker/wrangler.toml`, set:

```toml
[vars]
FRONTEND_ORIGIN = "https://cf-ai-research-scout.pages.dev"
```

In the frontend, set `VITE_WORKER_URL` so `useAgent` can connect to the agent WebSocket in production. Add a `.env.production` file in `frontend/`:

```
VITE_WORKER_URL=https://cf-ai-research-scout-worker.your-subdomain.workers.dev
```

Then re-deploy both the worker and the frontend.

---

## API Reference

### REST endpoints (Hono)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sessions` | Create session |
| `GET` | `/api/sessions` | List sessions |
| `GET` | `/api/sessions/:id` | Get session |
| `PUT` | `/api/sessions/:id` | Update session |
| `DELETE` | `/api/sessions/:id` | Delete session (cascades) |
| `POST` | `/api/sessions/:id/sources` | Add URL source (triggers background ingestion) |
| `GET` | `/api/sessions/:id/sources` | List sources + status |
| `DELETE` | `/api/sources/:id` | Delete source |
| `POST` | `/api/sources/:id/retry` | Retry failed source |
| `POST` | `/api/sessions/:id/digest` | Start digest workflow — returns `{ workflowId }` |
| `GET` | `/api/sessions/:id/digest` | Poll for digest result — returns `{ ready, content, … }` |
| `GET` | `/api/health` | Health check |

### WebSocket / Agent endpoint

| Protocol | Path | Description |
|----------|------|-------------|
| `WS` | `/agents/research-session/:id` | Real-time chat with `ResearchSession` AIChatAgent |

Chat messages, history, and state are managed entirely through the WebSocket connection via `useAgentChat`. The agent persists all messages in the Durable Object's SQLite storage.

---

## Known Limitations

- **No auth** — all sessions are visible to anyone with the URL. Add Cloudflare Access for protection.
- **Embedding cost** — Workers AI is billed per token. Large sources (capped at 50,000 chars) may produce 50–100 chunks each.
- **Vectorize not used** — embeddings are stored in D1 as JSON arrays; cosine similarity is computed in-process. Works well up to ~500 chunks per session; add Vectorize beyond that.
- **URL-only ingestion** — only public HTTP/HTTPS URLs are supported. Paywalled or JS-rendered pages will fail with an error.
- **Text extraction is heuristic** — the HTML stripper works well for articles but may miss content in heavily JS-rendered SPAs.

---

## Future Improvements

- Add Vectorize for scalable vector search at thousands of chunks
- Add Cloudflare Access for authentication
- Support PDF upload via R2
- Add scheduled digest via Cron Triggers
- Allow renaming sessions and editing research questions
- Add source content preview in the UI

---

## Cloudflare Assignment Compliance

| Requirement | Implementation | Where |
|-------------|---------------|-------|
| **LLM integration** | Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast` for streaming chat responses and digest generation | `ResearchSession.ts` → `streamText()`, `DigestWorkflow.ts` → `env.AI.run()` |
| **Workflow / coordination** | `DigestWorkflow extends WorkflowEntrypoint` — 4 durable steps (load chunks → load session → generate → store). Survives interruptions and resumes from last completed step. | `worker/src/workflows/DigestWorkflow.ts` |
| **Agentic tools** | `rag_search` tool registered with `tool()` from AI SDK v6 (`inputSchema`, `execute`). Agent automatically calls it before answering research questions. Multi-step agent loop with `stopWhen: stepCountIs(5)`. | `ResearchSession.ts` lines 96–128 |
| **User input via chat** | Real-time WebSocket chat via `AIChatAgent` from `@cloudflare/ai-chat`. Frontend uses `useAgent` + `useAgentChat` hooks. Streaming responses via `toUIMessageStreamResponse()`. | `ResearchSession.ts`, `ChatPanel.tsx` |
| **Memory / state** | `AIChatAgent` persists full conversation in Durable Object SQLite storage across sessions. Session metadata, sources, and chunks persist in D1. | `ResearchSession.ts` (DO state), `worker/schema.sql` |
| **Agents SDK** | `routeAgentRequest` routes `/agents/research-session/:id` to the correct DO; `@callable()` decorator exposes `addSourceFromChat` as an RPC method callable from the frontend agent stub. | `index.ts`, `ResearchSession.ts` |
| **Durable Objects** | `ResearchSession` uses `new_sqlite_classes` migration (SQLite-backed DO). One instance per session, keyed by session ID. | `wrangler.toml`, `ResearchSession.ts` |
| **D1 database** | Stores sessions, sources, text chunks with embeddings (JSON), and digests. All ingestion and retrieval goes through D1. | `worker/schema.sql`, `services/ingestion.ts`, `services/retrieval.ts` |
| **Workers AI (embeddings)** | `@cf/baai/bge-base-en-v1.5` generates 768-dim embeddings for all chunks and queries; cosine similarity retrieval selects top-6 relevant chunks per query. | `services/llm.ts`, `services/retrieval.ts` |
| **Original work** | End-to-end research assistant: session management, background URL ingestion, RAG chat, durable digest workflow, React 19 frontend — built from scratch using Cloudflare primitives. | Full codebase |
