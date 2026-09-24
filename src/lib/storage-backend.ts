import type { KnownStorageBackend, RepositoryStorageBackend } from "@/types";

/**
 * Display helpers for a repository's storage backend (#918, backend
 * artifact-keeper#4018).
 */

const STORAGE_BACKEND_LABELS: Record<KnownStorageBackend, string> = {
  filesystem: "Filesystem",
  s3: "S3",
  azure: "Azure Blob",
  gcs: "GCS",
};

function isKnownStorageBackend(value: string): value is KnownStorageBackend {
  return Object.prototype.hasOwnProperty.call(STORAGE_BACKEND_LABELS, value);
}

/**
 * Narrow the raw `storage_backend` wire value. Anything that is not a
 * non-empty string (absent, null, a backend that predates #4018) yields
 * `undefined`; an unrecognised string is kept raw rather than dropped.
 * Never throws.
 */
export function narrowStorageBackend(raw: unknown): RepositoryStorageBackend | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  return isKnownStorageBackend(value)
    ? { known: true, value }
    : { known: false, value };
}

/** Human label: "Filesystem", "S3", ... or the raw value when unrecognised. */
export function storageBackendLabel(backend: RepositoryStorageBackend): string {
  return backend.known ? STORAGE_BACKEND_LABELS[backend.value] : backend.value;
}
