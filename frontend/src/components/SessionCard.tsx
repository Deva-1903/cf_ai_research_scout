import { Link } from "react-router-dom";
import type { Session } from "../lib/types";

interface Props {
  session: Session;
  onDelete: (id: string) => void;
}

export default function SessionCard({ session, onDelete }: Props) {
  const date = new Date(session.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="card">
      <div className="card-header">
        <div style={{ minWidth: 0 }}>
          <div className="card-title" style={{ marginBottom: "0.25rem" }}>
            <Link to={`/session/${session.id}`}>{session.title}</Link>
          </div>
          <div className="card-sub" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {session.researchQuestion}
          </div>
          {session.instructions && (
            <div className="session-instructions" style={{ marginTop: "0.3rem" }}>
              {session.instructions}
            </div>
          )}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (window.confirm("Delete this session and all its data?")) {
              onDelete(session.id);
            }
          }}
          title="Delete session"
          style={{ flexShrink: 0 }}
        >
          ✕
        </button>
      </div>
      <div className="flex-row" style={{ marginTop: "0.5rem" }}>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{date}</span>
        <Link to={`/session/${session.id}`} className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }}>
          Open →
        </Link>
      </div>
    </div>
  );
}
