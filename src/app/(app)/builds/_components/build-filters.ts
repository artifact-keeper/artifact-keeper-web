import type { ListBuildsParams } from "@/lib/api/builds";

/** Builds per page the list offers; the backend's `per_page` caps at 100 */
export const PAGE_SIZES = [20, 50, 100] as const;

export interface BuildFilterValues {
  branch: string;
  agent: string;
  /** `YYYY-MM-DD` from a date input, empty for no bound */
  from: string;
  to: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The list query for the filter bar. Dates are whole UTC days and `to` is
 * inclusive, so it becomes the start of the next day
 */
export function buildFilterParams(f: BuildFilterValues): Partial<ListBuildsParams> {
  const params: Partial<ListBuildsParams> = {};
  if (f.branch.trim()) params.branch = f.branch.trim();
  if (f.agent.trim()) params.agent = f.agent.trim();
  if (DAY.test(f.from)) params.created_after = `${f.from}T00:00:00Z`;
  if (DAY.test(f.to)) {
    const next = new Date(`${f.to}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    params.created_before = next.toISOString().replace(".000Z", "Z");
  }
  return params;
}
