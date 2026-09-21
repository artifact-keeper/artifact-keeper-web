import { ApiError } from "@/lib/api/fetch";
import { supportsScanOnProxy } from "@/lib/scan-on-proxy-formats";
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
 * Shown when a `vulnerable` entry carries no per-CVE list.
 *
 * The backend records the CVEs behind the counts (artifact-keeper#3395), but
 * only for content scanned after that shipped: anything cached earlier has
 * counts and nothing else, and the endpoint reports that as an empty list
 * rather than omitting it. Naming the remedy is a hard requirement — without
 * it the panel reports a problem and offers no way to act on it.
 */
export const PROXY_SCAN_NO_CVE_DETAIL_COPY =
  "Individual findings were not recorded for this digest — only the counts " +
  "above. Pull the artifact again through a repository with scan-on-proxy " +
  "enabled, or ingest it into a hosted repository and scan it there.";

/**
 * Shown under the repository listing. Per-CVE detail is deliberately omitted
 * from the paged read (one query per row would make it an N+1), so the listing
 * points at where the detail lives instead of implying there is none.
 */
export const PROXY_SCAN_LIST_DETAIL_COPY =
  "Open an artifact from the Artifacts tab to see the individual findings " +
  "behind these counts.";

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
  /**
   * `unresolvable` is deliberately excluded here rather than the access notice
   * being widened to accept it: an unresolvable path is a *required* state,
   * but it is rendered by the `unresolved` branch below as unknown-not-clean,
   * not as an access failure. Widening the notice instead would create an
   * unreachable branch with no copy of its own, and the type would stop
   * proving that every failure the notice receives has wording.
   */
  | { kind: "failure"; failure: Exclude<ProxyScanFailure, "unresolvable"> }
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
  reason: ProxyScanEntry["not_scanned_reason"],
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
    case "pending_ingest":
      // The catalog row exists but its content never finished committing, so
      // there is no digest to look a verdict up by. Not scanned, not
      // scannable, and emphatically not clean.
      return {
        tone: "neutral",
        headline: "Not scanned — this cache entry has no content digest",
        detail: PROXY_SCAN_PENDING_INGEST_COPY,
      };
    default:
      return {
        tone: "neutral",
        headline:
          entry.not_scanned_reason === "scanning_disabled"
            ? "Not scanned — scanning is disabled for this repository"
            : "Not scanned — this artifact has no scan verdict on record",
        detail: notScannedDetail(entry.not_scanned_reason, enforcement),
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
 * Whether the repository Security tab should render the proxy-cache summary.
 *
 * Two independent conditions, both required:
 *  * the repository actually has a proxy cache — Remote only; and
 *  * the backend enforces `scan_on_proxy` for its format, so there can be a
 *    verdict to show. That set is `supportsScanOnProxy`
 *    (`@/lib/scan-on-proxy-formats`), the same one the repository settings
 *    forms gate their "Scan on proxy" toggle on, so the panel and the toggle
 *    can never disagree about which formats are covered. Showing an
 *    always-empty summary for an ungated format is noise; claiming coverage
 *    it does not have is worse.
 *
 * Delegating also picked up the alias formats the local list had missed
 * (`yarn` / `pnpm` / `bower` are served by `npm.rs`, `poetry` / `jupyter` by
 * `pypi.rs`) — the same way Docker/OCI had been missed here before.
 */
export function hasProxyScanSummary(
  repository:
    | { repo_type?: string | null; format?: string | null }
    | null
    | undefined,
): boolean {
  if (repository?.repo_type !== "remote") return false;
  return supportsScanOnProxy(repository.format);
}

/**
 * Severity buckets, in descending order, dropping empty ones.
 *
 * A null count is "the backend suppressed this because there is no verdict
 * row", which produces no badge — the same visual outcome as zero, but it is
 * reached without ever asserting a count of zero. `hasRecordedFindings` below
 * is what decides whether anything is rendered at all.
 */
export function severityBuckets(
  entry: ProxyScanEntry,
): Array<{ key: "critical" | "high" | "medium" | "low"; count: number }> {
  return (
    [
      { key: "critical" as const, count: entry.critical_count ?? 0 },
      { key: "high" as const, count: entry.high_count ?? 0 },
      { key: "medium" as const, count: entry.medium_count ?? 0 },
      { key: "low" as const, count: entry.low_count ?? 0 },
    ] satisfies Array<{ key: "critical" | "high" | "medium" | "low"; count: number }>
  ).filter((bucket) => bucket.count > 0);
}

/**
 * Whether this entry has a finding count worth rendering.
 *
 * Null (no verdict row) and 0 (scanned, nothing found) are both "no badges",
 * but they are different claims and neither may be turned into the other:
 * the headline copy, not this helper, is what says which one it is.
 */
export function hasRecordedFindings(entry: ProxyScanEntry): boolean {
  return (entry.findings_count ?? 0) > 0;
}

/**
 * Per-CVE detail for a `vulnerable` entry, when the read asked for it.
 *
 * `null` means the detail was not requested at this granularity (the paged
 * listing, or a non-`vulnerable` entry). An empty array means it was requested
 * and the scanner has nothing on record for this digest — which renders as
 * {@link PROXY_SCAN_NO_CVE_DETAIL_COPY}, never as "no CVEs".
 */
export function proxyFindingDetail(
  entry: ProxyScanEntry,
): { kind: "absent" } | { kind: "none-recorded" } | { kind: "listed"; findings: NonNullable<ProxyScanEntry["findings"]> } {
  if (entry.state !== "vulnerable") return { kind: "absent" };
  if (entry.findings == null) return { kind: "absent" };
  if (entry.findings.length === 0) return { kind: "none-recorded" };
  return { kind: "listed", findings: entry.findings };
}
