import type { Artifact } from "@/types";

/**
 * User-facing explanation shown when SBOM generation / on-demand scanning is
 * offered for an artifact the backend cannot analyze. Proxy-cached remote
 * artifacts have synthetic ids and no `artifacts` row, so the backend returns
 * 404 for those requests (artifact-keeper#2292, backend PR #2291).
 *
 * #3344: this previously said "SBOM and scanning are available only for
 * artifacts hosted in this registry", which is false for scanning - proxy-cached
 * artifacts in PyPI, npm and Docker/OCI repositories can be scanned at
 * download time when scan-on-proxy is enabled. scan_on_proxy is a no-op for
 * every other format, and is off by default even where it's wired up, so this
 * intentionally does not claim scanning happens automatically.
 */
export const PROXY_SCAN_AVAILABILITY_NOTE =
  "Proxy-cached artifacts in PyPI, npm and Docker/OCI repositories can be scanned at download time when scan-on-proxy is enabled for the repository.";

export const ANALYZABLE_DISABLED_REASON =
  "SBOM generation and on-demand scans are available only for artifacts hosted in this registry. " +
  PROXY_SCAN_AVAILABILITY_NOTE;

/**
 * Whether SBOM generation and security scanning are supported for an artifact.
 *
 * The backend marks proxy-cached remote artifacts with `analyzable: false`
 * (artifact-keeper#2292). Treat a missing or `true` flag as analyzable: the
 * generated SDK type and older/hosted-artifact responses may not carry the
 * field, and those must keep working. Only an explicit `false` disables the
 * SBOM/scan actions, matching the backend's safe default.
 */
export function isArtifactAnalyzable(
  artifact: Pick<Artifact, "analyzable"> | null | undefined,
): boolean {
  return artifact?.analyzable !== false;
}
