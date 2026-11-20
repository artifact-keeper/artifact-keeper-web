import { formatBytes } from "@/lib/utils";

const UNITS = { MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 } as const;
export type QuotaUnit = keyof typeof UNITS;

/** Parse a quota form value into bytes. Empty or non-positive means unlimited (undefined). */
export function quotaInputToBytes(value: string, unit: QuotaUnit): number | undefined {
  const n = Number(value);
  if (!value.trim() || !Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n * UNITS[unit]);
}

/** Split stored bytes into the largest unit that gives a whole-ish number. */
export function bytesToQuotaInput(bytes: number | undefined): { value: string; unit: QuotaUnit } {
  if (!bytes) return { value: "", unit: "GB" };
  const unit: QuotaUnit = bytes >= UNITS.TB ? "TB" : bytes >= UNITS.GB ? "GB" : "MB";
  return { value: String(Math.round((bytes / UNITS[unit]) * 100) / 100), unit };
}

export function formatQuota(bytes: number | undefined): string {
  return bytes ? formatBytes(bytes) : "Unlimited";
}
