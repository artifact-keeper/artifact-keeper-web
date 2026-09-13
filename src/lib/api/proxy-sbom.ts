import { apiFetch } from "@/lib/api/fetch";
import type { ProxySbomFormat } from "@/types/proxy-sbom";

/**
 * Client for the proxy-cache SBOM endpoint.
 *
 * Like the verdict client this goes through `apiFetch` rather than the
 * generated SDK, so the HTTP status survives on `ApiError.status`: the panel
 * has to tell a 401 (anonymous viewer — "Sign in to view") apart from a 404
 * (no inventory recorded for this path), and neither may render as an empty
 * component table.
 *
 * The response is returned unparsed. The document is a CycloneDX or SPDX body
 * whose exact envelope the backend has not pinned down, so normalization
 * happens in `@/lib/proxy-sbom` where it can be exercised against every
 * variant.
 */
export const proxySbomApi = {
  async get(
    repoKey: string,
    path: string,
    format: ProxySbomFormat = "cyclonedx",
  ): Promise<unknown> {
    const query = new URLSearchParams({ path, format });
    return apiFetch<unknown>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/security/proxy-sbom?${query.toString()}`,
    );
  },
};
