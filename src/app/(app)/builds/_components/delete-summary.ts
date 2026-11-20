import type { BuildDeleteResult } from "@/types/builds";

/** Toast text for a bulk delete: what went, and why the rest stayed */
export function deleteSummary(result: BuildDeleteResult): string {
  const deleted = result.deleted.length;
  const parts = [`${deleted} ${deleted === 1 ? "build" : "builds"} deleted`];
  const forbidden = result.failed.filter((f) => f.reason === "forbidden").length;
  const gone = result.failed.length - forbidden;
  if (forbidden > 0) {
    parts.push(`${forbidden} kept, only their creator or an admin can delete them`);
  }
  if (gone > 0) {
    parts.push(`${gone} already gone`);
  }
  return parts.join(", ");
}
