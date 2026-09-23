import { apiFetch } from './fetch';
import { readTokenExpiryInfo, type TokenExpiryInfo } from './token-policy';

export interface ServiceAccount {
  id: string;
  username: string;
  display_name?: string;
  is_active: boolean;
  token_count: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceAccountDetail {
  id: string;
  username: string;
  display_name?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateServiceAccountRequest {
  name: string;
  description?: string;
}

export interface UpdateServiceAccountRequest {
  display_name?: string;
  is_active?: boolean;
}

export interface ServiceAccountToken {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  expires_at?: string;
  last_used_at?: string;
  created_at: string;
  is_expired: boolean;
  repo_selector?: RepoSelector;
  repository_ids: string[];
  /**
   * How many virtual-repository members this token cannot reach
   * (artifact-keeper#4215). Absent on backends before 1.11.
   */
  unreachable_member_count?: number;
}

export interface RepoSelector {
  match_labels?: Record<string, string>;
  match_formats?: string[];
  match_pattern?: string;
  match_repos?: string[];
  /**
   * Add the members of every matched virtual repository to the token's scope
   * (backend artifact-keeper#4130).
   *
   * A token scoped to a virtual repository alone reads nothing through it: the
   * listing and download paths resolve the virtual's MEMBERS and drop the ones
   * outside the token's scope. With this set, the selector is re-resolved at
   * authentication time, so a member added to the virtual later is covered
   * without minting a new token.
   *
   * It widens a match rather than filtering, so it is NOT one of the filters
   * that make a selector non-empty — the backend refuses a selector that sets
   * only this, because an empty selector means unrestricted.
   */
  include_virtual_members?: boolean;
}

/**
 * Why one member of a virtual repository is out of reach for a token
 * (backend artifact-keeper#4215). A closed set, so the UI groups on it rather
 * than parsing the message.
 */
export type UnreachableReason = 'out_of_token_scope' | 'no_grant';

export interface UnreachableMember {
  repo_key: string;
  reason: UnreachableReason;
}

export interface UnreachableVirtual {
  virtual_repo_key: string;
  members: UnreachableMember[];
}

export interface TokenScopeAnalysis {
  unreachable: UnreachableVirtual[];
  unreachable_member_count: number;
}

export interface MatchedRepository {
  id: string;
  key: string;
  format: string;
}

export interface PreviewRepoSelectorResponse {
  matched_repositories: MatchedRepository[];
  total: number;
  /**
   * Members of a matched virtual repository this scope would not reach
   * (backend artifact-keeper#4215). Absent on backends before 1.11, and only
   * populated when the preview is asked on behalf of a service account.
   */
  unreachable?: UnreachableVirtual[];
}

export interface CreateTokenRequest {
  name: string;
  scopes: string[];
  expires_in_days?: number;
  description?: string;
  repository_ids?: string[];
  repo_selector?: RepoSelector;
}

/**
 * A freshly minted service-account token. `expires_at` / `policy_applied` come
 * from the instance token expiration policy (backend artifact-keeper#3460) —
 * service accounts are exempt from it unless `apply_to_service_accounts` is
 * set — and are what the one-time reveal reports (web #854).
 */
export interface CreateTokenResponse extends TokenExpiryInfo {
  id: string;
  token: string;
  name: string;
}

export const serviceAccountsApi = {
  list: async (): Promise<ServiceAccount[]> => {
    const data = await apiFetch<{ items: ServiceAccount[] }>(
      '/api/v1/service-accounts'
    );
    return data.items;
  },

  get: async (id: string): Promise<ServiceAccountDetail> => {
    return apiFetch<ServiceAccountDetail>(`/api/v1/service-accounts/${id}`);
  },

  create: async (
    req: CreateServiceAccountRequest
  ): Promise<ServiceAccountDetail> => {
    return apiFetch<ServiceAccountDetail>('/api/v1/service-accounts', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  update: async (
    id: string,
    req: UpdateServiceAccountRequest
  ): Promise<ServiceAccountDetail> => {
    return apiFetch<ServiceAccountDetail>(`/api/v1/service-accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req),
    });
  },

  delete: async (id: string): Promise<void> => {
    await apiFetch<void>(`/api/v1/service-accounts/${id}`, {
      method: 'DELETE',
    });
  },

  listTokens: async (id: string): Promise<ServiceAccountToken[]> => {
    const data = await apiFetch<{ items: ServiceAccountToken[] }>(
      `/api/v1/service-accounts/${id}/tokens`
    );
    return data.items;
  },

  createToken: async (
    id: string,
    req: CreateTokenRequest
  ): Promise<CreateTokenResponse> => {
    const raw = await apiFetch<CreateTokenResponse>(
      `/api/v1/service-accounts/${id}/tokens`,
      {
        method: 'POST',
        body: JSON.stringify(req),
      }
    );
    return { ...raw, ...readTokenExpiryInfo(raw) };
  },

  revokeToken: async (id: string, tokenId: string): Promise<void> => {
    await apiFetch<void>(`/api/v1/service-accounts/${id}/tokens/${tokenId}`, {
      method: 'DELETE',
    });
  },

  /**
   * `serviceAccountId` is optional and only sharpens the answer: with it the
   * backend can also report members the account has no grant on, which it
   * cannot know otherwise (artifact-keeper#4215).
   */
  previewRepoSelector: async (
    selector: RepoSelector,
    serviceAccountId?: string
  ): Promise<PreviewRepoSelectorResponse> => {
    return apiFetch<PreviewRepoSelectorResponse>(
      '/api/v1/service-accounts/repo-selector/preview',
      {
        method: 'POST',
        body: JSON.stringify({
          repo_selector: selector,
          ...(serviceAccountId ? { service_account_id: serviceAccountId } : {}),
        }),
      }
    );
  },

  /** Which members this token cannot read, and why (artifact-keeper#4215). */
  getTokenScopeAnalysis: async (
    accountId: string,
    tokenId: string
  ): Promise<TokenScopeAnalysis> => {
    return apiFetch<TokenScopeAnalysis>(
      `/api/v1/service-accounts/${accountId}/tokens/${tokenId}/scope-analysis`
    );
  },
};

