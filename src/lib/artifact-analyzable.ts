import type { Artifact } from "@/types";

/**
 * User-facing explanation shown when SBOM generation / security scanning is
 * offered for an artifact that the backend cannot analyze. Proxy-cached remote
 * artifacts have synthetic ids and no `artifacts` row, so the backend returns
 * 404 for SBOM/scan requests against them (artifact-keeper#2292, backend PR
 * #2291). Surfacing this as a disabled affordance with this reason keeps the
 * action discoverable while making the limitation honest.
 */
export const ANALYZABLE_DISABLED_REASON =
  "SBOM and scanning are available only for artifacts hosted in this registry, not proxy-cached remote artifacts.";

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
