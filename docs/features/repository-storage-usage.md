# Repository storage usage panel

The repository detail view shows a **Storage** panel that reports the real,
deduplicated storage footprint of a repository — not just the coarse logical
size. It is backed by the per-repository storage endpoints from backend epic
[`artifact-keeper#2056`](https://github.com/artifact-keeper/artifact-keeper/issues/2056).

## What it shows

| Field | Meaning | Who sees it |
| --- | --- | --- |
| **Logical size** | Sum of referenced artifact sizes, before deduplication (the same value as the repository's `storage_used_bytes`). | Everyone |
| **Blobs** | Number of distinct stored blobs backing the repository. | Everyone |
| **Physical (stored)** | Bytes actually stored after content-addressable deduplication. | Admins, or any viewer on per-repo scope |
| **Dedup ratio** | `logical ÷ physical` (e.g. `2.50×`). | Admins, or any viewer on per-repo scope |
| **Savings** | How much deduplication removed from the logical footprint, in bytes and percent. | Admins, or any viewer on per-repo scope |
| **Unique vs shared** | A bar splitting physical storage into bytes unique to this repository versus bytes shared with other repositories. | Admins, or any viewer on per-repo scope |
| **Instance unique (all repositories)** | Instance-wide unique physical bytes across every repository. | Admins only |
| **Reclaimable now** | An on-demand estimate (garbage-collection dry-run) of how much physical storage could be freed by collecting unreferenced blobs. Nothing is deleted. | Admins only |
| **Computed** | Freshness of the figures (hover for the exact timestamp). | Everyone |

## Dedup scope and the instance caveat

The panel labels the repository's **dedup scope**:

- **Per-repository dedup** (typically a filesystem backend) — the physical,
  unique, and shared figures are scoped to this repository alone.
- **Instance-wide dedup** (typically an object-store backend) — deduplication
  is pooled across the whole instance, so the physical/unique/shared figures
  reflect blobs that may be shared with *other* repositories and are not
  attributable to this repository alone. The panel surfaces this caveat inline.

## Field visibility (security)

On instance-scope backends the dedup breakdown can reveal information about
other tenants' repositories, so the backend
([`artifact-keeper#2560`](https://github.com/artifact-keeper/artifact-keeper/issues/2560))
**omits** `physical_bytes`, `unique_bytes`, `shared_bytes`, and `dedup_ratio`
for non-admin viewers on instance scope. In that case the panel shows only the
logical size and blob count, plus a short note that the detailed breakdown is
available to administrators. The `instance_unique_bytes` figure and the
reclaimable estimate are admin-only both in the API and in the UI.

## Not included (yet)

Folder / path-tree storage rollups are tracked separately for a later release
and are **not** part of this panel, which is repository-level only.
