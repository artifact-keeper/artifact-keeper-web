import type { McpLintFinding, McpReview, McpToolDiff } from "@/types/mcp";
import { assessRisk, type McpRiskLevel } from "@/lib/mcp/risk";

/**
 * Pure formatting for MCP approval-queue rows (artifact-keeper#5253, lens-ui
 * 4.2). Kept out of the component so the summaries are unit-tested on their
 * own and the row stays a flat render.
 */

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** `{ block: 1, review: 2 }` from a review's lint findings. */
export function lintCounts(findings: McpLintFinding[] | undefined): { block: number; review: number } {
  let block = 0;
  let review = 0;
  for (const f of findings ?? []) {
    if (f.action === "block") block += 1;
    else review += 1;
  }
  return { block, review };
}

/** "1 blocking, 2 to review", or null when the lint pass found nothing. */
export function lintSummary(findings: McpLintFinding[] | undefined): string | null {
  const { block, review } = lintCounts(findings);
  const parts: string[] = [];
  if (block > 0) parts.push(`${block} blocking`);
  if (review > 0) parts.push(`${review} to review`);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** "Tools: +3 added, 1 changed" (decision 4, section 8), or null when unchanged. */
export function toolDiffSummary(diff: McpToolDiff | null | undefined): string | null {
  if (!diff) return null;
  const parts: string[] = [];
  if (diff.added.length > 0) parts.push(`+${diff.added.length} added`);
  if (diff.removed.length > 0) parts.push(`-${diff.removed.length} removed`);
  if (diff.changed.length > 0) parts.push(`${diff.changed.length} changed`);
  return parts.length > 0 ? `Tools: ${parts.join(", ")}` : null;
}

/** The version the row would pin: the existing pin, else the upstream latest. */
export function reviewVersion(review: McpReview): string | null {
  return review.version ?? review.server?.version ?? null;
}

/**
 * Risk level of a queued upstream entry. Only the document is known before
 * approval (no pins, no health, no source tag on the queued document), so
 * this is the publisher-side reading; a tool diff counts as drift.
 */
export function reviewRisk(review: McpReview): { level: McpRiskLevel; score: number } | null {
  if (!review.server) return null;
  const changed = !!review.tool_diff && toolDiffSummary(review.tool_diff) !== null;
  const { level, score } = assessRisk({ server: review.server, toolDrift: changed });
  return { level, score };
}
