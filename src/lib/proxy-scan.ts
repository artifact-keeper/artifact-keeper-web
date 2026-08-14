import { ApiError } from "@/lib/api/fetch";
import type {
  ProxyScanEnforcement,
  ProxyScanEntry,
  ProxyScanState,
} from "@/types/proxy-scans";

/**
 * Pure presentation logic for proxy-cache scan verdicts.
 *
 * Kept out of the components so every state — including the ones that are hard
 * to reach through the UI — is unit-testable without a query client or a
 * rendered tree.
 *
 * The rule that governs all of it: **a state we cannot prove is clean must
 * never render as clean.** The bug this module exists to fix is
 * `security-tab-content.tsx` rendering a green "No vulnerabilities detected"
 * whenever its finding total was zero, which for proxy-cached artifacts is
 * structurally always true (the total is driven by artifact-keyed CVE history,
 * and proxy content has no `artifacts` row). A 403-blocked artifact showed a
 * green all-clear.
 */

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * Shown to anonymous viewers. The repositories pages sit outside the
 * `(protected)` route group and the artifact Security tab renders for
 * unauthenticated users on public repositories — the largest audience for a
 * public registry — while the endpoint 401s them by design. Treating that
 * failure as "zero findings" would restore the green all-clear for exactly
 * that audience.
 */
export const PROXY_SCAN_SIGN_IN_COPY = "Sign in to view scan status.";

/**
 * Shown to an authenticated user the endpoint refuses. Distinct from the
 * anonymous copy — telling a signed-in user to sign in is a dead end.
 */
export const PROXY_SCAN_FORBIDDEN_COPY =
  "You do not have access to scan status for this repository.";

/**
 * Per-CVE detail does not exist for proxy-cached content: findings are reduced
 * to a verdict and counts at scan time and never persisted per-CVE. Naming the
 * remedy is a hard requirement — without it the panel reports a problem and
 * offers no way to act on it.
 */
export const PROXY_SCAN_NO_CVE_DETAIL_COPY =
  "Per-CVE detail is not available for proxy-cached content. To see individual " +
  "findings, ingest this artifact into a hosted repository and scan it there.";

/**
 * Verdicts are global by content digest, so a repository with scanning off can
 * display a verdict another repository recorded for byte-identical content.
 * Suppressing the verdict would re-create the original bug; the mitigation is
 * saying plainly that it is not enforced here.
 */
export const PROXY_SCAN_NOT_ENFORCED_COPY =
  "Scanning is disabled for this repository — verdicts shown were recorded " +
  "elsewhere and are not enforced here.";

/** Counts are over distinct digests; one repository can cache a digest at many paths. */
export const PROXY_SCAN_DISTINCT_DIGESTS_COPY =
  "Counts are over distinct content digests, not cache paths.";

export const PROXY_SCAN_PENDING_INGEST_COPY =
  "Cache entries whose content never finished committing. They have no digest " +
  "to look a verdict up by.";

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/** How a failed verdict lookup should be presented. */
export type ProxyScanFailure =
  | "unauthenticated"
  | "forbidden"
  | "unresolvable"
  | "error";

/**
 * Classify a query error. A 401 is the anonymous case; a 403 is a signed-in
 * user without visibility; a 404 means the path could not be resolved —
 * a repository with zero catalog rows falls back to storage enumeration for
 * its listing, so a modal click there can produce a path the catalog-backed
 * endpoint does not know, as can a placeholder row with a NULL checksum.
 *
 * Anything else is still a failure, and a failure is never clean.
 */
export function classifyProxyScanError(error: unknown): ProxyScanFailure {
  if (error instanceof ApiError) {
    if (error.status === 401) return "unauthenticated";
    if (error.status === 403) return "forbidden";
    if (error.status === 404) return "unresolvable";
  }
  return "error";
}

// ---------------------------------------------------------------------------
// View state
// ---------------------------------------------------------------------------

