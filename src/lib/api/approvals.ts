import { apiFetch } from '@/lib/api/fetch';
import type { ApprovalRequest, ApprovalListResponse } from '@/types/promotion';

const approvalsApi = {
  /**
   * List pending approval requests
   */
  listPending: async (params?: {
    page?: number;
    per_page?: number;
    source_repository?: string;
  }): Promise<ApprovalListResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.per_page) searchParams.set('per_page', String(params.per_page));
    if (params?.source_repository) searchParams.set('source_repository', params.source_repository);
    const qs = searchParams.toString();
    return apiFetch<ApprovalListResponse>(`/api/v1/approval/pending${qs ? `?${qs}` : ''}`);
  },

  /**
   * List approval history (completed approvals)
   */
  listHistory: async (params?: {
    page?: number;
    per_page?: number;
    status?: string;
    source_repository?: string;
  }): Promise<ApprovalListResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.per_page) searchParams.set('per_page', String(params.per_page));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.source_repository) searchParams.set('source_repository', params.source_repository);
    const qs = searchParams.toString();
    return apiFetch<ApprovalListResponse>(`/api/v1/approval/history${qs ? `?${qs}` : ''}`);
  },

  /**
   * Get a single approval request by ID
   */
  get: async (id: string): Promise<ApprovalRequest> => {
    return apiFetch<ApprovalRequest>(`/api/v1/approval/${id}`);
  },

  /**
   * Approve a pending approval request
   */
  approve: async (id: string, notes?: string): Promise<ApprovalRequest> => {
    return apiFetch<ApprovalRequest>(`/api/v1/approval/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  },

  /**
   * Reject a pending approval request
   */
  reject: async (id: string, notes?: string): Promise<ApprovalRequest> => {
    return apiFetch<ApprovalRequest>(`/api/v1/approval/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  },
};

export default approvalsApi;
