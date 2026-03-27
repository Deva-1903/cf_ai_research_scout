import { Hono } from "hono";
import type { Env, SessionRow } from "../types";
import { newId } from "../utils/id";

const sessions = new Hono<{ Bindings: Env }>();

/** POST /api/sessions — create a new research session */
sessions.post("/", async (c) => {
  const body = await c.req.json<{
    title: string;
    researchQuestion: string;
    instructions?: string;
  }>();

  const { title, researchQuestion, instructions } = body;

  if (!title?.trim() || !researchQuestion?.trim()) {
    return c.json({ error: "title and researchQuestion are required" }, 400);
  }

  const id = newId();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO sessions (id, title, research_question, instructions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, title.trim(), researchQuestion.trim(), instructions?.trim() ?? null, now, now)
    .run();

  return c.json(
    {
      id,
      title: title.trim(),
      researchQuestion: researchQuestion.trim(),
      instructions: instructions?.trim() ?? null,
      createdAt: now,
      updatedAt: now,
    },
    201
  );
});

/** GET /api/sessions — list all sessions, newest first */
sessions.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM sessions ORDER BY created_at DESC LIMIT 50`
  ).all<SessionRow>();

  const result = (rows.results ?? []).map(toSession);
  return c.json(result);
});

/** GET /api/sessions/:id — get single session */
sessions.get("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT * FROM sessions WHERE id = ?")
    .bind(id)
    .first<SessionRow>();

  if (!row) return c.json({ error: "Session not found" }, 404);
  return c.json(toSession(row));
});

/** PUT /api/sessions/:id — update title / instructions */
sessions.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    title?: string;
    researchQuestion?: string;
    instructions?: string;
  }>();

  const existing = await c.env.DB.prepare("SELECT id FROM sessions WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();

  if (!existing) return c.json({ error: "Session not found" }, 404);

  const now = Date.now();
  await c.env.DB.prepare(
    `UPDATE sessions
     SET title = COALESCE(?, title),
         research_question = COALESCE(?, research_question),
         instructions = COALESCE(?, instructions),
         updated_at = ?
     WHERE id = ?`
  )
    .bind(
      body.title?.trim() ?? null,
      body.researchQuestion?.trim() ?? null,
      body.instructions?.trim() ?? null,
      now,
      id
    )
    .run();

  const updated = await c.env.DB.prepare("SELECT * FROM sessions WHERE id = ?")
    .bind(id)
    .first<SessionRow>();

  return c.json(toSession(updated!));
});

/** DELETE /api/sessions/:id — delete session and cascade */
sessions.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT id FROM sessions WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();

  if (!existing) return c.json({ error: "Session not found" }, 404);

  // Delete in dependency order (D1 doesn't cascade automatically unless ON DELETE CASCADE)
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM chat_messages WHERE session_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM chunks WHERE session_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM sources WHERE session_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM digests WHERE session_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id),
  ]);

  return c.json({ deleted: true });
});

function toSession(row: SessionRow) {
  return {
    id: row.id,
    title: row.title,
    researchQuestion: row.research_question,
    instructions: row.instructions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default sessions;
