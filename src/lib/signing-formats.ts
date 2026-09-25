import type { Repository, RepositoryFormat, RepositoryType } from "@/types";

/** Package formats that support repository metadata signing in Artifact Keeper. */
export const SIGNING_FORMATS = new Set<RepositoryFormat>([
  "debian",
  "rpm",
  "alpine",
  "conda",
  "conda_native",
]);

/** Repository types that can host signed package indexes. */
export const SIGNING_REPO_TYPES = new Set<RepositoryType>([
  "local",
  "staging",
  "virtual",
]);

export function supportsRepositorySigning(
  format: RepositoryFormat,
  repoType: RepositoryType,
): boolean {
  return SIGNING_FORMATS.has(format) && SIGNING_REPO_TYPES.has(repoType);
}

export type SigningKeyType = "gpg" | "rsa";

/**
 * The signing key type each format REQUIRES to produce verifiable signatures.
 *
 * - Debian and RPM verify metadata as OpenPGP signatures (apt `signed-by`,
 *   `rpm --import`), so they need a GPG key. RPM's `repomd.xml.asc` is a
 *   detached OpenPGP signature — a raw RSA blob cannot be verified by dnf.
 * - Alpine (`APKINDEX`) and Conda (`repodata.json.sig`) use raw RSA signatures
 *   verified with an RSA public key.
 */
export function requiredKeyType(format: RepositoryFormat): SigningKeyType {
  switch (format) {
    case "debian":
    case "rpm":
      return "gpg";
    case "alpine":
    case "conda":
    case "conda_native":
      return "rsa";
    default:
      return "gpg";
  }
}

/** Backwards-compatible alias; the required type is also the recommended one. */
export function recommendedKeyType(format: RepositoryFormat): SigningKeyType {
  return requiredKeyType(format);
}

/** True when a key of `keyType` can produce valid signatures for `format`. */
export function keyTypeMatchesFormat(
  keyType: string,
  format: RepositoryFormat,
): boolean {
  return keyType.toLowerCase() === requiredKeyType(format);
}

export function metadataLabel(format: RepositoryFormat): string {
  switch (format) {
    case "debian":
      return "Release / InRelease";
    case "rpm":
      return "repomd.xml";
    case "alpine":
      return "APKINDEX";
    case "conda":
    case "conda_native":
      return "repodata";
    default:
      return "repository metadata";
  }
}

export function signingFormatDescription(format: RepositoryFormat): string {
  switch (format) {
    case "debian":
      return "Signs APT Release files so apt clients can verify the repository.";
    case "rpm":
      return "Signs YUM/DNF repository metadata (repomd.xml).";
    case "alpine":
      return "Signs APKINDEX archives for apk clients.";
    case "conda":
    case "conda_native":
      return "Signs Conda repodata for conda/mamba clients.";
    default:
      return "Signs repository metadata for package managers.";
  }
}

export function defaultGpgUidName(repository: Pick<Repository, "name" | "key">): string {
  return `${repository.name} signing`;
}

export function defaultGpgUidEmail(repository: Pick<Repository, "key">): string {
  return `${repository.key}@artifact-keeper.local`;
}

export function filterSelectableKeys<
  T extends { id: string; repository_id: string | null; is_active: boolean },
>(keys: T[], repositoryId: string): T[] {
  return keys.filter(
    (key) => key.is_active && (key.repository_id == null || key.repository_id === repositoryId),
  );
}
