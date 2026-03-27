import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import type { Session, Source } from "../lib/types";
import { getSession, getSources } from "../lib/api";
import SourcePanel from "../components/SourcePanel";
import ChatPanel from "../components/ChatPanel";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    Promise.all([getSession(id), getSources(id)])
      .then(([sess, srcs]) => {
        setSession(sess);
        setSources(srcs);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load session"))
      .finally(() => setLoading(false));
  }, [id]);

  // Keep sources in sync for the "has indexed sources" check (SourcePanel owns its own polling)
  // We poll sources lightly here just to know if chat is ready
  useEffect(() => {
    if (!id) return;
    const timer = setInterval(async () => {
      try {
        const srcs = await getSources(id);
        setSources(srcs);
      } catch {
        // ignore
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [id]);

  if (loading) {
    return (
      <div className="flex-row" style={{ padding: "2rem 0", gap: "0.75rem" }}>
        <span className="spinner" /> Loading session…
      </div>
    );
  }

  if (error || !session) {
    return (
      <>
        <Link to="/" className="back-link">← Back</Link>
        <div className="error-msg">{error ?? "Session not found"}</div>
      </>
    );
  }

  const hasIndexedSources = sources.some((s) => s.status === "indexed");

  return (
    <>
      <Link to="/" className="back-link">← All Sessions</Link>

      <div className="session-header">
        <h1 className="session-title">{session.title}</h1>
        <p className="session-question">{session.researchQuestion}</p>
        {session.instructions && (
          <p className="session-instructions">Instructions: {session.instructions}</p>
        )}
      </div>

      <div className="session-layout">
        {/* Left column — sources */}
        <div>
          <SourcePanel sessionId={session.id} />
        </div>

        {/* Right column — chat */}
        <div>
          <ChatPanel sessionId={session.id} hasIndexedSources={hasIndexedSources} />
        </div>
      </div>
    </>
  );
}
