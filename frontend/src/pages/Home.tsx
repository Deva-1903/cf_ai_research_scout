import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "../lib/types";
import { getSessions, deleteSession } from "../lib/api";
import SessionCard from "../components/SessionCard";
import CreateSessionModal from "../components/CreateSessionModal";

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getSessions()
      .then(setSessions)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load sessions"))
      .finally(() => setLoading(false));
  }, []);

  function handleCreated(session: Session) {
    setShowModal(false);
    navigate(`/session/${session.id}`);
  }

  async function handleDelete(id: string) {
    try {
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete session");
    }
  }

  return (
    <>
      <div className="home-header">
        <div className="flex-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 className="home-title">Research Scout</h1>
            <p className="home-sub">
              Create a research session, add sources, and chat with an AI grounded in your material.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + New Session
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex-row" style={{ gap: "0.75rem" }}>
          <span className="spinner" /> Loading sessions…
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}

      {!loading && !error && sessions.length === 0 && (
        <div className="empty-state">
          <div className="icon">🔭</div>
          <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>No research sessions yet</div>
          <div style={{ marginBottom: "1.25rem" }}>Create one to start ingesting sources and asking questions.</div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            Create your first session
          </button>
        </div>
      )}

      {!loading && sessions.length > 0 && (
        <div className="sessions-grid">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showModal && (
        <CreateSessionModal onCreated={handleCreated} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
