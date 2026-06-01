import { apiFetch } from '@/lib/api/fetch';

export interface AgeGateReview {
  id: string;
  repository_key: string;
  package_name: string;
  package_version: string;
  upstream_published_at?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_reason?: string | null;
  request_count: number;
  last_requested_at: string;
}

export interface AgeGateReviewListResponse {
  items: AgeGateReview[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export interface AgeGateConfig {
  repository_key: string;
  enabled: boolean;
  min_age_days: number;
}

const ageGateApi = {
  listReviews: async (params?: {
    repository_key?: string;
    status?: string;
    page?: number;
    per_page?: number;
  }): Promise<AgeGateReviewListResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.repository_key) searchParams.set('repository_key', params.repository_key);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.per_page) searchParams.set('per_page', String(params.per_page));
    const qs = searchParams.toString();
    return apiFetch<AgeGateReviewListResponse>(
      `/api/v1/admin/age-gate/reviews${qs ? `?${qs}` : ''}`,
    );
  },

  getReview: async (id: string): Promise<AgeGateReview> => {
    return apiFetch<AgeGateReview>(`/api/v1/admin/age-gate/reviews/${id}`);
  },

  approve: async (id: string, reason?: string): Promise<AgeGateReview> => {
    return apiFetch<AgeGateReview>(`/api/v1/admin/age-gate/reviews/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  reject: async (id: string, reason?: string): Promise<AgeGateReview> => {
    return apiFetch<AgeGateReview>(`/api/v1/admin/age-gate/reviews/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  getRepoConfig: async (repoKey: string): Promise<AgeGateConfig> => {
    return apiFetch<AgeGateConfig>(`/api/v1/repositories/${encodeURIComponent(repoKey)}/age-gate`);
  },

  updateRepoConfig: async (
    repoKey: string,
    config: Pick<AgeGateConfig, 'enabled' | 'min_age_days'>,
  ): Promise<AgeGateConfig> => {
    return apiFetch<AgeGateConfig>(
      `/api/v1/repositories/${encodeURIComponent(repoKey)}/age-gate`,
      {
        method: 'PUT',
        body: JSON.stringify(config),
      },
    );
  },
};

export default ageGateApi;
