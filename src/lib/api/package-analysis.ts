import { z } from "zod";
import { apiFetch, ApiError, narrowEnum } from "@/lib/api/fetch";
import {
  ADVISORY_SCAN_STATUSES,
  COMPLETENESS_STATUSES,
  type PackageAnalysis,
} from "@/types/package-analysis";

/**
 * Client for the per-artifact package-analysis endpoint.
 *
 *   GET /api/v1/artifacts/{id}/package-analysis -> PackageAnalysis
 *       (404 when no analysis row exists for the artifact)
 *
 * The backend unpacks hosted conda / conda_native packages, lists the native
 * libraries vendored inside them and statically inspects install-time
 * scripts (`pre-link` / `post-link` / ...). The response's `completeness`
 * block records how much of the package was actually read — that is what
 * lets the UI distinguish "inspected, nothing found" from "not inspected".
 *
 * The same distinction repeats per vendored component in `advisories`:
 * `null` (or an absent field) means there is no advisory answer for that
 * component, `[]` means the feeds were queried and matched nothing. The
 * mapping below never turns the former into the latter.
 *
 * WHY a component has no answer is carried by the separate top-level
 * `advisory_scan` block, not by `completeness`: an advisory-feed outage and a
 * truncated archive are different failures, and `completeness` already drives
 * the "only N of M files were read" banner.
 *
 * STOPGAP: the endpoint is not in the generated `@artifact-keeper/sdk` yet,
 * so this module uses the shared `apiFetch` wrapper and validates the
 * response with zod at the trust boundary (same pattern as blast-radius,
 * versions and downloads). Once the SDK regenerates with the operation, swap
 * the fetch for the generated client and keep the zod validation.
 */

const CompletenessSchema = z
  .object({
    status: z.string(),
    reason: z.string().nullish(),
    files_total: z.number().nullish(),
    files_read: z.number().nullish(),
  })
  .passthrough();

const AdvisoryScanSchema = z
  .object({
    status: z.string(),
    reason: z.string().nullish(),
  })
  .passthrough();

const AppliedPatchSchema = z
  .object({
    name: z.string(),
    description: z.string().nullish(),
    source_url: z.string().nullish(),
  })
  .passthrough();

const ComponentAdvisorySchema = z
  .object({
    id: z.string(),
    severity: z.string(),
    summary: z.string().nullish(),
    url: z.string().nullish(),
  })
  .passthrough();

const VendoredComponentSchema = z
  .object({
    name: z.string(),
    version: z.string().nullish(),
    source_url: z.string().nullish(),
    confidence: z.string(),
    detection_method: z.string().nullish(),
    path: z.string().nullish(),
    purl: z.string().nullish(),
    applied_patches: z.array(AppliedPatchSchema).nullish(),
    abi_version: z.string().nullish(),
    soname: z.string().nullish(),
    // Deliberately `nullish` and NOT defaulted to `[]`: a missing list must
    // land on "not queried", not on "queried and clean". See the mapping
    // below and the `advisories` doc comment on `VendoredComponent`.
    advisories: z.array(ComponentAdvisorySchema).nullish(),
  })
  .passthrough();

const ScriptFindingSchema = z
  .object({
    rule_id: z.string(),
    severity: z.string(),
    title: z.string(),
    description: z.string().nullish(),
    line: z.number().nullish(),
    snippet: z.string().nullish(),
  })
  .passthrough();

const InstallScriptSchema = z
  .object({
    path: z.string(),
    kind: z.string(),
    size_bytes: z.number(),
    content_available: z.boolean(),
    findings: z.array(ScriptFindingSchema).nullish(),
  })
  .passthrough();

