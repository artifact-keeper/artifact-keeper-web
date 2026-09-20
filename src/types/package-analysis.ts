/**
 * Package-analysis types for `GET /api/v1/artifacts/{id}/package-analysis`.
 *
 * The backend unpacks a hosted package (the formats in
 * `PACKAGE_ANALYSIS_FORMATS`), lists the native libraries vendored inside it
 * and statically inspects any install-time scripts. Every enum below is an open string union: the known
 * values get dedicated styling, anything else renders verbatim in neutral
 * styling so a value added server-side never crashes the panel.
 */

/**
 * How much of the package the analyzer actually read. This is the load-bearing
 * field of the whole feature: an empty `vendored_components` list means
 * "nothing found" ONLY when `status` is `complete`. For `not_read` and
 * `unsupported` it means "we did not look", and the UI must say so rather than
 * rendering a clean state.
 */
export type CompletenessStatus =
  | "complete"
  | "partial"
  | "not_read"
  | "unsupported";

export const COMPLETENESS_STATUSES: ReadonlySet<CompletenessStatus> = new Set([
  "complete",
  "partial",
  "not_read",
  "unsupported",
]);

/**
 * Whether the advisory feeds could be consulted for this package at all.
 *
 * This is a SEPARATE axis from `AnalysisCompleteness`, which is about how
 * much of the archive the unpacker read. A truncated archive and an OSV
 * outage are both "partial" in ordinary English and mean completely
 * different things to a reader, so they get different fields:
 *
 * - `ok`       - the feeds answered. A component's `advisories: []` is then
 *                a real, queried-and-clean result.
 * - `not_run`  - no completed dependency scan has recorded advisories yet.
 *                Nothing has asked.
 * - `partial`  - a feed WAS asked and did not answer (outage, rate limit,
 *                timeout). Nothing is ruled out, and this must not be
 *                reported as "we didn't ask".
 * - `unknown`  - the backend said nothing, or said something this build does
 *                not model. Renders the cautious, non-committal copy: never
 *                "clean", never a claimed outage.
 */
export type AdvisoryScanStatus = "ok" | "not_run" | "partial" | "unknown";

export const ADVISORY_SCAN_STATUSES: ReadonlySet<AdvisoryScanStatus> = new Set([
  "ok",
  "not_run",
  "partial",
  "unknown",
]);

export interface AdvisoryScan {
  status: AdvisoryScanStatus;
  /** Why the feeds were not (fully) consulted, e.g. "OSV returned 503". */
  reason: string | null;
}

export interface AnalysisCompleteness {
  /**
   * Always one of the known statuses: the API wrapper narrows anything else
   * to `not_read` (with a console warning), because an unrecognized status
   * must never be mistaken for "inspected and clean".
   */
  status: CompletenessStatus;
  /** Human-readable reason when the read was partial / skipped / unsupported. */
  reason: string | null;
  files_total: number | null;
  files_read: number | null;
}

export type VendoredConfidence = "high" | "medium" | "low";

/**
 * An advisory matched against a vendored component's recovered version.
 *
 * `severity` is an open string union like every other enum here: known values
 * get the shared severity palette, anything else renders verbatim in neutral
 * styling (see `@/components/common/severity-badge`).
 */
export interface ComponentAdvisory {
  /** "CVE-2023-4863", "GHSA-...", or a feed-specific id. */
  id: string;
  severity: ScriptFindingSeverity | string;
  summary: string | null;
  /** Advisory page from the feed; `VulnIdLink` derives NVD/GHSA links itself. */
  url: string | null;
}

export interface AppliedPatch {
  name: string;
  description?: string | null;
  source_url?: string | null;
}

