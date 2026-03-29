import { useState, useEffect, useCallback } from "react";
import type { Source } from "../lib/types";
import { getSources, addSource, deleteSource, retrySource } from "../lib/api";
import StatusBadge from "./StatusBadge";

interface Props {
  sessionId: string;
}

// Poll interval while at least one source is queued or processing
const POLL_INTERVAL_MS = 3000;

export default function SourcePanel({ sessionId }: Props) {
  const [sources, setSources] = useState<Source[]>([]);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    try {
      const data = await getSources(sessionId);
      setSources(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load sources");
    }
  }, [sessionId]);

  // Initial load
  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // Poll while any source is in-progress
  useEffect(() => {
    const hasActive = sources.some(
      (s) => s.status === "queued" || s.status === "processing"
    );
    if (!hasActive) return;

    const timer = setInterval(fetchSources, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [sources, fetchSources]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setAdding(true);
    setAddError(null);
    try {
      const source = await addSource(sessionId, url.trim());
      setSources((prev) => [...prev, source]);
      setUrl("");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add source");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(sourceId: string) {
    try {
      await deleteSource(sourceId);
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete source");
    }
  }

  async function handleRetry(sourceId: string) {
    try {
      const updated = await retrySource(sourceId);
      setSources((prev) => prev.map((s) => (s.id === sourceId ? updated : s)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to retry source");
    }
  }

  const indexedCount = sources.filter((s) => s.status === "indexed").length;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Sources</div>
          {sources.length > 0 && (
            <div className="card-sub">
              {indexedCount} of {sources.length} indexed
            </div>
          )}
        </div>
      </div>

      <form className="source-form" onSubmit={handleAdd}>
        <input
          type="url"
          placeholder="https://example.com/article"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={adding || !url.trim()}>
          {adding ? <span className="spinner" style={{ width: 13, height: 13 }} /> : "Add"}
        </button>
      </form>

      {addError && <div className="error-msg">{addError}</div>}
      {loadError && <div className="error-msg">{loadError}</div>}

      {sources.length === 0 && !loadError && (
        <div className="info-msg">Add URLs above to start ingesting sources.</div>
      )}

      <div className="source-list">
        {sources.map((source, i) => (
          <div key={source.id} className="card" style={{ padding: "0.75rem", background: "var(--surface2)" }}>
            <div className="source-item">
              <div className="source-meta">
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--accent)", background: "var(--accent-light)", borderRadius: "4px", padding: "0.1rem 0.4rem", flexShrink: 0 }}>
                    #{i + 1}
                  </span>
                  {source.title ? (
                    <div className="source-title" title={source.title}>{source.title}</div>
                  ) : null}
                </div>
                <div className="source-url" style={{ paddingLeft: "1.6rem" }} title={source.url}>
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.url}
                  </a>
                </div>
                {source.errorMessage && (
                  <div className="source-error" title={source.errorMessage}>
                    {source.errorMessage}
                  </div>
                )}
              </div>
              <div className="source-actions">
                <StatusBadge status={source.status} />
              </div>
            </div>
            <div className="flex-row" style={{ marginTop: "0.5rem", gap: "0.4rem", justifyContent: "flex-end" }}>
              {source.status === "failed" && (
                <button className="btn btn-ghost btn-sm" onClick={() => handleRetry(source.id)}>
                  Retry
                </button>
              )}
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (window.confirm("Remove this source and its indexed content?")) {
                    handleDelete(source.id);
                  }
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
