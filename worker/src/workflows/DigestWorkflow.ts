import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";
import type { Env } from "../types";
import { buildDigestPrompt } from "../prompts/system";
import { newId } from "../utils/id";

type DigestParams = { sessionId: string };

/**
 * DigestWorkflow — a multi-step Cloudflare Workflow that:
 *   1. Loads all indexed chunks for the session from D1
 *   2. Generates a structured digest via Workers AI
 *   3. Persists the result to D1
 *
 * Each step is durable: if the workflow is interrupted, it resumes
 * from the last completed step rather than restarting from scratch.
 *
 * Triggered via: env.DIGEST_WORKFLOW.create({ params: { sessionId } })
 */
export class DigestWorkflow extends WorkflowEntrypoint<Env, DigestParams> {
  async run(event: WorkflowEvent<DigestParams>, step: WorkflowStep) {
    const { sessionId } = event.payload;

    // Step 1 — Load chunks from D1
    const chunks = await step.do("load-chunks", async () => {
      const rows = await this.env.DB.prepare(
        `SELECT c.text, s.url AS source_url, s.title AS source_title
         FROM chunks c
         JOIN sources s ON s.id = c.source_id
         WHERE c.session_id = ? AND s.status = 'indexed'
         ORDER BY c.source_id, c.chunk_order
         LIMIT 40`
      )
        .bind(sessionId)
        .all<{ text: string; source_url: string; source_title: string | null }>();
      return rows.results ?? [];
    });

    // Step 2 — Load session metadata
    const session = await step.do("load-session", async () => {
      return await this.env.DB.prepare(
        "SELECT research_question, instructions FROM sessions WHERE id = ?"
      )
        .bind(sessionId)
        .first<{ research_question: string; instructions: string | null }>();
    });

    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (chunks.length === 0) throw new Error("No indexed sources to digest");

    // Step 3 — Generate digest with Workers AI
    const digest = await step.do("generate-digest", async () => {
      const prompt = buildDigestPrompt({
        researchQuestion: session.research_question,
        chunks: chunks.map((c) => ({
          text: c.text,
          sourceUrl: c.source_url,
          sourceTitle: c.source_title,
        })),
      });

      // Use the generation model directly — no AI SDK needed here
      const result = await this.env.AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as Parameters<
          typeof this.env.AI.run
        >[0],
        {
          messages: [{ role: "user" as const, content: prompt }],
          max_tokens: 2000,
        }
      );

      const response = (result as { response?: string }).response;
      if (!response) throw new Error("AI returned empty digest");
      return response.trim();
    });

    // Step 4 — Persist to D1
    await step.do("store-digest", async () => {
      await this.env.DB.prepare(
        "INSERT INTO digests (id, session_id, content, created_at) VALUES (?, ?, ?, ?)"
      )
        .bind(newId(), sessionId, digest, Date.now())
        .run();
    });

    return { success: true, sessionId };
  }
}
