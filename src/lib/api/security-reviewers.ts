import { apiFetch, ApiError } from '@/lib/api/fetch';

/** Who holds the global security-reviewer role, admin-only */
export interface SecurityReviewers {
  users: Array<{
    id: string;
    username: string;
    display_name: string | null;
    is_active: boolean;
  }>;
  groups: Array<{
    id: string;
    name: string;
    external_source: string | null;
    member_count: number;
  }>;
}

export type ReviewerKind = 'users' | 'groups';

const BASE = '/api/v1/admin/security-reviewers';

export const securityReviewersApi = {
  /** Null on a backend without the endpoint, so callers hide the feature */
  list: async (): Promise<SecurityReviewers | null> => {
    try {
      return await apiFetch<SecurityReviewers>(BASE);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },

  set: (kind: ReviewerKind, id: string, reviewer: boolean): Promise<void> =>
    apiFetch<void>(`${BASE}/${kind}/${encodeURIComponent(id)}`, {
      method: reviewer ? 'PUT' : 'DELETE',
    }),
};
