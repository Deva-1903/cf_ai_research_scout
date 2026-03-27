import { useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { isTextUIPart } from "ai";
import type { Digest } from "../lib/types";
import { generateDigest } from "../lib/api";

/**
 * Workers AI Llama models sometimes emit their tool-call intent as a raw JSON
 * text token before the actual structured tool call fires. Detect and hide it
 * so users don't see the plumbing.
 */
function isRawToolCall(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith("{")) return false;
  try {
    const obj = JSON.parse(t) as Record<string, unknown>;
    return typeof obj.name === "string" && ("parameters" in obj || "arguments" in obj);
  } catch {
    return false;
  }
}

interface Props {
  sessionId: string;
  hasIndexedSources: boolean;
}

// In production set VITE_WORKER_URL to the deployed worker URL, e.g.
//   VITE_WORKER_URL=https://cf-ai-research-scout.devaags999.workers.dev
// In dev the Vite proxy handles /agents/* → localhost:8787
const workerHost = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? undefined;

export default function ChatPanel({ sessionId, hasIndexedSources }: Props) {
  const [input, setInput] = useState("");
  const [digestLoading, setDigestLoading] = useState(false);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [digestError, setDigestError] = useState<string | null>(null);
  const [digestOpen, setDigestOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const agent = useAgent({
    agent: "research-session",
    name: sessionId,
    host: workerHost,
  });

  const { messages, sendMessage, status } = useAgentChat({
    agent,
    onFinish: () => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage({ text });
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend(e as unknown as React.FormEvent);
    }
  }

  async function handleDigest() {
    setDigestLoading(true);
    setDigestError(null);
    try {
      const d = await generateDigest(sessionId);
      setDigest(d);
      setDigestOpen(true);
    } catch (err) {
      setDigestError(err instanceof Error ? err.message : "Failed to generate digest");
    } finally {
      setDigestLoading(false);
    }
  }

  return (
    <>
      {/* ── Chat card (fixed viewport height, internal scroll) ── */}
      <div className="card chat-panel">
        <div className="card-header" style={{ paddingBottom: "0.75rem", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div className="card-title">Research Chat</div>
          {!hasIndexedSources && (
            <span style={{ fontSize: "0.78rem", color: "var(--warning)" }}>
              ⚠ No indexed sources yet
            </span>
          )}
        </div>

        <div className="messages-area">
          {messages.length === 0 && (
            <div className="empty-state" style={{ padding: "2rem 0" }}>
              <div className="icon">💬</div>
              <div>Ask a question to get started.</div>
              {!hasIndexedSources && (
                <div style={{ marginTop: "0.5rem", fontSize: "0.82rem" }}>
                  Add and index sources first for grounded answers.
                </div>
              )}
            </div>
          )}

          {messages.map((msg) => {
            if (msg.role !== "user" && msg.role !== "assistant") return null;

            const textContent = msg.parts
              .filter(isTextUIPart)
              .map((p) => p.text)
              .join("");

            // Workers AI streams tool calls as plain text JSON — skip them
            if (!textContent || isRawToolCall(textContent)) return null;

            return (
              <div key={msg.id} className={`message ${msg.role}`}>
                <div className="message-bubble">{textContent}</div>
              </div>
            );
          })}

          {isLoading && (
            <div className="message assistant">
              <div className="message-bubble" style={{ color: "var(--text-muted)" }}>
                <span className="pulse">Thinking…</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form className="chat-input-area" onSubmit={handleSend} style={{ flexShrink: 0 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
            disabled={isLoading}
            rows={2}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading || !input.trim()}
            style={{ alignSelf: "flex-end" }}
          >
            {isLoading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : "Send"}
          </button>
        </form>
      </div>

      {/* ── Digest section (separate card below, doesn't affect chat height) ── */}
      <div className="card" style={{ marginTop: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <div className="card-title" style={{ fontSize: "0.9rem" }}>Research Digest</div>
            <div className="card-sub">Summarise all indexed sources into a brief</div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleDigest}
            disabled={digestLoading || !hasIndexedSources}
            title={!hasIndexedSources ? "Index at least one source first" : undefined}
            style={{ flexShrink: 0 }}
          >
            {digestLoading
              ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Generating…</>
              : digest ? "Regenerate" : "Generate"}
          </button>
        </div>

        {digestError && <div className="error-msg" style={{ marginTop: "0.75rem" }}>{digestError}</div>}

        {digest && (
          <div style={{ marginTop: "0.75rem" }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setDigestOpen((o) => !o)}
              style={{ marginBottom: "0.5rem", fontSize: "0.78rem" }}
            >
              {digestOpen ? "▲ Hide" : "▼ Show"} digest — {new Date(digest.createdAt).toLocaleString()}
            </button>
            {digestOpen && (
              <div className="digest-content">{digest.content}</div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
