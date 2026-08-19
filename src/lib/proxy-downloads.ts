import type { FormatHandler } from "@/lib/api/format-handlers";
import type { Repository, RepositoryFormat } from "@/types";

/**
 * Telling a *measured zero* apart from *not measured* in the Downloads column
 * of a Remote (proxy) repository (#808, backend artifact-keeper#3446).
 *
 * Background. A proxy repository serves cached upstream bytes; those rows come
 * back from the artifacts listing with synthetic ids, `analyzable: false` and
 * `cache_cached_at` set. `download_count` on them was hardcoded to 0 until
 * backend artifact-keeper#3388 (ships in 1.8.0), and even after that fix only
 * the formats whose handlers call `record_proxy_download` increment anything —
 * the rest record nothing at all, so their count is `0` forever.
 *
 * A bare `0` therefore means two different things depending on the format:
 * "nobody pulled this" for PyPI/npm/Maven and friends, versus "this format
 * does not count proxy traffic yet" for Docker, cargo, NuGet, Debian, Helm, Go
 * and the rest. Rendering both as `0` invites an operator to delete a proxy
 * that is in fact serving heavy traffic, so the second case renders as an
 * explicit "not tracked" affordance instead of a number.
 */

/**
 * Formats whose *proxied* downloads the backend records today.
 *
 * Taken from backend artifact-keeper#3446, which enumerates the handlers that
 * reach `record_proxy_download`: `ansible`, `conda`, `cran`, `rpm` and
 * `rubygems` through the shared `try_remote_or_virtual_download` helper, plus
 * explicit call sites in `maven`, `npm` and `pypi`.
 *
 * Deliberately conservative: format ids that merely *resemble* an instrumented
 * handler (`gradle`, `yarn`, `pnpm`, `poetry`, `conda_native`, …) are left out
 * because that issue lists backend handler modules, not repository format ids,
 * and this list is only ever consulted for a **zero** count (see
 * `downloadCountKind`). Under-claiming therefore shows "not tracked" on a
 * genuinely idle repository — mildly wrong; over-claiming would show a
 * confident `0` for a busy one — the bug being fixed. Prefer under-claiming.
 *
 * This list shrinks to nothing once the backend reports the capability itself;
 * see `PROXY_DOWNLOAD_CAPABILITY_KEY`.
 */
export const PROXY_DOWNLOAD_TRACKED_FORMATS = new Set<RepositoryFormat>([
  "ansible",
  "conda",
  "cran",
  "maven",
  "npm",
  "pypi",
  "rpm",
  "rubygems",
]);

/**
 * Capability key read off a format handler's `capabilities` bag when the
 * backend publishes one.
 *
 * `GET /api/v1/formats` already returns a free-form `capabilities` map per
 * handler, so an API-reported boolean under this key wins over the static list
 * above and the frontend needs no release to follow backend
 * artifact-keeper#3446 as it instruments more formats. Nothing populates it
 * today — a backend field is the better long-term shape and this is where it
 * would land.
 */
export const PROXY_DOWNLOAD_CAPABILITY_KEY = "records_proxy_downloads";

/** Rendered in place of the number when the count is not measured. */
export const PROXY_DOWNLOADS_UNTRACKED_SYMBOL = "—";

/** Screen-reader text and detail-dialog value for an unmeasured count. */
export const PROXY_DOWNLOADS_UNTRACKED_LABEL = "Not tracked";

/** Hover/`title` explanation for an unmeasured count. */
export const PROXY_DOWNLOADS_UNTRACKED_REASON =
  "This format does not record downloads served from the proxy cache yet, so no count is available. It is not a measured zero.";

type RepoDownloadFields = Pick<Repository, "format" | "format_key" | "repo_type">;

type FormatHandlerLike = Pick<FormatHandler, "format_key" | "capabilities">;

/**
 * The backend's own answer for a repository's format, when it has one.
 * `undefined` means the API said nothing and the caller should fall back.
 */
function reportedCapability(
  repo: RepoDownloadFields,
  handlers?: FormatHandlerLike[] | null,
): boolean | undefined {
  const key = repo.format_key || repo.format;
  const handler = handlers?.find((h) => h.format_key === key);
  const value = handler?.capabilities?.[PROXY_DOWNLOAD_CAPABILITY_KEY];
  return typeof value === "boolean" ? value : undefined;
}

/**
 * Whether downloads served from this repository's proxy cache are counted.
 *
 * Prefers the API-reported capability and falls back to the static list. Only
 * meaningful for Remote repositories; hosted (`local`) traffic is counted for
 * every format, and a Virtual repository is reported by its own key rather
 * than by whichever member served the bytes, so both are treated as tracked.
 */
export function proxyDownloadsTracked(
  repo: RepoDownloadFields,
  handlers?: FormatHandlerLike[] | null,
): boolean {
  if (repo.repo_type !== "remote") return true;
  return (
    reportedCapability(repo, handlers) ??
    PROXY_DOWNLOAD_TRACKED_FORMATS.has(repo.format)
  );
}

/** How a Downloads cell should render a given count. */
export type DownloadCountKind = "count" | "untracked";

/**
 * Decide whether a download count is a number to show or an unmeasured blank.
 *
 * A non-zero count is always rendered as the number, whatever the lists above
 * say: a count that exists is proof the format is instrumented, so this can
 * never hide real data behind a dash, and a format the backend starts counting
 * mid-release shows its traffic immediately instead of waiting for a web
 * release to add it to `PROXY_DOWNLOAD_TRACKED_FORMATS`.
 */
export function downloadCountKind(
  count: number | null | undefined,
  repo: RepoDownloadFields,
  handlers?: FormatHandlerLike[] | null,
): DownloadCountKind {
  if (typeof count === "number" && count > 0) return "count";
  return proxyDownloadsTracked(repo, handlers) ? "count" : "untracked";
}
