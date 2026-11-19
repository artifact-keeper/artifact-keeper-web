import { z } from "zod";
import { ApiError, apiFetch, queryString } from "@/lib/api/fetch";

/** Only `pending`, `running` and `failed` exist: a completed job is deleted. */
export const QUEUE_STATES = ["pending", "running", "failed"] as const;
export type QueueState = (typeof QUEUE_STATES)[number];

/** The only kinds a producer enqueues; the backend 400s on anything else. */
export const QUEUE_KINDS = ["proxy_file", "hosted_artifact"] as const;
export type QueueKind = (typeof QUEUE_KINDS)[number];

const scanQueueJobSchema = z.object({
  id: z.string(),
  kind: z.string(),
  state: z.string(),
  priority: z.number(),
  attempts: z.number(),
  max_attempts: z.number(),
  repository_id: z.string().nullish(),
  target: z.string().nullish(),
  digest: z.string().nullish(),
  artifact_id: z.string().nullish(),
  last_error: z.string().nullish(),
  claimed_by: z.string().nullish(),
  created_at: z.string(),
  next_attempt_at: z.string(),
  claim_expires_at: z.string().nullish(),
});

const scanQueueDepthSchema = z.object({
  kind: z.string(),
  state: z.string(),
  jobs: z.number(),
  oldest_pending_secs: z.number().nullish(),
});

const scanQueueResponseSchema = z.object({
  /** `SCAN_QUEUE_ENABLED` on the backend; absent on a backend that predates the flag. */
  enabled: z.boolean().optional(),
  items: z.array(scanQueueJobSchema).default([]),
  depth: z.array(scanQueueDepthSchema).default([]),
  total: z.number(),
});

export type ScanQueueJob = z.infer<typeof scanQueueJobSchema>;
export type ScanQueueDepth = z.infer<typeof scanQueueDepthSchema>;
export type ScanQueueResponse = z.infer<typeof scanQueueResponseSchema>;

export interface ScanQueueQuery {
  state?: QueueState;
  kind?: QueueKind;
  page?: number;
  perPage?: number;
}

export const scanQueueApi = {
  /** `null` when the backend has no scan queue endpoint (404). */
  list: async (
    query: ScanQueueQuery = {},
  ): Promise<ScanQueueResponse | null> => {
    let data: unknown;
    try {
      data = await apiFetch<unknown>(
        `/api/v1/admin/security/scan-queue${queryString({
          state: query.state,
          kind: query.kind,
          page: query.page,
          per_page: query.perPage,
        })}`,
        { method: "GET" },
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
    return scanQueueResponseSchema.parse(data);
  },
};
