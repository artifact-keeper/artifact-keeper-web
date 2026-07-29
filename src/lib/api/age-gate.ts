import '@/lib/sdk-client';
import {
  listReviews,
  getReview,
  approveReview,
  rejectReview,
  getRepoAgeGate,
} from '@artifact-keeper/sdk';
import type { AgeGateReviewResponse, AgeGateConfigResponse } from '@artifact-keeper/sdk';
import { ApiError, apiFetch, assertData } from '@/lib/api/fetch';

/** Every state a review can be in. */
export const AGE_GATE_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type AgeGateStatus = (typeof AGE_GATE_STATUSES)[number];

/**
 * A package version the age gate held back: an upstream release younger
 * than the repository's configured minimum age, waiting for an admin to
 * approve or reject early access to it.
 */
export interface AgeGateReview {
  id: string;
  packageName: string;
  packageVersion: string;
  repositoryKey: string;
  /** `pending` | `approved` | `rejected`. */
  status: string;
  /** How many times a client has requested this held version. */
  requestCount: number;
  requestedAt: string;
  lastRequestedAt: string;
  /** When the upstream registry published this release, if known. */
  upstreamPublishedAt: string | null;
  /**
   * How old the release was, in days, at first request (`requestedAt` minus
   * `upstreamPublishedAt`). Null when the upstream publish date is unknown.
   */
  ageDaysAtRequest: number | null;
  /**
   * The reason recorded with the last decision, or with the reopen that
   * undid one. Whatever the acting admin typed; may be null.
   */
  reviewReason: string | null;
  reviewedAt: string | null;
  /**
   * User id of the admin who decided, not a username. Null on a pending
   * review, including one that was reopened: the backend clears the reviewer
   * so a reopened row does not read as already handled.
   */
  reviewedBy: string | null;
}

export interface ListAgeGateReviewsParams {
  /**
   * Statuses to include. The backend takes these as one comma-separated
   * `status` value and returns the union, so pagination totals stay honest
   * across a multi-status view. Omit to list every status.
   */
  statuses?: readonly AgeGateStatus[];
  repositoryKey?: string;
  page?: number;
  perPage?: number;
}

/**
 * Raised when a transition needs `reopen` and this backend has no such
 * endpoint. Carries copy the page shows as-is, since the admin has done
 * nothing wrong and there is no client-side retry that would help.
 */
export class ReopenUnsupportedError extends Error {
  constructor() {
    super(
      'This server does not support reopening a decided age gate review, so its status cannot be changed. Deciding a review that is still pending works as usual.',
    );
    this.name = 'ReopenUnsupportedError';
  }
}

/**
 * Whether the backend serving this session has the reopen endpoint. Starts
 * optimistic and only ever latches off, so a version check never has to enter
 * the picture: the endpoint's own 404 is the signal.
 *
 * Module-level rather than component state because it is a property of the
 * server, not of one mounted page, and it must survive navigating away and
 * back. `useSyncExternalStore` in the page subscribes to it so the control
 * updates the moment the first attempt discovers the gap.
 */
let reopenSupported = true;
const reopenSupportListeners = new Set<() => void>();

/** Current capability state. Stable identity for `useSyncExternalStore`. */
export function isReopenSupported(): boolean {
  return reopenSupported;
}

/** Subscribe to capability changes. Returns an unsubscribe function. */
export function subscribeReopenSupport(onChange: () => void): () => void {
  reopenSupportListeners.add(onChange);
  return () => {
    reopenSupportListeners.delete(onChange);
  };
}

function setReopenSupported(next: boolean) {
  if (reopenSupported === next) return;
  reopenSupported = next;
  for (const listener of reopenSupportListeners) listener();
}

/** Test seam: restore the optimistic starting state between cases. */
export function resetReopenSupport() {
  setReopenSupported(true);
}

