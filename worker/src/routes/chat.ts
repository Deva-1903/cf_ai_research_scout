import { Hono } from "hono";
import type { Env } from "../types";

// Chat messages are now handled by the ResearchSession AIChatAgent via WebSocket.
// This file only handles the digest REST endpoints.

const chatRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /api/sessions/:id/digest
 * Creates a DigestWorkflow instance for the session.
 * Returns immediately with the workflow ID; use GET to check when ready.
 */
chatRoutes.post("/sessions/:id/digest", async (c) => {
  const sessionId = c.req.param("id");

  const session = await c.env.DB.prepare("SELECT id FROM sessions WHERE id = ?")
    .bind(sessionId)
    .first<{ id: string }>();

  if (!session) return c.json({ error: "Session not found" }, 404);

  // Check that there are indexed sources
  const indexed = await c.env.DB.prepare(
    "SELECT COUNT(*) as n FROM sources WHERE session_id = ? AND status = 'indexed'"
  )
    .bind(sessionId)
    .first<{ n: number }>();

  if (!indexed || indexed.n === 0) {
    return c.json({ error: "No indexed sources found for this session" }, 400);
  }

  const instance = await c.env.DIGEST_WORKFLOW.create({
    params: { sessionId },
  });

  return c.json({ workflowId: instance.id, status: "started" });
});

/**
 * GET /api/sessions/:id/digest
 * Returns the most recent stored digest for the session, or { ready: false }
 * if the workflow hasn't completed yet.
 */
chatRoutes.get("/sessions/:id/digest", async (c) => {
  const sessionId = c.req.param("id");

  const row = await c.env.DB.prepare(
    `SELECT id, session_id, content, created_at
     FROM digests WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`
  )
    .bind(sessionId)
    .first<{ id: string; session_id: string; content: string; created_at: number }>();

  if (!row) return c.json({ ready: false });

  return c.json({
    ready: true,
    id: row.id,
    sessionId: row.session_id,
    content: row.content,
    createdAt: row.created_at,
  });
});

export default chatRoutes;
