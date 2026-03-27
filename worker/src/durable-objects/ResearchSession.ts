import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { callable } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import {
  convertToModelMessages,
  pruneMessages,
  streamText,
} from "ai";
import type { Env, SessionRow, SessionState, SourceRow } from "../types";
import { retrieveRelevantChunks } from "../services/retrieval";
import { ingestSource } from "../services/ingestion";
import { buildSystemPrompt, buildContextBlock } from "../prompts/system";
import { newId } from "../utils/id";

export class ResearchSession extends AIChatAgent<Env, SessionState> {
  /** Sync session + source state from D1 on every DO wake-up. */
  async onStart() {
    if (!this.state?.initialized) {
      await this.syncFromD1();
    } else {
      // Refresh sources list so the UI state is current
      await this.refreshSources();
    }
  }

  /** Full initialisation: load session metadata + sources from D1. */
  private async syncFromD1() {
    const session = await this.env.DB.prepare(
      "SELECT * FROM sessions WHERE id = ?"
    )
      .bind(this.name)
      .first<SessionRow>();

    if (!session) return; // Session created via REST first; DO may wake before it exists

    const sources = await this.loadSourcesFromD1();

    this.setState({
      title: session.title,
      researchQuestion: session.research_question,
      instructions: session.instructions,
      sources,
      initialized: true,
    });
  }

  /** Refresh only the sources list (called after ingestion status changes). */
  private async refreshSources() {
    const sources = await this.loadSourcesFromD1();
    this.setState({ ...this.state, sources });
  }

  private async loadSourcesFromD1() {
    const rows = await this.env.DB.prepare(
      "SELECT * FROM sources WHERE session_id = ? ORDER BY created_at ASC"
    )
      .bind(this.name)
      .all<SourceRow>();

    return (rows.results ?? []).map((r) => ({
      id: r.id,
      url: r.url,
      title: r.title,
      status: r.status,
      errorMessage: r.error_message,
    }));
  }

  /**
   * Called for every incoming chat message.
   * Performs RAG retrieval via the rag_search tool and streams the response.
   */
  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const workersai = createWorkersAI({ binding: this.env.AI });

    // Extract the latest user message text for RAG retrieval.
    // this.messages is UIMessage[] (AI SDK v6); find the last user text part.
    const lastUser = [...this.messages].reverse().find((m) => m.role === "user");
    const query = lastUser?.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ")
      .trim() ?? "";

    // Pre-retrieve relevant chunks before calling the LLM.
    // Workers AI Llama models don't support structured tool-calling via
    // workers-ai-provider (causes error 1031), so we do RAG retrieval here
    // and inject the context directly into the system prompt instead.
    const chunks = query ? await retrieveRelevantChunks(query, this.name, this.env) : [];

    const system =
      buildSystemPrompt({
        researchQuestion: this.state?.researchQuestion ?? "General research",
        instructions: this.state?.instructions ?? null,
      }) +
      "\n\n" +
      buildContextBlock(
        chunks.map((c) => ({
          text: c.text,
          sourceUrl: c.sourceUrl,
          sourceTitle: c.sourceTitle,
        }))
      );

    const result = streamText({
      abortSignal: options?.abortSignal,
      model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
      system,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
      }),
    });

    return result.toUIMessageStreamResponse();
  }

  /**
   * @callable — lets the frontend agent stub invoke this directly:
   *   await agent.addSourceFromChat("https://example.com")
   *
   * Used when the user pastes a URL in chat. REST source management
   * (SourcePanel) still goes through the Hono API.
   */
  @callable()
  async addSourceFromChat(
    url: string
  ): Promise<{ sourceId: string; message: string }> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { sourceId: "", message: `Invalid URL: ${url}` };
    }

    const sourceId = newId();
    const now = Date.now();

    await this.env.DB.prepare(
      `INSERT INTO sources (id, session_id, url, title, status, created_at)
       VALUES (?, ?, ?, NULL, 'queued', ?)`
    )
      .bind(sourceId, this.name, parsed.href, now)
      .run();

    // Ingest in background; refresh state when done
    this.ctx.waitUntil(
      ingestSource(sourceId, parsed.href, this.name, this.env).then(() =>
        this.refreshSources()
      )
    );

    await this.refreshSources();
    return { sourceId, message: `Started ingesting ${parsed.href}` };
  }
}
