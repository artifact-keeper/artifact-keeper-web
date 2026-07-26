import '@/lib/sdk-client';
import {
  listReviews,
  getReview,
  approveReview,
  rejectReview,
  getRepoAgeGate,
} from '@artifact-keeper/sdk';
import type { AgeGateReviewResponse, AgeGateConfigResponse } from '@artifact-keeper/sdk';
import { assertData } from '@/lib/api/fetch';

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
  reviewReason: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

export interface ListAgeGateReviewsParams {
  /** `pending` | `approved` | `rejected` (server-side filter). */
  status?: string;
  repositoryKey?: string;
  page?: number;
  perPage?: number;
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
        status: params.status,
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
