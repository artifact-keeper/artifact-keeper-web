import '@/lib/sdk-client';
import { getRepositoryStorage } from '@artifact-keeper/sdk';
import type { RepositoryStorageStatsResponse } from '@artifact-keeper/sdk';
import { apiFetch, assertData, narrowEnum } from '@/lib/api/fetch';
import type {
  DedupScope,
  RepositoryStorageUsage,
  StorageGcResult,
} from '@/types/storage';

/**
 * Deduplicated storage endpoints (backend epic artifact-keeper#2056).
 *
 * `getUsage` now goes through the generated `@artifact-keeper/sdk` — the
 * repo-level `getRepositoryStorage` operation (`GET /repositories/{key}/storage`)
 * shipped with sdk@1.6.0, so the previous `apiFetch` workaround has been
 * collapsed back to the generated client, adapting the SDK response at the
 * trust boundary (`assertData` + `narrowEnum` for the free-form `dedup_scope`).
 *
 * `runGc` deliberately STAYS on `apiFetch`: the per-repository GC endpoint
 * (`POST /repositories/{key}/storage-gc`) is still absent from the SDK. The
 * only garbage-collection operation the generated client exposes is the
 * instance-wide `runStorageGc` (`POST /admin/storage-gc`), which is a different,
 * admin-only, whole-instance surface — it is NOT the per-repo dry-run the panel
 * needs for its "reclaimable now" estimate. Once the backend spec grows a
 * per-repo GC operation this can collapse to the generated call too.
 */

const DEDUP_SCOPES = new Set<DedupScope>(['per_repo', 'instance']);

/**
 * Adapt the generated `RepositoryStorageStatsResponse` to the local
 * `RepositoryStorageUsage`. The SDK types `dedup_scope` as a free-form string,
 * so it is narrowed to the `DedupScope` union (defaulting to `instance`, the
 * conservative choice — it triggers the cross-tenant caveat copy rather than
 * implying a repository-scoped guarantee we can't verify).
 */
function adaptUsage(sdk: RepositoryStorageStatsResponse): RepositoryStorageUsage {
  return {
    repository_key: sdk.repository_key,
    logical_bytes: sdk.logical_bytes,
    physical_bytes: sdk.physical_bytes,
    unique_bytes: sdk.unique_bytes,
    shared_bytes: sdk.shared_bytes,
    dedup_ratio: sdk.dedup_ratio,
    dedup_scope: narrowEnum(
      sdk.dedup_scope,
      DEDUP_SCOPES,
      'instance',
      `storageApi.getUsage: unknown dedup_scope "${sdk.dedup_scope}" — ` +
        `defaulting to 'instance'.`,
    ),
    blob_count: sdk.blob_count,
    computed_at: sdk.computed_at ?? null,
    instance_unique_bytes: sdk.instance_unique_bytes,
  };
}

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
    const { data, error } = await getRepositoryStorage({
      path: { key: repoKey },
    });
    if (error) throw error;
    return adaptUsage(assertData(data, 'storageApi.getUsage'));
  },

  /**
   * Run a dedup-aware storage garbage-collection pass for a repository.
   *
   * `dryRun` (default true) asks the backend to report what *would* be
   * reclaimed without deleting anything; the panel uses the returned
   * `bytes_freed` as the admin-only "reclaimable now" estimate. This endpoint
   * is admin-gated on the backend, so callers should only offer it to admins.
   *
   * Still on `apiFetch`: the per-repo `/storage-gc` operation is not in the
   * SDK (see the module note above), so the zod-free `apiFetch` trust boundary
   * is retained here — this is the one operation that remains genuinely absent
   * from the generated client.
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
