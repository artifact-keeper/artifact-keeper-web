import { StatusBadge } from "@/components/common/status-badge";
import type { McpServerStatus } from "@/types/mcp";

const COLORS = {
  active: "green",
  deprecated: "yellow",
  deleted: "red",
  held: "purple",
} as const;

/** Registry status of a version, plus `held` (served to no client). */
export function McpStatusBadge({ status }: { status: McpServerStatus | "held" }) {
  return <StatusBadge status={status} color={COLORS[status] ?? "default"} />;
}
