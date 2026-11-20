import { apiFetch } from '@/lib/api/fetch';
import type { QuarantineFields } from '@/lib/quarantine';

/**
 * Per-artifact quarantine status and the three admin transitions.
 *
 * These routes are not in the generated `@artifact-keeper/sdk`, so they go
 * through `apiFetch` — the same escape hatch `repositoriesApi.setReleaseTarget`
 * uses for fields the SDK has not been regenerated for. Once the SDK carries
 * the quarantine operations this module can switch over without any caller
 * changing.
 */

/** Response of `GET /api/v1/quarantine/{artifact_id}`. */
export interface QuarantineStatus extends QuarantineFields {
  artifact_id: string;
  /** Always present on this endpoint: it exists to load exactly this. */
  is_blocked: boolean;
  quarantine_status: string | null;
  quarantine_until: string | null;
  /**
   * Absent (not null) when the caller cannot access the repository. The
   * status is still authoritative in that case; only the reason is withheld.
   */
  quarantine_reason?: string | null;
}

/** Response of each of the three admin transitions. */
export interface QuarantineActionResult {
  artifact_id: string;
  /** `quarantined` | `released` | `rejected`. */
  new_status: string;
  message: string;
  /**
   * Set only when the action carried `expected_digest` and the OCI tag had
   * moved to another image before it landed (backend #5646 / #5766): the row
   * of the reviewed image that took the action instead.
   */
  held_artifact_id?: string;
  /** The digest (`sha256:<hex>`) the action was applied to: the one reviewed. */
  held_digest?: string;
  /** The digest the tag names now. This action did not change it. */
  moved_to_digest?: string;
}

function quarantinePath(artifactId: string, action?: string): string {
  const base = `/api/v1/quarantine/${encodeURIComponent(artifactId)}`;
  return action ? `${base}/${action}` : base;
}

/**
 * The backend deserializes the body with a required JSON extractor, so a body
 * is always sent; `reason` itself is optional, and a blank or whitespace-only
 * reason becomes null rather than an empty string the audit log would have to
 * store.
 */
function reasonBody(reason?: string, expectedDigest?: string): string {
  const trimmed = reason?.trim();
  return JSON.stringify({
    reason: trimmed ? trimmed : null,
    ...(expectedDigest ? { expected_digest: expectedDigest } : {}),
  });
}

/*
 * `expected_digest` is sent unconditionally (no `backendAtLeast` gate). No
 * 1.12.x backend rejects it: `/quarantine` and `/reject` have deserialized it
 * (`#[serde(default)]`, no `deny_unknown_fields`) since 1.12.0, and `/release`
 * before 1.12.4 takes no body extractor at all, so the body is never read.
 * An older backend simply binds to whatever the row names on arrival, as it
 * did before.
 */

export const quarantineApi = {
  /**
   * Read one artifact's quarantine state, including the reason. Artifact
   * payloads carry the verdict (`quarantine_status`) but never the reason
   * (artifact-keeper#2966), so this is the only way to show why a held
   * artifact is held — and the fallback verdict source for a response from
   * a backend too old to serialize `quarantine_status` at all.
   */
  getStatus: (artifactId: string): Promise<QuarantineStatus> =>
    apiFetch<QuarantineStatus>(quarantinePath(artifactId)),

  /**
   * Lift a hold (admin only). 403 for a non-admin, 404 if no such artifact,
   * 409 unless the artifact is currently `quarantined`. Takes no reason: the
   * backend clears `quarantine_reason` on release.
   */
  release: (artifactId: string, expectedDigest?: string): Promise<QuarantineActionResult> =>
    apiFetch<QuarantineActionResult>(quarantinePath(artifactId, 'release'), {
      method: 'POST',
      body: JSON.stringify(expectedDigest ? { expected_digest: expectedDigest } : {}),
    }),

  /**
   * Reject a held artifact (admin only), permanently refusing its bytes. The
   * reason is optional and is persisted, replacing whatever the preceding
   * quarantine recorded. Same 403/404/409 conditions as `release`.
   */
  reject: (
    artifactId: string,
    reason?: string,
    expectedDigest?: string
  ): Promise<QuarantineActionResult> =>
    apiFetch<QuarantineActionResult>(quarantinePath(artifactId, 'reject'), {
      method: 'POST',
      body: reasonBody(reason, expectedDigest),
    }),

  /**
   * Place an artifact under an unconditional admin hold (admin only). 409 if
   * the artifact was already rejected in review, which cannot be downgraded.
   */
  quarantine: (
    artifactId: string,
    reason?: string,
    expectedDigest?: string
  ): Promise<QuarantineActionResult> =>
    apiFetch<QuarantineActionResult>(quarantinePath(artifactId, 'quarantine'), {
      method: 'POST',
      body: reasonBody(reason, expectedDigest),
    }),
};

