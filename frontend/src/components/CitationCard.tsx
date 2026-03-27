import { useState } from "react";
import type { Citation } from "../lib/types";

interface Props {
  citation: Citation;
  index: number;
}

export default function CitationCard({ citation, index }: Props) {
  const [expanded, setExpanded] = useState(false);

  const displayTitle = citation.title ?? new URL(citation.url).hostname;

  return (
    <div
      className={`citation-card ${expanded ? "expanded" : ""}`}
      onClick={() => setExpanded((v) => !v)}
      title={expanded ? "Click to collapse" : "Click to expand snippet"}
    >
      <div className="citation-title">[{index + 1}] {displayTitle}</div>
      {expanded && (
        <>
          <div className="citation-snippet">{citation.snippet}</div>
          <div className="citation-url">
            <a href={citation.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              {citation.url}
            </a>
          </div>
        </>
      )}
      {!expanded && (
        <div className="citation-url">{citation.url}</div>
      )}
    </div>
  );
}