/**
 * True when a 404 came from the router rather than from the reopen handler.
 *
 * Both "no such endpoint" and "no such review" are 404s and they mean
 * completely different things: the first is permanent for the session, the
 * second is about one id. They are told apart by the body. A backend that has
 * the endpoint answers an unknown id with its structured error envelope
 * (`{"code":"NOT_FOUND","message":"Age gate review not found"}`); a backend
 * that never routed the request has no handler to build one and falls through
 * to the framework's default 404, which has an empty body.
 *
 * So only a 404 whose body is not that envelope is read as a missing
 * endpoint. An unknown review id keeps its `code` and is surfaced as the
 * ordinary error it is, leaving the capability alone.
 */
function isMissingEndpoint(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 404) return false;
  try {
    const parsed: unknown = JSON.parse(err.body);
    const code = (parsed as { code?: unknown } | null)?.code;
    return typeof code !== 'string';
  } catch {
    // Empty or non-JSON body: nothing on the API side answered.
    return true;
  }
}

/**
 * Raised when a status change that took two calls completed the first and
 * failed on the second.
 *
 * Moving a decided review straight to the other decision is reopen followed by
 * approve or reject. If the second call fails the review is not in the status
 * the operator saw when they picked, and it is not in the one they asked for
 * either: it is pending, and the gate is back on. Reporting a plain failure
 * would leave them believing the original decision still stands.
 */
export class AgeGatePartialTransitionError extends Error {
  /** What the review is actually in now. */
  readonly currentStatus: AgeGateStatus;
  /** What the operator asked for and did not get. */
  readonly intendedStatus: AgeGateStatus;
  /** Whatever the failing second call threw, for the underlying detail. */
  readonly failure: unknown;

  constructor(currentStatus: AgeGateStatus, intendedStatus: AgeGateStatus, failure: unknown) {
    super(
      `The review was reopened but could not be ${intendedStatus === 'approved' ? 'approved' : 'rejected'}. It is now ${currentStatus}.`,
    );
    this.name = 'AgeGatePartialTransitionError';
    this.currentStatus = currentStatus;
    this.intendedStatus = intendedStatus;
    this.failure = failure;
  }
}

/** A repository's age gate policy: hold releases younger than `minAgeDays`. */
export interface AgeGateRepoConfig {
  repositoryKey: string;
  enabled: boolean;
  minAgeDays: number;
}