// The two top-level lists are required (not nullish) on purpose: a backend
// that dropped `vendored_components` from a `complete` analysis would
// otherwise render as "nothing vendored", which is exactly the false-clean
// this feature exists to avoid. A drifted shape surfaces as a parse error.
const PackageAnalysisSchema = z
  .object({
    format: z.string(),
    analyzed_at: z.string().nullish(),
    completeness: CompletenessSchema,
    advisory_scan: AdvisoryScanSchema.nullish(),
    vendored_components: z.array(VendoredComponentSchema),
    install_scripts: z.array(InstallScriptSchema),
  })
  .passthrough();

export function parsePackageAnalysis(data: unknown): PackageAnalysis {
  const parsed = PackageAnalysisSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      "Package-analysis response did not match the expected shape"
    );
  }
  const d = parsed.data;
  return {
    format: d.format,
    analyzed_at: d.analyzed_at ?? null,
    completeness: {
      // An unrecognized status is narrowed to `not_read`, never to
      // `complete`: whatever the backend meant, the UI must not present the
      // package as inspected-and-clean on the strength of a value it does
      // not understand. Confidence / kind / severity below stay verbatim
      // because they only drive styling, not the clean-vs-unknown verdict.
      status: narrowEnum(
        d.completeness.status,
        COMPLETENESS_STATUSES,
        "not_read",
        `Unknown package-analysis completeness status "${d.completeness.status}"; treating as not_read`
      ),
      reason: d.completeness.reason ?? null,
      files_total: d.completeness.files_total ?? null,
      files_read: d.completeness.files_read ?? null,
    },
    // Absent (older backend) and unrecognized both land on `unknown`, which
    // renders the non-committal copy. Narrowing to `ok` would assert the
    // feeds answered; narrowing to `partial` would assert an outage. Neither
    // is knowable from a value we do not understand.
    advisory_scan:
      d.advisory_scan == null
        ? null
        : {
            status: narrowEnum(
              d.advisory_scan.status,
              ADVISORY_SCAN_STATUSES,
              "unknown",
              `Unknown advisory-scan status "${d.advisory_scan.status}"; treating as unknown`
            ),
            reason: d.advisory_scan.reason ?? null,
          },
    vendored_components: d.vendored_components.map((c) => ({
      name: c.name,
      version: c.version ?? null,
      source_url: c.source_url ?? null,
      confidence: c.confidence,
      detection_method: c.detection_method ?? null,
      path: c.path,
      purl: c.purl ?? null,
      applied_patches: (c.applied_patches ?? []).map((p) => ({
        name: p.name,
        description: p.description ?? null,
        source_url: p.source_url ?? null,
      })),
      abi_version: c.abi_version ?? null,
      soname: c.soname ?? null,
      // `undefined` (field absent, e.g. an older backend) collapses to
      // `null` — "not queried" — on purpose. `[]` survives as `[]` and is
      // the only value that renders as "no known advisories".
      advisories:
        c.advisories == null
          ? null
          : c.advisories.map((a) => ({
              id: a.id,
              severity: a.severity,
              summary: a.summary ?? null,
              url: a.url ?? null,
            })),
    })),
    install_scripts: d.install_scripts.map((s) => ({
      path: s.path,
      kind: s.kind,
      size_bytes: s.size_bytes,
      content_available: s.content_available,
      findings: (s.findings ?? []).map((f) => ({
        rule_id: f.rule_id,
        severity: f.severity,
        title: f.title,
        description: f.description ?? null,
        line: f.line ?? null,
        snippet: f.snippet ?? null,
      })),
    })),
  };
}

export const packageAnalysisApi = {
  /**
   * Fetch the package analysis recorded for one artifact. The backend answers
   * 404 when no analysis row exists (never analyzed, or a format the analyzer
   * does not handle) — normalized to `null` so callers render a plain "no
   * analysis recorded" state instead of an error banner. Any other failure
   * is rethrown.
   */
  get: async (artifactId: string): Promise<PackageAnalysis | null> => {
    try {
      const raw = await apiFetch<unknown>(
        `/api/v1/artifacts/${encodeURIComponent(artifactId)}/package-analysis`
      );
      return parsePackageAnalysis(raw);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
};
