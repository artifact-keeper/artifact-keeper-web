/**
 * Feature gates on the connected backend's version, as `/health` reports it
 * (`version` is the backend's `CARGO_PKG_VERSION`).
 */

const SEMVER_RE =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

interface ParsedVersion {
  core: [number, number, number];
  prerelease: boolean;
}

function parse(version: string | null | undefined): ParsedVersion | null {
  if (typeof version !== "string") return null;
  const m = SEMVER_RE.exec(version.trim());
  if (!m) return null;
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    prerelease: m[4] !== undefined,
  };
}

/**
 * Whether `version` is at least `minimum`, by semver precedence.
 *
 * Deliberately conservative, because a gate that opens too early offers a
 * feature the server does not have:
 * - an unknown or unparseable version (or a pre-release `minimum`) is
 *   `false`;
 * - a pre-release sorts before its release, so `1.11.0-rc.1` and
 *   `1.11.0-dev` are below `1.11.0` (backend `main` builds report the last
 *   released workspace version, not the next one, so a pre-release of the
 *   minimum is not evidence that the feature is in);
 * - build metadata (`+sha`) is ignored, as semver says, so `1.11.0+abc123`
 *   is `1.11.0`.
 */
export function backendAtLeast(
  version: string | null | undefined,
  minimum: string
): boolean {
  const have = parse(version);
  const need = parse(minimum);
  // The minimum names a release; pre-release identifiers are not compared.
  if (!have || !need || need.prerelease) return false;
  for (let i = 0; i < 3; i++) {
    if (have.core[i] !== need.core[i]) return have.core[i] > need.core[i];
  }
  // Same numeric version: a pre-release is below the release.
  return !have.prerelease;
}

/**
 * Backend release that accepts and enforces `repo_selector` on personal
 * tokens (`POST /api/v1/auth/tokens`, artifact-keeper#4219).
 */
export const PERSONAL_TOKEN_REPO_SELECTOR_MIN = "1.11.0";

/**
 * Backend release that accepts the package age policy on Remote (proxy)
 * repositories: proxied content carries a releasable, release-date-aware
 * hold from artifact-keeper#4264 (#3912). Earlier backends answer 400.
 */
export const PROXY_AGE_POLICY_MIN = "1.11.0";
