// Stub for H1's risk badges (replaced by the owner's version at merge).
import type { McpRiskLevel, McpRiskSignal } from "@/lib/mcp/risk";

export function McpRiskBadges({ signals, max }: { signals: McpRiskSignal[]; max?: number }) {
  return <span>{signals.slice(0, max ?? signals.length).map((s) => s.label).join(", ")}</span>;
}

export function McpRiskLevelBadge({ level, score }: { level: McpRiskLevel; score?: number }) {
  return (
    <span>
      {level}
      {score === undefined ? "" : ` ${score}`}
    </span>
  );
}
