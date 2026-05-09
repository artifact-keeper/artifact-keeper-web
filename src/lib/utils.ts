import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a byte count into a human-readable string (e.g. "1.5 MB").
 *
 * Returns "--" for non-finite or negative inputs (NaN, Infinity, -Infinity,
 * negative numbers) so a misbehaving backend can't render "NaN undefined" or
 * similar in a settings panel — see #348. Matches the missing-data sentinel
 * already in use across the package/search rendering paths.
 */
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
const MISSING_VALUE_SENTINEL = "--";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return MISSING_VALUE_SENTINEL;
  if (bytes === 0) return "0 B";
  const k = 1024;
  const rawIndex = Math.floor(Math.log(bytes) / Math.log(k));
  // Clamp both ends: sub-byte values (e.g. 0.5) yield rawIndex = -1 which
  // would index off the front of the units table, and multi-PB values yield
  // rawIndex >= BYTE_UNITS.length which would index off the end. Both paths
  // would otherwise produce "<n> undefined" — the bug this function exists
  // to prevent.
  const i = Math.max(0, Math.min(rawIndex, BYTE_UNITS.length - 1));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${BYTE_UNITS[i]}`;
}

/**
 * Format an ISO date string into a short locale-friendly display string.
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Tailwind classes for repository type badges (local, remote, virtual).
 */
export const REPO_TYPE_COLORS: Record<string, string> = {
  local: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  remote: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  virtual: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

/**
 * Format a number with compact suffixes (e.g. 1.5K, 2.3M).
 */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

/**
 * Validate that a URL uses a safe protocol (http or https only).
 * Returns false for javascript:, data:, vbscript:, and other dangerous schemes.
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validate that a URL is safe to use as an Artifact Keeper instance endpoint.
 * Blocks private/internal IPs, localhost, link-local addresses, and non-HTTP protocols
 * to prevent SSRF attacks via the instance proxy.
 */
export function isValidInstanceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const hostname = parsed.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") return false;
    if (hostname.startsWith("10.") || hostname.startsWith("192.168.")) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    if (hostname === "169.254.169.254") return false; // NOSONAR - SSRF deny list for cloud metadata endpoint
    return true;
  } catch {
    return false;
  }
}
