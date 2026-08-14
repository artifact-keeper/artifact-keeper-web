/**
 * Types for the proxy-cache SBOM endpoint.
 *
 * ```
 * GET /api/v1/repositories/:key/security/proxy-sbom?path=…&format=cyclonedx|spdx
 * ```
 *
 * Every inline proxy scan already produces a complete package inventory while
 * cataloging the archive; this endpoint serves it as a CycloneDX (default) or
 * SPDX document. Like the verdict endpoint, lookup is by cache path — a digest
 * parameter would be a cross-tenant lookup oracle — and authentication is
 * required unconditionally.
 *
 * Only PyPI, npm and Docker/OCI proxies run an inline scan, so those are the
 * only repositories that have an inventory to serve.
 */

export type ProxySbomFormat = "cyclonedx" | "spdx";

/**
 * One catalogued package, normalized across both document formats so the table
 * does not need to know which one it is rendering.
 */
export interface ProxySbomComponent {
  name: string;
  version: string | null;
  /** SPDX expression or license id. Null when the document asserts nothing. */
  license: string | null;
  purl: string | null;
}

/**
 * What the panel actually renders.
 *
 * `absent` and `present`-with-components are deliberately the only two
 * outcomes. A document that parses but catalogues nothing is reported as
 * `absent`: an empty component table would read as "this artifact has no
 * dependencies", which is a claim the data cannot support — the same class of
 * bug as the green all-clear shield.
 */
export type ProxySbomInventory =
  | { kind: "absent" }
  | {
      kind: "present";
      /** The format the document declared, when it declared one. */
      format: ProxySbomFormat | "unknown";
      components: ProxySbomComponent[];
      completeness: ProxySbomCompleteness;
    };

/**
 * Whether the scan believes it cataloged everything.
 *
 * `unknown` is the honest default when the document says nothing: the UI must
 * not claim completeness it cannot prove, but it also must not warn about
 * every SBOM on a backend that never emits the field. Only an explicit
 * non-complete value raises the banner.
 */
export type ProxySbomCompleteness = "complete" | "partial" | "unknown";
