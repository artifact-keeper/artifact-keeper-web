import { apiFetch } from '@/lib/api/fetch';
import type { RepositoryStorageUsage, StorageGcResult } from '@/types/storage';

/**
 * Per-repository deduplicated storage endpoints (backend epic
 * artifact-keeper#2056).
 *
 * These routes are new to the backend and are NOT yet exposed by the published
 * `@artifact-keeper/sdk` (v1.5.0 only ships the instance-wide
 * `/admin/analytics/storage/breakdown` + `/admin/storage-gc` operations, which
 * report a single `storage_bytes` figure and no dedup breakdown). Until the SDK
 * is regenerated from the backend spec, they go through the shared `apiFetch`
 * wrapper — the same pattern used for routing-rules, upstream-auth, and the age
 * policy in `repositories.ts`.
 */
export const storageApi = {
  /**
   * Read the dedup-aware storage usage for a repository.
   *
   * The response shape varies by viewer and backend: on `instance` scope
   * non-admin callers receive only `logical_bytes` + `blob_count` (the dedup
   * breakdown fields are omitted by the backend — artifact-keeper#2560), so
   * callers must treat those fields as optional.
   */
  getUsage: async (repoKey: string): Promise<RepositoryStorageUsage> => {
    return apiFetch<RepositoryStorageUsage>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/storage`,
    );
  },

  /**
   * Run a dedup-aware storage garbage-collection pass for a repository.
   *
   * `dryRun` (default true) asks the backend to report what *would* be
   * reclaimed without deleting anything; the panel uses the returned
   * `bytes_freed` as the admin-only "reclaimable now" estimate. This endpoint
   * is admin-gated on the backend, so callers should only offer it to admins.
   */
  runGc: async (repoKey: string, dryRun = true): Promise<StorageGcResult> => {
    return apiFetch<StorageGcResult>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/storage-gc`,
      {
        method: 'POST',
        body: JSON.stringify({ dry_run: dryRun }),
      },
    );
  },
};

export default storageApi;
