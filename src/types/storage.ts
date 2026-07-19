/**
 * Deduplicated storage usage for a single repository.
 *
 * Returned by `GET /api/v1/repositories/{key}/storage` (backend epic
 * artifact-keeper#2056). The endpoint reports real, dedup-aware storage rather
 * than the coarse logical `storage_used_bytes` carried on the repository
 * record.
 *
 * SECURITY (backend artifact-keeper#2560, v1.6.0): on cloud/object-store
 * backends the dedup scope is instance-wide (`dedup_scope === "instance"`).
 * For those backends the physical/unique/shared/dedup_ratio figures describe
 * blobs that may be shared across *other tenants' repositories*, so the backend
 * now OMITS them for non-admin viewers — a regular user only sees
 * `logical_bytes` and `blob_count`. Every dedup-breakdown field below is
 * therefore optional/nullable and consumers MUST treat "absent" as "not
 * available to me" rather than "zero". On `per_repo` (filesystem) backends the
 * breakdown is scoped to this repository alone and is returned to any viewer
 * who can see the repository.
 */
export type DedupScope = 'per_repo' | 'instance';

export interface RepositoryStorageUsage {
  /** Repository this measurement belongs to. Optional — older backends omit it. */
  repository_key?: string;
  /**
   * Sum of the referenced artifact sizes, before deduplication. This is the
   * same quantity as the repository record's `storage_used_bytes` and is
   * always returned, to every viewer.
   */
  logical_bytes: number;
  /**
   * Bytes physically stored after content-addressable deduplication. Absent
   * for non-admin viewers on `instance` scope (see the security note above).
   */
  physical_bytes?: number | null;
  /**
   * Physical bytes referenced ONLY by this repository (no other repository
   * points at these blobs). Absent for non-admin viewers on `instance` scope.
   */
  unique_bytes?: number | null;
  /**
   * Physical bytes this repository shares with at least one other repository.
   * Absent for non-admin viewers on `instance` scope.
   */
  shared_bytes?: number | null;
  /**
   * Deduplication ratio: `logical_bytes / physical_bytes`. A value of `2.0`
   * means the logical footprint is twice the bytes actually stored. Absent for
   * non-admin viewers on `instance` scope.
   */
  dedup_ratio?: number | null;
  /**
   * Whether dedup accounting is scoped to this repository (`per_repo`,
   * typically a filesystem backend) or shared across the whole instance
   * (`instance`, typically an object-store backend).
   */
  dedup_scope: DedupScope;
  /** Number of distinct stored blobs backing this repository. Always returned. */
  blob_count: number;
  /**
   * ISO-8601 timestamp of when these figures were computed. `null` before the
   * first background refresh has run for the repository (the stats cache is
   * materialized on a schedule + post-GC), so consumers must guard the
   * freshness display on presence.
   */
  computed_at: string | null;
  /**
   * Instance-wide unique physical bytes across ALL repositories. Admin-only —
   * the backend only includes it for admin viewers, so it is optional here and
   * the UI must gate rendering on the caller's admin status as well.
   */
  instance_unique_bytes?: number | null;
}

/**
 * Result of a dedup-aware storage garbage-collection run for a repository.
 *
 * Returned by `POST /api/v1/repositories/{key}/storage-gc`. With
 * `{ dry_run: true }` nothing is deleted — `bytes_freed` reports how much
 * physical storage *would* be reclaimed, which the panel surfaces as the
 * admin-only "reclaimable now" figure. Mirrors the backend `StorageGcResult`.
 */
export interface StorageGcResult {
  artifacts_removed: number;
  bytes_freed: number;
  dry_run: boolean;
  errors: string[];
  storage_keys_deleted: number;
}