export interface VendoredComponent {
  name: string;
  version: string | null;
  source_url: string | null;
  confidence: VendoredConfidence | string;
  detection_method: string | null;
  /**
   * Path inside the package, when the component was located by reading a file
   * (a vendored `.so` found in a wheel). A component derived from a recipe
   * has NO path -- the recipe declares an upstream source, not a file -- so
   * the backend omits the field entirely for those.
   *
   * Never synthesise one to fill this in. A fabricated path is a lie rendered
   * in a column a reviewer reads as fact, the same reason npm install hooks
   * are reported as `package.json#scripts.postinstall` rather than an
   * invented filename. Use `vendoredComponentKey()` for row identity.
   */
  path?: string | null;
  purl: string | null;
  applied_patches: AppliedPatch[];
  /**
   * The ELF / libtool ABI version carried by the file name or soname — the
   * `7` in `libwebp.so.7`, the `62.3.0` in `libjpeg.so.62.3.0`. It is NOT the
   * upstream release and must never be rendered as one: `libwebp.so.7` ships
   * in libwebp *1.2.4*, so treating `7` as a version would match the wrong
   * advisories. Present on rows whose upstream `version` could not be
   * recovered, which is why those rows read "version not determinable"
   * rather than showing an empty cell.
   */
  abi_version: string | null;
  /** The recorded soname (`libwebp.so.7`), when the detector read one. */
  soname: string | null;
  /**
   * Advisories matched against this component's version. Three-way, exactly
   * like the panel-level completeness contract:
   *
   * - `null`   - no advisory result for this component. Never clean. There
   *              are three distinct causes, and the UI must not print one
   *              when it means another — see `advisoryGap()` in
   *              `@/lib/vendored-advisories`:
   *                1. no upstream version was recovered (`version === null`),
   *                   so it was never sent to a feed;
   *                2. no completed dependency scan has run yet
   *                   (`advisory_scan.status === "not_run"`);
   *                3. a feed WAS asked and did not answer
   *                   (`advisory_scan.status === "partial"`).
   * - `[]`     - queried against the advisory feeds, nothing matched.
   * - non-empty - what matched.
   *
   * A backend that omits the field entirely is normalized to `null` by the
   * API wrapper: "we did not look" is the only safe reading of a missing
   * answer.
   */
  advisories: ComponentAdvisory[] | null;
}

/**
 * The `kind` values the backend's `ScriptKind` serializes, grouped by the
 * ecosystem whose hook they are. The list is open: a value not modelled here
 * still renders (verbatim, in neutral styling) — see
 * `@/lib/install-script-kinds` for the labels and the root-privilege split.
 */
export type InstallScriptKind =
  // conda
  | "pre-link"
  | "post-link"
  | "pre-unlink"
  | "post-unlink"
  // npm lifecycle scripts
  | "preinstall"
  | "install"
  | "postinstall"
  | "prepare"
  // RPM scriptlets
  | "rpm-pre"
  | "rpm-post"
  | "rpm-preun"
  | "rpm-postun"
  // Debian maintainer scripts
  | "deb-preinst"
  | "deb-postinst"
  | "deb-prerm"
  | "deb-postrm"
  // Alpine apk triggers
  | "apk-pre-install"
  | "apk-post-install"
  // PyPI sdist
  | "python-setup-py";

export type ScriptFindingSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info";

export interface ScriptFinding {
  rule_id: string;
  severity: ScriptFindingSeverity | string;
  title: string;
  description: string | null;
  line: number | null;
  snippet: string | null;
}

export interface InstallScript {
  /**
   * Where the script lives. A file path for conda (`info/post-link.sh`) and
   * PyPI (`setup.py`), but NOT always a path: npm rows carry
   * `package.json#scripts.postinstall` and RPM rows an in-header locator
   * such as `rpm:header#POSTIN`. Render it verbatim; never basename it.
   */
  path: string;
  kind: InstallScriptKind | string;
  size_bytes: number;
  /**
   * `false` when the script exists in the package but its bytes could not be
   * read (unsupported encoding, truncated archive). An empty `findings` list
   * then means "not inspected", not "clean".
   */
  content_available: boolean;
  findings: ScriptFinding[];
}

export interface PackageAnalysis {
  format: string;
  analyzed_at: string | null;
  completeness: AnalysisCompleteness;
  /**
   * Advisory-feed availability for this analysis. `null` when the backend
   * does not report it (older build) — treated exactly like `unknown`.
   *
   * Deliberately NOT folded into `completeness`: that field already drives
   * the "only N of M files were read" banner, and an advisory-feed outage on
   * a fully-read archive would make that banner lie.
   */
  advisory_scan: AdvisoryScan | null;
  vendored_components: VendoredComponent[];
  install_scripts: InstallScript[];
}
