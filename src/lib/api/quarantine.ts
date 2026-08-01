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
}

function quarantinePath(artifactId: string, action?: string): string {
  const base = `/api/v1/quarantine/${encodeURIComponent(artifactId)}`;
  return action ? `${base}/${action}` : base;
}

/**
 * The backend takes `reason` as an optional field of a required JSON body, so
 * the key is always sent; a blank or whitespace-only reason becomes null
 * rather than an empty string the audit log would have to store.
 */
function reasonBody(reason?: string): string {
  const trimmed = reason?.trim();
  return JSON.stringify({ reason: trimmed ? trimmed : null });
}

export const quarantineApi = {
  /**
   * Read one artifact's quarantine state. Needed for artifacts reached through
   * a surface that does not carry the quarantine fields (the by-path detail
   * endpoint behind the Maven grouped view, for instance), where their absence
   * means "not loaded" rather than "not held".
   */
  getStatus: (artifactId: string): Promise<QuarantineStatus> =>
    apiFetch<QuarantineStatus>(quarantinePath(artifactId)),

  /**
   * Lift a hold (admin only). 403 for a non-admin, 404 if no such artifact,
   * 409 unless the artifact is currently `quarantined`. Takes no reason: the
   * backend clears `quarantine_reason` on release.
   */
  release: (artifactId: string): Promise<QuarantineActionResult> =>
    apiFetch<QuarantineActionResult>(quarantinePath(artifactId, 'release'), {
      method: 'POST',
      body: '{}',
    }),

  /**
   * Reject a held artifact (admin only), permanently refusing its bytes. The
   * reason is optional and is persisted, replacing whatever the preceding
   * quarantine recorded. Same 403/404/409 conditions as `release`.
   */
  reject: (artifactId: string, reason?: string): Promise<QuarantineActionResult> =>
    apiFetch<QuarantineActionResult>(quarantinePath(artifactId, 'reject'), {
      method: 'POST',
      body: reasonBody(reason),
    }),

  /**
   * Place an artifact under an unconditional admin hold (admin only). 409 if
   * the artifact was already rejected in review, which cannot be downgraded.
   */
  quarantine: (artifactId: string, reason?: string): Promise<QuarantineActionResult> =>
    apiFetch<QuarantineActionResult>(quarantinePath(artifactId, 'quarantine'), {
      method: 'POST',
      body: reasonBody(reason),
    }),
};

