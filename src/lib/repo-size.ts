import type { Repository } from "@/types";
import { formatBytes } from "@/lib/utils";

/**
 * How big a repository is, as a reader means it (#958).
 *
 * From backend 1.11.0 (artifact-keeper#4423) a virtual repository reports
 * `storage_used_bytes: 0`, because it stores nothing of its own, and the
 * size of the members the caller can see as `member_storage_used_bytes`.
 * Showing the bare 0 would read as "empty"; showing the old member sum as the
 * repository's own bytes is what double-counted in totals. So a virtual
 * repository with the new field reads "<size> in members", everything else
 * reads its own bytes. Totals across repositories must keep summing
 * `storage_used_bytes` and never use this.
 */
export function repoSizeLabel(
  repo: Pick<Repository, "repo_type" | "storage_used_bytes" | "member_storage_used_bytes">,
): { text: string; members: boolean } {
  if (repo.repo_type === "virtual" && typeof repo.member_storage_used_bytes === "number") {
    return { text: `${formatBytes(repo.member_storage_used_bytes)} in members`, members: true };
  }
  return { text: formatBytes(repo.storage_used_bytes), members: false };
}

/** The repository header's size line: "<size> used", or "<size> in members". */
export function repoHeaderSize(
  repo: Pick<Repository, "repo_type" | "storage_used_bytes" | "member_storage_used_bytes">,
): string {
  const { text, members } = repoSizeLabel(repo);
  return members ? text : `${text} used`;
}
