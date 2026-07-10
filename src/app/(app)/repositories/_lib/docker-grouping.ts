/**
 * Docker display helpers.
 *
 * This module used to hold the client-side Docker artifact grouping (issue
 * #330): the frontend re-derived tag rows from ONE page of the flat artifact
 * list using registry path conventions. That approach silently missed every
 * tag whose manifest row sorted past the first page and could not compute
 * true image sizes, so the grouped view now consumes the backend's
 * server-side rollup (`?group_by=docker_tag`, backend ak#1336) instead —
 * same pattern as the Maven component grouping. Only the presentation-layer
 * digest helper remains here.
 */

const DIGEST_PREFIX = "sha256:";

/** Truncate a `sha256:abcdef…` digest to a short user-friendly form. */
export function truncateDigest(digest: string | undefined | null, head = 12): string {
  if (!digest) return "";
  if (digest.startsWith(DIGEST_PREFIX)) {
    return `${DIGEST_PREFIX}${digest.slice(DIGEST_PREFIX.length, DIGEST_PREFIX.length + head)}`;
  }
  return digest.length > head ? `${digest.slice(0, head)}…` : digest;
}
