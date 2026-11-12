import { formatBytes, isSafeUrl } from "@/lib/utils";

/**
 * Instance-wide quotas configured by the administrator: a storage quota and a
 * monthly download transfer quota, plus the maximum upload size.
 *
 * The backend reports them in `GET /api/v1/admin/stats` (administrators) and
 * `GET /api/v1/system/quota` (any signed-in user). Older backends return
 * neither, so every reader here treats a missing or malformed field as "no
 * quota configured" and the UI renders exactly as it did before.
 */

export type StorageQuotaState = "ok" | "warning" | "exceeded";
export type TransferQuotaState = "ok" | "warning" | "over" | "refusing";

export interface StorageQuota {
  quotaBytes: number;
  usedBytes: number;
  /** Used as a percentage of the quota (may exceed 100). */
  percent: number;
  warnPercent: number;
  state: StorageQuotaState;
}

export interface TransferQuota {
  quotaBytes: number;
  usedBytes: number;
  percent: number;
  warnPercent: number;
  gracePercent: number;
  /** Downloads are refused once this much has been transferred. */
  hardLimitBytes: number;
  state: TransferQuotaState;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface InstanceQuota {
  /** null when no storage quota is configured. */
  storage: StorageQuota | null;
  /** null when no transfer quota is configured. */
  transfer: TransferQuota | null;
  /** Server upload size limit in bytes; null when not reported or unlimited. */
  maxUploadBytes: number | null;
  /** http(s) link the administrator configured; null otherwise. */
  helpUrl: string | null;
}

const STORAGE_STATES: readonly StorageQuotaState[] = ["ok", "warning", "exceeded"];
const TRANSFER_STATES: readonly TransferQuotaState[] = ["ok", "warning", "over", "refusing"];

type Raw = Record<string, unknown>;

function asObject(v: unknown): Raw | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function positive(v: unknown): number | null {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
}

function percentOf(used: number, quota: number, reported: unknown): number {
  const p = num(reported);
  return p !== null && p >= 0 ? p : (used / quota) * 100;
}

function warnOf(v: unknown): number {
  const n = num(v);
  return n !== null && n > 0 && n <= 100 ? n : 80;
}

function isoOrNull(v: unknown): string | null {
  return typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null;
}

function parseStorage(v: unknown): StorageQuota | null {
  const o = asObject(v);
  if (!o || o.enabled !== true) return null;
  const quotaBytes = positive(o.quota_bytes);
  if (quotaBytes === null) return null;
  const usedBytes = Math.max(0, num(o.used_bytes) ?? 0);
  const percent = percentOf(usedBytes, quotaBytes, o.percent);
  const warnPercent = warnOf(o.warn_percent);
  const reported = STORAGE_STATES.find((s) => s === o.state);
  let state: StorageQuotaState = "ok";
  if (reported) state = reported;
  else if (percent >= 100) state = "exceeded";
  else if (percent >= warnPercent) state = "warning";
  return { quotaBytes, usedBytes, percent, warnPercent, state };
}

function parseTransfer(v: unknown): TransferQuota | null {
  const o = asObject(v);
  if (!o || o.enabled !== true) return null;
  const quotaBytes = positive(o.quota_bytes);
  if (quotaBytes === null) return null;
  const usedBytes = Math.max(0, num(o.used_bytes) ?? 0);
  const percent = percentOf(usedBytes, quotaBytes, o.percent);
  const warnPercent = warnOf(o.warn_percent);
  const grace = num(o.grace_percent);
  const gracePercent = grace !== null && grace > 0 ? grace : 0;
  const hardLimitBytes =
    positive(o.hard_limit_bytes) ?? (quotaBytes * (100 + gracePercent)) / 100;
  const reported = TRANSFER_STATES.find((s) => s === o.state);
  let state: TransferQuotaState = "ok";
  if (reported) state = reported;
  else if (usedBytes >= hardLimitBytes) state = "refusing";
  else if (percent >= 100) state = "over";
  else if (percent >= warnPercent) state = "warning";
  return {
    quotaBytes,
    usedBytes,
    percent,
    warnPercent,
    gracePercent,
    hardLimitBytes,
    state,
    periodStart: isoOrNull(o.period_start),
    periodEnd: isoOrNull(o.period_end),
  };
}

/**
 * Read the quota fields out of an admin stats or system quota response.
 * Returns null when the response carries none of them (older backend).
 */
export function parseInstanceQuota(raw: unknown): InstanceQuota | null {
  const o = asObject(raw);
  if (!o) return null;
  if (
    !("storage_quota" in o) &&
    !("transfer_quota" in o) &&
    !("max_upload_bytes" in o)
  ) {
    return null;
  }
  const help = typeof o.quota_help_url === "string" ? o.quota_help_url.trim() : "";
  return {
    storage: parseStorage(o.storage_quota),
    transfer: parseTransfer(o.transfer_quota),
    maxUploadBytes: positive(o.max_upload_bytes),
    helpUrl: help && isSafeUrl(help) ? help : null,
  };
}

/** Whole percent for display, rounded down so 99.6 % does not read as 100 %. */
export function formatPercent(percent: number): string {
  if (!Number.isFinite(percent) || percent < 0) return "--";
  return `${Math.floor(percent)}%`;
}

/** "10.5 GiB / 150 GiB" */
export function formatUsage(usedBytes: number, quotaBytes: number): string {
  return `${formatBytes(usedBytes)} / ${formatBytes(quotaBytes)}`;
}

/**
 * The calendar date a transfer period ends on. Periods are calendar months in
 * UTC, so the date is shown in UTC: a period ending at 2026-12-01T00:00Z
 * resets on Dec 1 for every reader, not on Nov 30 west of Greenwich.
 */
export function formatQuotaDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Width of a usage bar, clamped to 0..100. */
export function barPercent(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.min(100, percent);
}

/**
 * The smallest positive upload limit the server advertises. The system config
 * and the quota response both report the same server setting; taking the
 * smaller one keeps the client-side check honest if they ever disagree.
 * Returns 0 for "no limit advertised", matching `FileUpload`.
 */
export function effectiveMaxUpload(...limits: (number | null | undefined)[]): number {
  const valid = limits.filter((l): l is number => typeof l === "number" && Number.isFinite(l) && l > 0);
  return valid.length ? Math.min(...valid) : 0;
}

// ---------------------------------------------------------------------------
// Banner notices
// ---------------------------------------------------------------------------

export type QuotaNoticeKind = "storage" | "transfer";

export interface QuotaNotice {
  kind: QuotaNoticeKind;
  /** Higher is worse. 0 never produces a notice. */
  severity: number;
  /** "warning" is advisory; "critical" means something is or will be refused. */
  tone: "warning" | "critical";
  title: string;
  message: string;
}

const STORAGE_SEVERITY: Record<StorageQuotaState, number> = { ok: 0, warning: 1, exceeded: 2 };
const TRANSFER_SEVERITY: Record<TransferQuotaState, number> = { ok: 0, warning: 1, over: 2, refusing: 3 };

export function storageSeverity(q: StorageQuota | null): number {
  return q ? STORAGE_SEVERITY[q.state] : 0;
}

export function transferSeverity(q: TransferQuota | null): number {
  return q ? TRANSFER_SEVERITY[q.state] : 0;
}

function resetsPhrase(periodEnd: string | null, prefix: string): string {
  const date = formatQuotaDate(periodEnd);
  return date ? `${prefix} ${date}` : "";
}

export function storageNotice(q: StorageQuota | null, isAdmin: boolean): QuotaNotice | null {
  if (!q || q.state === "ok") return null;
  if (q.state === "warning") {
    return {
      kind: "storage",
      severity: STORAGE_SEVERITY.warning,
      tone: "warning",
      title: "Storage almost full",
      message: `Storage is at ${formatPercent(q.percent)} of the quota (${formatUsage(q.usedBytes, q.quotaBytes)}). New uploads will be refused once it is full.`,
    };
  }
  return {
    kind: "storage",
    severity: STORAGE_SEVERITY.exceeded,
    tone: "critical",
    title: "Storage quota reached",
    message: `Storage quota reached: new uploads are refused; downloads still work. Delete artifacts or ${isAdmin ? "raise the quota" : "ask an administrator to raise the quota"}.`,
  };
}

export function transferNotice(q: TransferQuota | null, isAdmin: boolean): QuotaNotice | null {
  if (!q || q.state === "ok") return null;
  const usage = formatUsage(q.usedBytes, q.quotaBytes);
  if (q.state === "warning") {
    const resets = resetsPhrase(q.periodEnd, "; it resets on");
    return {
      kind: "transfer",
      severity: TRANSFER_SEVERITY.warning,
      tone: "warning",
      title: "Transfer quota almost used",
      message: `Downloads this month are at ${formatPercent(q.percent)} of the transfer quota (${usage})${resets}.`,
    };
  }
  if (q.state === "over") {
    const until = resetsPhrase(q.periodEnd, " until");
    return {
      kind: "transfer",
      severity: TRANSFER_SEVERITY.over,
      tone: "critical",
      title: "Transfer quota exceeded",
      message: `Monthly transfer quota exceeded (${usage}). Downloads still work for now, but will be refused after ${formatBytes(q.hardLimitBytes)}${until}.`,
    };
  }
  const until = resetsPhrase(q.periodEnd, " until");
  return {
    kind: "transfer",
    severity: TRANSFER_SEVERITY.refusing,
    tone: "critical",
    title: "Downloads refused",
    message: `Monthly transfer quota used up (${usage}): downloads are refused${until}.${isAdmin ? " Raise the transfer quota to restore them sooner." : ""}`,
  };
}

/** Notices for the app-wide banner, worst first. Empty when all is well. */
export function quotaNotices(quota: InstanceQuota | null | undefined, isAdmin: boolean): QuotaNotice[] {
  if (!quota) return [];
  return [storageNotice(quota.storage, isAdmin), transferNotice(quota.transfer, isAdmin)]
    .filter((n): n is QuotaNotice => n !== null)
    .sort((a, b) => b.severity - a.severity);
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

export type QuotaRefusalKind = "storage" | "repository" | "transfer" | "upload_size";

/**
 * A request the server refused because of a quota or the upload size limit:
 * 403 `STORAGE_QUOTA_EXCEEDED` / `QUOTA_EXCEEDED`, 413 `PAYLOAD_TOO_LARGE`, or
 * 429 `TRANSFER_QUOTA_EXCEEDED`. `message` is the server's own text.
 */
export class QuotaRefusalError extends Error {
  readonly kind: QuotaRefusalKind;
  readonly status: number;
  readonly helpUrl: string | null;
  readonly limitBytes: number | null;

  constructor(
    kind: QuotaRefusalKind,
    status: number,
    message: string,
    helpUrl: string | null = null,
    limitBytes: number | null = null,
  ) {
    super(message);
    this.name = "QuotaRefusalError";
    this.kind = kind;
    this.status = status;
    this.helpUrl = helpUrl;
    this.limitBytes = limitBytes;
  }
}

function parseBody(body: unknown): Raw | null {
  if (typeof body === "string") {
    try {
      return asObject(JSON.parse(body));
    } catch {
      return null;
    }
  }
  return asObject(body);
}

function bodyMessage(o: Raw | null): string | null {
  if (!o) return null;
  for (const key of ["message", "error"] as const) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Recognise a quota or upload size refusal from a status and response body
 * (raw text or parsed JSON). Returns null for anything else, so callers keep
 * their existing handling.
 */
export function quotaRefusalFrom(status: number, body: unknown): QuotaRefusalError | null {
  const o = parseBody(body);
  const code = typeof o?.code === "string" ? o.code : "";
  let kind: QuotaRefusalKind | null = null;
  if (status === 403 && code === "STORAGE_QUOTA_EXCEEDED") kind = "storage";
  else if (status === 403 && code === "QUOTA_EXCEEDED") kind = "repository";
  else if (status === 429 && code === "TRANSFER_QUOTA_EXCEEDED") kind = "transfer";
  else if (status === 413) kind = "upload_size";
  if (!kind) return null;

  const limitBytes = positive(o?.limit_bytes);
  const help = typeof o?.help_url === "string" ? o.help_url.trim() : "";
  // A 413 without the structured code comes from an older backend or a proxy
  // in front of it, whose body is at best a reason phrase ("Payload Too
  // Large"); say what it means instead.
  let message = kind === "upload_size" && code !== "PAYLOAD_TOO_LARGE" ? null : bodyMessage(o);
  if (!message) {
    message =
      kind === "upload_size"
        ? limitBytes
          ? `File exceeds the maximum upload size of ${formatBytes(limitBytes)}.`
          : "File exceeds the maximum upload size allowed by the server."
        : "The upload was refused because a quota has been reached.";
  }
  return new QuotaRefusalError(kind, status, message, help && isSafeUrl(help) ? help : null, limitBytes);
}