function daysBetween(earlier: string, later: string): number | null {
  const from = new Date(earlier).getTime();
  const to = new Date(later).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

function adaptReview(sdk: AgeGateReviewResponse): AgeGateReview {
  const upstreamPublishedAt = sdk.upstream_published_at ?? null;
  return {
    id: sdk.id,
    packageName: sdk.package_name,
    packageVersion: sdk.package_version,
    repositoryKey: sdk.repository_key,
    status: sdk.status,
    requestCount: sdk.request_count,
    requestedAt: sdk.requested_at,
    lastRequestedAt: sdk.last_requested_at,
    upstreamPublishedAt,
    ageDaysAtRequest: upstreamPublishedAt ? daysBetween(upstreamPublishedAt, sdk.requested_at) : null,
    reviewReason: sdk.review_reason ?? null,
    reviewedAt: sdk.reviewed_at ?? null,
    reviewedBy: sdk.reviewed_by ?? null,
  };
}

function adaptConfig(sdk: AgeGateConfigResponse): AgeGateRepoConfig {
  return {
    repositoryKey: sdk.repository_key,
    enabled: sdk.enabled,
    minAgeDays: sdk.min_age_days,
  };
}

const ageGateApi = {
  /** List package versions in the age gate review queue. */
  listReviews: async (params: ListAgeGateReviewsParams = {}): Promise<AgeGateReview[]> => {
    const { data, error } = await listReviews({
      query: {
        status: params.statuses?.length ? params.statuses.join(',') : undefined,
        repository_key: params.repositoryKey,
        page: params.page,
        per_page: params.perPage,
      },
    });
    if (error) throw error;
    return assertData(data, 'ageGateApi.listReviews').items.map(adaptReview);
  },

  getReview: async (id: string): Promise<AgeGateReview> => {
    const { data, error } = await getReview({ path: { id } });
    if (error) throw error;
    return adaptReview(assertData(data, 'ageGateApi.getReview'));
  },

  approveReview: async (id: string, reason?: string): Promise<AgeGateReview> => {
    const { data, error } = await approveReview({ path: { id }, body: { reason: reason ?? null } });
    if (error) throw error;
    return adaptReview(assertData(data, 'ageGateApi.approveReview'));
  },

  rejectReview: async (id: string, reason?: string): Promise<AgeGateReview> => {
    const { data, error } = await rejectReview({ path: { id }, body: { reason: reason ?? null } });
    if (error) throw error;
    return adaptReview(assertData(data, 'ageGateApi.rejectReview'));
  },

  /**
   * Return a decided review to `pending`, which re-applies the gate: the
   * version is withheld again until someone decides it a second time.
   *
   * Goes through `apiFetch` because `reopen` is not in the generated SDK yet.
   * The reason is required and non-blank here as well as on the server, since
   * a blank one costs a round trip to learn nothing, and the reopen is the one
   * action whose audit entry has nothing else to say why a recorded decision
   * was reversed.
   */
  reopenReview: async (id: string, reason: string): Promise<AgeGateReview> => {
    const why = reason.trim();
    if (!why) throw new Error('A reason is required to reopen a review.');
    // Already known missing: fail without spending a round trip re-probing.
    if (!reopenSupported) throw new ReopenUnsupportedError();
    try {
      const sdk = await apiFetch<AgeGateReviewResponse>(
        `/api/v1/admin/age-gate/reviews/${encodeURIComponent(id)}/reopen`,
        { method: 'POST', body: JSON.stringify({ reason: why }) },
      );
      // Reaching a response at all proves the endpoint is there.
      setReopenSupported(true);
      return adaptReview(sdk);
    } catch (err) {
      if (isMissingEndpoint(err)) {
        setReopenSupported(false);
        throw new ReopenUnsupportedError();
      }
      throw err;
    }
  },

  /**
   * Move a review to `target`, whatever it is in now.
   *
   * Approve and reject only accept a pending review, so changing a decision
   * means reopening first and deciding second. That is two calls presented as
   * one action, and the halfway state is real: if the second call fails the
   * review sits at `pending` rather than at either end. That case throws
   * `AgeGatePartialTransitionError` so the caller can say what actually
   * happened instead of reporting the whole thing as a no-op.
   */
  changeReviewStatus: async (
    review: AgeGateReview,
    target: AgeGateStatus,
    reason: string,
  ): Promise<AgeGateReview> => {
    const why = reason.trim();
    if (review.status === target) {
      throw new Error(`This review is already ${target}.`);
    }

    const decide = (id: string) =>
      target === 'approved'
        ? ageGateApi.approveReview(id, why || undefined)
        : ageGateApi.rejectReview(id, why || undefined);

    if (review.status === 'pending') {
      // target cannot be 'pending' here: the equality guard above covers it.
      return decide(review.id);
    }

    // Outside the try below on purpose: a reopen that never happened, whether
    // because the endpoint is missing or for any other reason, leaves the
    // review exactly as it was. Only a failure after a successful reopen is a
    // partial transition.
    const reopened = await ageGateApi.reopenReview(review.id, why);
    if (target === 'pending') return reopened;
    try {
      return await decide(review.id);
    } catch (failure) {
      throw new AgeGatePartialTransitionError('pending', target, failure);
    }
  },

  /**
   * Fetch the age gate policy for each distinct repository key so the queue
   * can show how far a held release fell short of the minimum age. A repo
   * with no policy configured errors on lookup; that's treated as "no
   * policy" rather than surfaced, since it isn't a review-queue failure.
   */
  getRepoConfigs: async (repositoryKeys: string[]): Promise<Record<string, AgeGateRepoConfig>> => {
    const unique = [...new Set(repositoryKeys)];
    const entries = await Promise.all(
      unique.map(async (key) => {
        const { data, error } = await getRepoAgeGate({ path: { key } });
        if (error) return null;
        return adaptConfig(assertData(data, 'ageGateApi.getRepoConfigs'));
      }),
    );
    const configs: Record<string, AgeGateRepoConfig> = {};
    for (const cfg of entries) {
      if (cfg) configs[cfg.repositoryKey] = cfg;
    }
    return configs;
  },
};

export default ageGateApi;
