import type { Env, ChunkRow, Citation } from "../types";
import { embed } from "./llm";

const TOP_K = 6; // number of chunks to retrieve per question
const SIMILARITY_THRESHOLD = 0.2; // minimum cosine similarity to include a chunk

/** Compute cosine similarity between two equal-length float vectors. */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export interface RetrievedChunk {
  chunkId: string;
  sourceId: string;
  sourceUrl: string;
  sourceTitle: string | null;
  text: string;
  score: number;
}

/**
 * Retrieve the top-K most relevant chunks from a session for a given query.
 * Uses cosine similarity over stored embeddings.
 */
export async function retrieveRelevantChunks(
  query: string,
  sessionId: string,
  env: Env
): Promise<RetrievedChunk[]> {
  // Load all indexed chunks first — if none exist, skip the AI embedding call entirely
  const rows = await env.DB.prepare(
    `SELECT c.id, c.source_id, c.text, c.embedding, c.chunk_order,
            s.url as source_url, s.title as source_title
     FROM chunks c
     JOIN sources s ON s.id = c.source_id
     WHERE c.session_id = ? AND c.embedding IS NOT NULL AND s.status = 'indexed'
     ORDER BY c.source_id, c.chunk_order`
  )
    .bind(sessionId)
    .all<ChunkRow & { source_url: string; source_title: string | null }>();

  if (!rows.results || rows.results.length === 0) {
    return [];
  }

  // Generate query embedding — if the AI call fails, fall back to no retrieval
  // rather than crashing the entire chat request (e.g. on transient 1031 errors)
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embed(query, env);
  } catch {
    return [];
  }

  // Score each chunk
  const scored: RetrievedChunk[] = rows.results
    .map((row) => {
      const embedding: number[] = JSON.parse(row.embedding ?? "null");
      if (!embedding) return null;

      const score = cosineSimilarity(queryEmbedding, embedding);
      return {
        chunkId: row.id,
        sourceId: row.source_id,
        sourceUrl: row.source_url,
        sourceTitle: row.source_title,
        text: row.text,
        score,
      };
    })
    .filter((item): item is RetrievedChunk => item !== null && item.score >= SIMILARITY_THRESHOLD);

  // Sort by score descending and take top-K
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, TOP_K);
}

/**
 * Convert retrieved chunks into citation objects for the response payload.
 * De-duplicates by sourceId, using the highest-scored chunk snippet per source.
 */
export function buildCitations(chunks: RetrievedChunk[]): Citation[] {
  const seen = new Map<string, Citation>();

  for (const chunk of chunks) {
    if (!seen.has(chunk.sourceId)) {
      seen.set(chunk.sourceId, {
        sourceId: chunk.sourceId,
        url: chunk.sourceUrl,
        title: chunk.sourceTitle,
        snippet: chunk.text.slice(0, 300) + (chunk.text.length > 300 ? "…" : ""),
      });
    }
  }

  return Array.from(seen.values());
}