export type ProxyScanView =
  | { kind: "loading" }
  | { kind: "failure"; failure: ProxyScanFailure }
  /** Resolved, but with no entry for this path — render as unknown, not clean. */
  | { kind: "unresolved" }
  | { kind: "verdict"; entry: ProxyScanEntry };

/**
 * Collapse a react-query result into the state the panel renders. Deliberately
 * total: there is no fall-through that produces a clean verdict.
 */
export function resolveProxyScanView(input: {
  isLoading: boolean;
  error: unknown;
  entry: ProxyScanEntry | null | undefined;
}): ProxyScanView {
  if (input.error != null) {
    const failure = classifyProxyScanError(input.error);
    // A 404 is a resolved answer ("this repository has no such catalog row"),
    // not a transport failure, so it renders as the unknown state rather than
    // as an error.
    return failure === "unresolvable"
      ? { kind: "unresolved" }
      : { kind: "failure", failure };
  }
  if (input.isLoading) return { kind: "loading" };
  if (input.entry == null) return { kind: "unresolved" };
  return { kind: "verdict", entry: input.entry };
}

/**
 * View state for the repository-level summary + list.
 *
 * Separate from {@link resolveProxyScanView} because a 404 means something
 * different here: on a single path it means "this repository's catalog has no
 * such row", but on the collection it means the endpoint is not mounted for
 * this repository at all. Reporting the latter as a scan failure would be
 * alarming and wrong.
 */
export type ProxyScanListView =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "failure"; failure: Exclude<ProxyScanFailure, "unresolvable"> }
  | { kind: "ready" };

export function resolveProxyScanListView(input: {
  isLoading: boolean;
  error: unknown;
}): ProxyScanListView {
  if (input.error != null) {
    const failure = classifyProxyScanError(input.error);
    return failure === "unresolvable"
      ? { kind: "unavailable" }
      : { kind: "failure", failure };
  }
  return input.isLoading ? { kind: "loading" } : { kind: "ready" };
}

/** Shown when the endpoint is not mounted for this repository. */
export const PROXY_SCAN_UNAVAILABLE_COPY =
  "Proxy scan status is not available for this repository.";

// ---------------------------------------------------------------------------
// Verdict copy
// ---------------------------------------------------------------------------

/** Visual weight of a verdict. `clean` is the only tone allowed to read green. */
export type ProxyVerdictTone = "clean" | "danger" | "neutral";

export interface ProxyVerdictCopy {
  tone: ProxyVerdictTone;
  headline: string;
  detail: string;
}

/** Render a timestamp at date granularity. Verdicts are not minute-accurate. */
export function formatScannedDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString();
}

/**
 * What `vulnerable` means operationally. The same verdict is "pulls are
 * blocked" in a scanning fail-closed repository and "served anyway" in a
 * repository with scanning off — same chip, opposite meaning. Copy must never
 * imply vulnerable ⇒ blocked.
 */
function vulnerableDetail(enforcement: ProxyScanEnforcement): string {
  if (!enforcement.scan_on_proxy) {
    return (
      "Scanning is disabled for this repository, so this verdict is not " +
      "enforced here and downloads are served."
    );
  }
  if (enforcement.proxy_scan_action === "fail_closed") {
    return "This repository withholds downloads it cannot clear (fail-closed).";
  }
  return (
    "This repository is configured to serve downloads it cannot clear " +
    "(fail-open), so the artifact may still be served."
  );
}

function notScannedDetail(
  reason: ProxyScanEntry["reason"],
  enforcement: ProxyScanEnforcement,
): string {
  if (reason === "scanning_disabled") {
    return (
      "Scan-on-proxy is off for this repository, so downloads are served " +
      "without being scanned. No verdict is not evidence of safety."
    );
  }
  const posture =
    enforcement.proxy_scan_action === "fail_closed"
      ? "This repository withholds downloads it cannot clear, so it may have been withheld."
      : "This repository serves downloads it cannot clear, so it may have been served unscanned.";
  return `No verdict is not evidence of safety. ${posture}`;
}

