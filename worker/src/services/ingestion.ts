import type { Env } from "../types";
import { extractTextFromHtml, extractTitle } from "../utils/html";
import { chunkText } from "../utils/chunking";
import { embedBatch } from "./llm";
import { newId } from "../utils/id";

const FETCH_TIMEOUT_MS = 25_000;
const MAX_TEXT_LENGTH = 50_000; // cap text per source to keep embedding costs reasonable

/**
 * Ingest a single source URL for a session.
 * Fetches the page, extracts text, chunks it, generates embeddings,
 * and stores everything in D1. Updates source status throughout.
 *
 * This runs inside ctx.waitUntil() — it must not throw uncaught errors.
 */
export async function ingestSource(
  sourceId: string,
  url: string,
  sessionId: string,
  env: Env
): Promise<void> {
  try {
    // Mark source as processing
    await env.DB.prepare(
      "UPDATE sources SET status = 'processing' WHERE id = ?"
    )
      .bind(sourceId)
      .run();

    // Fetch the URL
    const controller = new AbortController();
    const timer: ReturnType<typeof setTimeout> = setTimeout(
      () => controller.abort(),
      FETCH_TIMEOUT_MS
    );

    let html: string;

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; ResearchScoutBot/1.0; +https://cf-ai-research-scout.pages.dev)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
        throw new Error(`Unsupported content type: ${contentType}`);
      }

      html = await response.text();
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }

    // Extract text and title
    const rawText = extractTextFromHtml(html);
    const pageTitle = extractTitle(html);
    const text = rawText.slice(0, MAX_TEXT_LENGTH);

    if (text.trim().length < 50) {
      throw new Error("Fetched page contains too little extractable text");
    }

    // Update source title
    if (pageTitle) {
      await env.DB.prepare("UPDATE sources SET title = ? WHERE id = ?")
        .bind(pageTitle, sourceId)
        .run();
    }

    // Chunk the text
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      throw new Error("No text chunks could be extracted from the page");
    }

    // Generate embeddings in batch
    const embeddings = await embedBatch(chunks, env);

    // Store chunks with embeddings
    const now = Date.now();
    const insertStmts = chunks.map((text, order) => {
      const embedding = embeddings[order] ?? null;
      return env.DB.prepare(
        `INSERT INTO chunks (id, source_id, session_id, text, embedding, chunk_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        newId(),
        sourceId,
        sessionId,
        text,
        embedding ? JSON.stringify(embedding) : null,
        order,
        now
      );
    });

    // D1 batch insert
    await env.DB.batch(insertStmts);

    // Mark source as indexed
    await env.DB.prepare(
      "UPDATE sources SET status = 'indexed' WHERE id = ?"
    )
      .bind(sourceId)
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await env.DB.prepare(
      "UPDATE sources SET status = 'failed', error_message = ? WHERE id = ?"
    )
      .bind(message.slice(0, 500), sourceId)
      .run();
  }
}
