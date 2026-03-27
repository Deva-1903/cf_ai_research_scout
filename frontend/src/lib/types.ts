// Frontend-side type definitions — mirror worker/src/types.ts

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