/**
 * Headline and supporting line for a verdict.
 *
 * A clean verdict says **"Clean as of <date>"** rather than "no
 * vulnerabilities": a verdict inside the reuse window can still have been
 * scanned against an outdated vulnerability database (#3287), so this is a
 * statement about when, not a guarantee about now.
 */
export function describeProxyVerdict(
  entry: ProxyScanEntry,
  enforcement: ProxyScanEnforcement,
): ProxyVerdictCopy {
  switch (entry.state) {
    case "clean": {
      const date = formatScannedDate(entry.scanned_at);
      return {
        tone: "clean",
        headline: date ? `Clean as of ${date}` : "Clean — no findings recorded",
        detail:
          "No vulnerabilities were found the last time this content was " +
          "scanned. The vulnerability database may have changed since.",
      };
    }
    case "vulnerable": {
      const date = formatScannedDate(entry.scanned_at);
      return {
        tone: "danger",
        headline: date
          ? `Vulnerable as of ${date}`
          : "Vulnerable — findings recorded",
        detail: vulnerableDetail(enforcement),
      };
    }
    default:
      return {
        tone: "neutral",
        headline:
          entry.reason === "scanning_disabled"
            ? "Not scanned — scanning is disabled for this repository"
            : "Not scanned — this artifact has no scan verdict on record",
        detail: notScannedDetail(entry.reason, enforcement),
      };
  }
}

/** Copy for a path the endpoint could not resolve. Unknown, never clean. */
export function describeUnresolvedPath(): ProxyVerdictCopy {
  return {
    tone: "neutral",
    headline: "Scan status unknown for this path",
    detail:
      "This repository has no cache catalog entry for this path, so no scan " +
      "verdict can be looked up. Unknown is not clean.",
  };
}

/**
 * Whether to show the "recorded elsewhere, not enforced here" banner: the
 * repository does not scan proxy downloads, yet a verdict is on screen. That
 * verdict came from another repository that cached byte-identical content.
 *
 * Orthogonal to the verdict itself, so it is computed separately rather than
 * folded into the state.
 */
export function showsInheritedVerdict(
  state: ProxyScanState | null | undefined,
  enforcement: ProxyScanEnforcement,
): boolean {
  if (enforcement.scan_on_proxy) return false;
  return state === "clean" || state === "vulnerable";
}

/**
 * Formats whose proxy download path has scan-gate wiring.
 *
 * There is no authoritative source for this in the backend — the gate is
 * inline call sites with no registry or capability function — so this is a
 * hardcoded list scoped to what actually ships, matching the endpoint's own
 * scope. Extend it in step with the gate rather than guessing wider: showing
 * an always-empty proxy-cache panel on a format that has no gate is noise, and
 * a format that gains a gate without gaining a row here silently loses its
 * summary.
 */
const PROXY_SCANNED_FORMATS: ReadonlySet<string> = new Set(["npm", "pypi"]);

/**
 * Whether the repository Security tab should render the proxy-cache summary.
 * Only Remote repositories have a proxy cache at all.
 */
export function hasProxyScanSummary(
  repository:
    | { repo_type?: string | null; format?: string | null }
    | null
    | undefined,
): boolean {
  if (repository?.repo_type !== "remote") return false;
  return PROXY_SCANNED_FORMATS.has(repository.format ?? "");
}

/** Severity buckets, in descending order, dropping empty ones. */
export function severityBuckets(
  entry: ProxyScanEntry,
): Array<{ key: "critical" | "high" | "medium" | "low"; count: number }> {
  return (
    [
      { key: "critical" as const, count: entry.critical_count },
      { key: "high" as const, count: entry.high_count },
      { key: "medium" as const, count: entry.medium_count },
      { key: "low" as const, count: entry.low_count },
    ] satisfies Array<{ key: "critical" | "high" | "medium" | "low"; count: number }>
  ).filter((bucket) => bucket.count > 0);
}
