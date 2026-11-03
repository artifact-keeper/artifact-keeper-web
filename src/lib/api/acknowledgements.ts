import { z } from "zod";

import { apiFetch } from "@/lib/api/fetch";
import type {
  AcknowledgementDecision,
  AcknowledgementListResponse,
  ListAcknowledgementsParams,
  RevokeDecisionResponse,
} from "@/types/security";

/**
 * Client for acknowledgement decisions (backend 1.12.0, artifact-keeper#5224).
 *
 * Not in the generated SDK yet, so this goes through `apiFetch` and validates at
 * the trust boundary with zod, like `proxy-scans.ts`. `apiFetch` keeps the HTTP
 * status on failure, which the page needs to tell "you may not list every
 * repository's decisions" (403) from a broken backend.
 */

const DecisionSchema = z
  .object({
    id: z.string(),
    lineage_id: z.string(),
    // Null is meaningful: a decision for every repository holding these bytes.
    repository_id: z.string().nullable(),
    checksum_sha256: z.string(),
    finding_class: z.string(),
    advisory: z.string(),
    component: z.string(),
    component_version: z.string(),
    max_severity: z.string(),
    reason: z.string().nullish(),
    acknowledged_by: z.string().nullish(),
    acknowledged_at: z.string(),
    expires_at: z.string().nullish(),
    created_via: z.string(),
    carried_by: z.string().nullish(),
    revoked_at: z.string().nullish(),
    revoked_by: z.string().nullish(),
    revoked_reason: z.string().nullish(),
    state: z.string(),
  })
  .passthrough();

// `items` is required: a backend that dropped the list must read as a failure,
// not as "no risk has been accepted".
const ListSchema = z
  .object({
    items: z.array(DecisionSchema),
    total: z.number(),
  })
  .passthrough();

const RevokeSchema = z
  .object({
    revoked: z.number(),
    left_effective: z.number(),
  })
  .passthrough();

function mapDecision(raw: z.infer<typeof DecisionSchema>): AcknowledgementDecision {
  return {
    id: raw.id,
    lineage_id: raw.lineage_id,
    repository_id: raw.repository_id,
    checksum_sha256: raw.checksum_sha256,
    finding_class: raw.finding_class,
    advisory: raw.advisory,
    component: raw.component,
    component_version: raw.component_version,
    max_severity: raw.max_severity,
    reason: raw.reason ?? null,
    acknowledged_by: raw.acknowledged_by ?? null,
    acknowledged_at: raw.acknowledged_at,
    expires_at: raw.expires_at ?? null,
    created_via: raw.created_via,
    carried_by: raw.carried_by ?? null,
    revoked_at: raw.revoked_at ?? null,
    revoked_by: raw.revoked_by ?? null,
    revoked_reason: raw.revoked_reason ?? null,
    state: raw.state,
  };
}

export const acknowledgementsApi = {
  /**
   * Decisions, newest first. Only for a caller who may act in every repository,
   * so this is also how the UI learns whether to offer `all_repositories`.
   */
  list: async (
    params: ListAcknowledgementsParams = {},
  ): Promise<AcknowledgementListResponse> => {
    const query = new URLSearchParams();
    if (params.repository_id) query.set("repository_id", params.repository_id);
    if (params.checksum_sha256) query.set("checksum_sha256", params.checksum_sha256);
    if (params.advisory) query.set("advisory", params.advisory);
    if (params.include_inactive) query.set("include_inactive", "true");
    if (params.page !== undefined) query.set("page", String(params.page));
    if (params.per_page !== undefined) query.set("per_page", String(params.per_page));
    const qs = query.toString();
    const suffix = qs ? `?${qs}` : "";
    const raw = await apiFetch<unknown>(`/api/v1/security/acknowledgements${suffix}`);
    const parsed = ListSchema.parse(raw);
    return { items: parsed.items.map(mapDecision), total: parsed.total };
  },

  /** Revoke one decision and as much of its lineage as the caller may undo. */
  revoke: async (id: string): Promise<RevokeDecisionResponse> => {
    const raw = await apiFetch<unknown>(
      `/api/v1/security/acknowledgements/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    const parsed = RevokeSchema.parse(raw);
    return { revoked: parsed.revoked, left_effective: parsed.left_effective };
  },
};
