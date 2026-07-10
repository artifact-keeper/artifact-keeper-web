import { z } from "zod";
import { apiFetch } from "@/lib/api/fetch";
import type { RepositoryFormat } from "@/types";

/**
 * Client for the generic-artifact version-history endpoints (#571, backend
 * artifact-keeper#2367).
 *
 * Repositories with `versioning_enabled` (Generic/Mlmodel formats only)
 * append an immutable revision to `artifact_versions` on every
 * different-bytes upload of the same path instead of overwriting in place.
 * The backend exposes:
 *
 *   GET /api/v1/repositories/{key}/versions/{path}  -> ArtifactVersionList
 *       (revision history, newest first; 404 when there is no history)
 *
 *   ?version=<revision|label|latest> on the download and artifact-metadata
 *       routes selects a specific stored revision. A numeric value selects
 *       by server-assigned revision, `latest` (or omitting the parameter)
 *       selects the HEAD, any other string selects by the human
 *       `version_label` recorded at upload time (`X-Artifact-Version`
 *       header). The parameter is ignored on non-versioned repositories.
 *
 * None of this is in the generated SDK yet, so we use the shared `apiFetch`
 * wrapper and validate responses with zod at the trust boundary (same
 * pattern as audit and downloads).
 */

/** One immutable stored revision of a versioned artifact, newest first. */
export interface ArtifactVersionEntry {
  /** Server-assigned auto-increment revision (1-based). */
  revision: number;
  /** Optional human tag supplied via `X-Artifact-Version` at upload time. */
  version_label: string | null;
  size_bytes: number;
  checksum_sha256: string;
  content_type: string;
  /**
   * Uploader user id. The backend records `uploaded_by` on each revision but
   * the current `ArtifactVersionResponse` does not serialize it yet — this
   * field plumbs through as soon as the backend adds it and renders as
   * "unknown" until then (gap noted on #571).
   */
  uploaded_by: string | null;
  /** When this revision was stored, RFC 3339. */
  created_at: string;
}

/** Version history for one artifact coordinate, newest first. */
export interface ArtifactVersionList {
  repository_key: string;
  path: string;
  items: ArtifactVersionEntry[];
}

const VersionEntrySchema = z
  .object({
    revision: z.number(),
    version_label: z.string().nullish(),
    size_bytes: z.number(),
    checksum_sha256: z.string(),
    content_type: z.string(),
    uploaded_by: z.string().nullish(),
    created_at: z.string(),
  })
  .passthrough();

const VersionListSchema = z
  .object({
    repository_key: z.string(),
    path: z.string(),
    items: z.array(VersionEntrySchema),
  })
  .passthrough();

export function parseVersionList(data: unknown): ArtifactVersionList {
  const parsed = VersionListSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      "Version history response did not match the expected shape"
    );
  }
  return {
    repository_key: parsed.data.repository_key,
    path: parsed.data.path,
    items: parsed.data.items.map((v) => ({
      revision: v.revision,
      version_label: v.version_label ?? null,
      size_bytes: v.size_bytes,
      checksum_sha256: v.checksum_sha256,
      content_type: v.content_type,
      uploaded_by: v.uploaded_by ?? null,
      created_at: v.created_at,
    })),
  };
}

/**
 * The only formats whose repositories can opt into first-class versioning
 * (backend `versioning_applies`). Every other format keeps the existing
 * overwrite/409 semantics regardless of the repository flag.
 */
export const VERSIONING_FORMATS: ReadonlySet<RepositoryFormat> = new Set([
  "generic",
  "mlmodel",
]);

/** Whether a repository format participates in first-class versioning. */
export function supportsVersioning(format: RepositoryFormat): boolean {
  return VERSIONING_FORMATS.has(format);
}

/**
 * Encode an artifact path for use inside a URL while keeping `/` separators
 * literal. The backend routes are Axum wildcards (`/versions/*path`,
 * `/download/*path`), so encoding the whole path with `encodeURIComponent`
 * (turning `/` into `%2F`) breaks the wildcard match and 404s — encode each
 * segment individually instead (same rule as `artifactsApi.get`).
 */
export function encodeArtifactPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * Host-less download path for a specific stored revision:
 * `/api/v1/repositories/{key}/download/{path}?version=<selector>`.
 *
 * The path portion is intentionally NOT encoded — it must byte-match the
 * value bound into download tickets (`artifactsApi.createDownloadTicket`
 * binds the ticket to the exact request path; the query string is not part
 * of that comparison, so `?version=` and `&ticket=` can be appended freely).
 */
export function getVersionDownloadPath(
  repoKey: string,
  artifactPath: string,
  selector: number | string
): string {
  const base = `/api/v1/repositories/${repoKey}/download/${artifactPath}`;
  return `${base}?version=${encodeURIComponent(String(selector))}`;
}

/** Matches errors thrown by `apiFetch` for a 404 response. */
function isNotFound(err: unknown): boolean {
  return err instanceof Error && /^API error 404\b/.test(err.message);
}

export const versionsApi = {
  /**
   * List the stored revision history for one artifact coordinate, newest
   * first. The backend answers 404 both for unknown coordinates and for
   * coordinates with no recorded history (versioning disabled, or a HEAD
   * that predates the feature and was never re-uploaded) — normalize that
   * to an empty list so callers can render a plain "no history" state
   * without treating it as a failure.
   */
  list: async (repoKey: string, artifactPath: string): Promise<ArtifactVersionList> => {
    const url =
      `/api/v1/repositories/${encodeURIComponent(repoKey)}` +
      `/versions/${encodeArtifactPath(artifactPath)}`;
    try {
      const raw = await apiFetch<unknown>(url);
      return parseVersionList(raw);
    } catch (err) {
      if (isNotFound(err)) {
        return { repository_key: repoKey, path: artifactPath, items: [] };
      }
      throw err;
    }
  },
};

export default versionsApi;
