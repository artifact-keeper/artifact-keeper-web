import { z } from "zod";
import { apiFetch } from "@/lib/api/fetch";

/**
 * Admin maintenance actions (#859).
 *
 * Backend 1.10.0 ships two one-shot, idempotent repair actions an operator is
 * expected to run after an upgrade or a restore-from-backup. Neither is in the
 * generated SDK yet (backend 1.10.0, artifact-keeper#3650 / #3659 / #3660), so
 * both go through the shared `apiFetch` wrapper with zod validation at the
 * trust boundary (same pattern as rate-limits and downloads).
 *
 * Endpoints (both admin-guarded server-side):
 *   POST /api/v1/admin/storage/ledger/backfill          -> LedgerBackfillResult
 *   POST /api/v1/admin/packages/backfill?repository_key= -> PackagesBackfillResult
 */

/** One repository's before/after row in a storage-ledger backfill. */
export interface LedgerBackfillRepository {
  repository_id: string;
  repository_key: string;
  /**
   * Ledger total before the backfill, or `null` when the repository had no
   * ledger row at all — the restore-from-backup case, where the rows were
   * inserted without firing the triggers that maintain the ledger.
   */
  before_total_bytes: number | null;
  /** Ledger total after the backfill: `hosted + proxy + oci`. */
  after_total_bytes: number;
  after_hosted_bytes: number;
  after_proxy_bytes: number;
  after_oci_bytes: number;
  /** `after_total_bytes - before_total_bytes`, counting a missing row as 0. */
  drift_bytes: number;
}

export interface LedgerBackfillResult {
  repositories_checked: number;
  /** Repositories whose ledger total changed. */
  repositories_repaired: number;
  /** Repositories deleted between the scan and their recompute — not an error. */
  repositories_skipped: number;
  /** Sum of the absolute per-repository corrections, in bytes. */
  total_drift_bytes: number;
  before_total_storage_bytes: number;
  after_total_storage_bytes: number;
  /** Per-repository detail, ordered by repository key. */
  repositories: LedgerBackfillRepository[];
}

export interface PackagesBackfillResult {
  message: string;
  /** Live artifact rows considered. */
  artifacts_scanned: number;
  /** Catalog upserts performed. */
  packages_registered: number;
  /** Rows with no derivable package coordinates (index/sidecar rows). */
  artifacts_skipped: number;
  /** Rows whose upsert errored; the walk continues past them. */
  artifacts_failed: number;
}

const LedgerBackfillRepositorySchema = z
  .object({
    repository_id: z.string(),
    repository_key: z.string(),
    // Serialized as `null` for a repository that had no ledger row; normalized
    // so consumers only ever branch on `null`.
    before_total_bytes: z
      .number()
      .nullish()
      .transform((v) => v ?? null),
    after_total_bytes: z.number(),
    after_hosted_bytes: z.number(),
    after_proxy_bytes: z.number(),
    after_oci_bytes: z.number(),
    drift_bytes: z.number(),
  })
  .passthrough();

const LedgerBackfillResponseSchema = z
  .object({
    repositories_checked: z.number(),
    repositories_repaired: z.number(),
    repositories_skipped: z.number(),
    total_drift_bytes: z.number(),
    before_total_storage_bytes: z.number(),
    after_total_storage_bytes: z.number(),
    repositories: z.array(LedgerBackfillRepositorySchema).default([]),
  })
  .passthrough();

const PackagesBackfillResponseSchema = z
  .object({
    message: z.string(),
    artifacts_scanned: z.number(),
    packages_registered: z.number(),
    artifacts_skipped: z.number(),
    artifacts_failed: z.number(),
  })
  .passthrough();

export const maintenanceApi = {
  /**
   * Recompute `repository_usage_ledger` from the authoritative tables, repairing
   * the storage headline after a restore-from-backup (artifact-keeper#3650).
   * Idempotent: a consistent instance comes back with `total_drift_bytes: 0`.
   */
  backfillStorageLedger: async (): Promise<LedgerBackfillResult> => {
    const data = await apiFetch<unknown>(
      "/api/v1/admin/storage/ledger/backfill",
      { method: "POST" },
    );
    return LedgerBackfillResponseSchema.parse(data);
  },

  /**
   * Replay existing artifacts through the package-catalog upsert so packages
   * published before catalog registration landed become visible on the Packages
   * page (artifact-keeper#3659, #3660). Idempotent. Pass a repository key to
   * scope the walk; omit it to walk every catalog-eligible hosted repository.
   */
  backfillPackages: async (
    repositoryKey?: string,
  ): Promise<PackagesBackfillResult> => {
    const key = repositoryKey?.trim();
    const query = key ? `?repository_key=${encodeURIComponent(key)}` : "";
    const data = await apiFetch<unknown>(
      `/api/v1/admin/packages/backfill${query}`,
      { method: "POST" },
    );
    return PackagesBackfillResponseSchema.parse(data);
  },
};
