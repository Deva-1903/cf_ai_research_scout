import { Hono } from "hono";
import type { Env, SourceRow } from "../types";
import { newId } from "../utils/id";
import { ingestSource } from "../services/ingestion";

const sources = new Hono<{ Bindings: Env }>();

/** POST /api/sessions/:id/sources — add a URL to a session */
sources.post("/sessions/:id/sources", async (c) => {
  const sessionId = c.req.param("id");
  const body = await c.req.json<{ url: string }>();

  const { url } = body;
  if (!url?.trim()) return c.json({ error: "url is required" }, 400);

  // Basic URL validation
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return c.json({ error: "Invalid URL" }, 400);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return c.json({ error: "Only http and https URLs are supported" }, 400);
  }

  // Verify session exists
  const session = await c.env.DB.prepare(
    "SELECT id, research_question, title FROM sessions WHERE id = ?"
  )
    .bind(sessionId)
    .first<{ id: string; research_question: string; title: string }>();

  if (!session) return c.json({ error: "Session not found" }, 404);

  // Prevent duplicate URLs in the same session
  const duplicate = await c.env.DB.prepare(
    "SELECT id FROM sources WHERE session_id = ? AND url = ?"
  )
    .bind(sessionId, parsed.href)
    .first<{ id: string }>();

  if (duplicate) {
    return c.json({ error: "This URL has already been added to the session" }, 409);
  }

  const sourceId = newId();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO sources (id, session_id, url, title, status, created_at)
     VALUES (?, ?, ?, NULL, 'queued', ?)`
  )
    .bind(sourceId, sessionId, parsed.href, now)
    .run();

  // Run ingestion in the background — DO not block the response
  c.executionCtx.waitUntil(ingestSource(sourceId, parsed.href, sessionId, c.env));

  return c.json(
    {
      id: sourceId,
      sessionId,
      url: parsed.href,
      title: null,
      status: "queued",
      errorMessage: null,
      createdAt: now,
    },
    201
  );
});

/** GET /api/sessions/:id/sources — list sources for a session */
sources.get("/sessions/:id/sources", async (c) => {
  const sessionId = c.req.param("id");

  const rows = await c.env.DB.prepare(
    "SELECT * FROM sources WHERE session_id = ? ORDER BY created_at ASC"
  )
    .bind(sessionId)
    .all<SourceRow>();

  return c.json((rows.results ?? []).map(toSource));
});

/** DELETE /api/sources/:id — delete a source and its chunks */
sources.delete("/sources/:id", async (c) => {
  const sourceId = c.req.param("id");

  const existing = await c.env.DB.prepare("SELECT id FROM sources WHERE id = ?")
    .bind(sourceId)
    .first<{ id: string }>();

  if (!existing) return c.json({ error: "Source not found" }, 404);

  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM chunks WHERE source_id = ?").bind(sourceId),
    c.env.DB.prepare("DELETE FROM sources WHERE id = ?").bind(sourceId),
  ]);

  return c.json({ deleted: true });
});

/** POST /api/sources/:id/retry — re-queue a failed source for ingestion */
sources.post("/sources/:id/retry", async (c) => {
  const sourceId = c.req.param("id");

  const row = await c.env.DB.prepare("SELECT * FROM sources WHERE id = ?")
    .bind(sourceId)
    .first<SourceRow>();

  if (!row) return c.json({ error: "Source not found" }, 404);
  if (row.status === "processing") {
    return c.json({ error: "Source is currently being processed" }, 409);
  }

  // Clear old chunks and reset status
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM chunks WHERE source_id = ?").bind(sourceId),
    c.env.DB.prepare(
      "UPDATE sources SET status = 'queued', error_message = NULL WHERE id = ?"
    ).bind(sourceId),
  ]);

  // Re-queue ingestion in the background
  c.executionCtx.waitUntil(ingestSource(sourceId, row.url, row.session_id, c.env));

  return c.json(toSource({ ...row, status: "queued", error_message: null }));
});

function toSource(row: SourceRow) {
  return {
    id: row.id,
    sessionId: row.session_id,
    url: row.url,
    title: row.title,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export default sources;
