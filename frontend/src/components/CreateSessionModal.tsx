import { useState } from "react";
import type { Session } from "../lib/types";
import { createSession } from "../lib/api";

interface Props {
  onCreated: (session: Session) => void;
  onClose: () => void;
}

export default function CreateSessionModal({ onCreated, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !question.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const session = await createSession({
        title: title.trim(),
        researchQuestion: question.trim(),
        instructions: instructions.trim() || undefined,
      });
      onCreated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">New Research Session</div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="sess-title">Session Title</label>
            <input
              id="sess-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Spark ETL Optimization"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="sess-question">Research Question</label>
            <textarea
              id="sess-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. What are the best techniques for optimizing Spark ETL pipelines at scale?"
              required
              rows={3}
            />
          </div>
          <div className="form-group">
            <label htmlFor="sess-instructions">Custom Instructions <span style={{ fontStyle: "italic" }}>(optional)</span></label>
            <input
              id="sess-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder='e.g. "focus on open-source tools" or "be concise"'
            />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !title.trim() || !question.trim()}>
              {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Creating…</> : "Create Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
