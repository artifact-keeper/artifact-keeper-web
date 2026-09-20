import type { RepositoryFormat } from "@/types";

/**
 * The formats whose hosted artifacts the backend unpacks for package analysis
 * (vendored native libraries + install-script inspection). Mirrors
 * `VERSIONING_FORMATS` / `supportsVersioning` in `@/lib/api/versions`: the
 * artifact detail dialog only shows the Analysis tab for these formats, so a
 * repository of any other format keeps the existing dialog unchanged.
 *
 * The strings are `RepositoryFormat` values, so e.g. Debian is `debian`
 * (not `deb`) here even though its script kinds are `deb-*`.
 */
export const PACKAGE_ANALYSIS_FORMATS: ReadonlySet<RepositoryFormat> = new Set([
  "conda",
  "conda_native",
  "npm",
  "pypi",
  "rpm",
  "debian",
]);

/** Whether a repository format participates in package analysis. */
export function supportsPackageAnalysis(format: RepositoryFormat): boolean {
  return PACKAGE_ANALYSIS_FORMATS.has(format);
}
