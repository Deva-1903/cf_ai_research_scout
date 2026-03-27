import type { SourceStatus } from "../lib/types";

const LABELS: Record<SourceStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  indexed: "Indexed",
  failed: "Failed",
};

const ICONS: Record<SourceStatus, string> = {
  queued: "⏳",
  processing: "⚙️",
  indexed: "✓",
  failed: "✕",
};

interface Props {
  status: SourceStatus;
}

export default function StatusBadge({ status }: Props) {
  const isAnimated = status === "processing";
  return (
    <span className={`badge badge-${status}`}>
      <span className={isAnimated ? "pulse" : ""}>{ICONS[status]}</span>
      {LABELS[status]}
    </span>
  );
}
