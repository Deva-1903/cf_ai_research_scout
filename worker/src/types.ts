// Shared types for the worker.

export type SourceStatus = "queued" | "processing" | "indexed" | "failed";
export type MessageRole = "user" | "assistant";

export interface Session {
  id: string;
  title: string;
  researchQuestion: string;
  instructions: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Source {
  id: string;
  sessionId: string;
  url: string;
  title: string | null;
  status: SourceStatus;
  errorMessage: string | null;
  createdAt: number;
}

export interface Chunk {
  id: string;
  sourceId: string;
  sessionId: string;
  text: string;
  embedding: number[] | null;
  chunkOrder: number;
  createdAt: number;
}

export interface Citation {
  sourceId: string;
  url: string;
  title: string | null;
  snippet: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  citations: Citation[] | null;
  createdAt: number;
}

export interface Digest {
  id: string;
  sessionId: string;
  content: string;
  createdAt: number;
}

// D1 row shapes (snake_case from SQL)
export interface SessionRow {
  id: string;
  title: string;
  research_question: string;
  instructions: string | null;
  created_at: number;
  updated_at: number;
}

export interface SourceRow {
  id: string;
  session_id: string;
  url: string;
  title: string | null;
  status: SourceStatus;
  error_message: string | null;
  created_at: number;
}

export interface ChunkRow {
  id: string;
  source_id: string;
  session_id: string;
  text: string;
  embedding: string | null;
  chunk_order: number;
  created_at: number;
}

export interface ChatMessageRow {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  citations: string | null;
  created_at: number;
}

// State stored in the ResearchSession AIChatAgent DO
export interface SessionState {
  title: string;
  researchQuestion: string;
  instructions: string | null;
  sources: Array<{
    id: string;
    url: string;
    title: string | null;
    status: SourceStatus;
    errorMessage: string | null;
  }>;
  initialized: boolean;
}

// Env bindings — binding names must match wrangler.toml exactly
export interface Env {
  AI: Ai;
  DB: D1Database;
  // DO binding name = "ResearchSession" (routeAgentRequest uses this to route /agents/research-session/:id)
  ResearchSession: DurableObjectNamespace;
  DIGEST_WORKFLOW: Workflow;
  FRONTEND_ORIGIN?: string;
}
