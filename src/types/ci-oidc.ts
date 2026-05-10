// Types for CI OIDC provider + identity mapping management.
// These mirror the Rust structs in backend/src/services/ci_oidc_service.rs.

export type CiOidcProviderType = "gitlab" | "github" | "generic";

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export interface CiOidcProvider {
  id: string;
  name: string;
  provider_type: CiOidcProviderType;
  issuer_url: string;
  audience: string;
  is_enabled: boolean;
  /** Number of identity mappings attached to this provider. */
  mapping_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCiOidcProviderRequest {
  name: string;
  provider_type?: CiOidcProviderType;
  issuer_url: string;
  audience?: string;
  is_enabled?: boolean;
}

export interface UpdateCiOidcProviderRequest {
  name?: string;
  provider_type?: CiOidcProviderType;
  issuer_url?: string;
  audience?: string;
  is_enabled?: boolean;
}

export interface CiOidcToggleRequest {
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Identity mappings
// ---------------------------------------------------------------------------

/**
 * Claim filters: each key is a JWT claim name; value is either an exact string
 * or an array of allowed strings (any-of semantics).
 *
 * Examples:
 *   { "namespace_path": "my-group" }
 *   { "namespace_path": ["group-a", "group-b"], "ref_protected": "true" }
 */
export type ClaimFilters = Record<string, string | string[]>;

export interface CiOidcIdentityMapping {
  id: string;
  provider_id: string;
  name: string;
  /** Lower number = higher priority. Evaluated in ascending order. */
  priority: number;
  claim_filters: ClaimFilters;
  /** Optional repository restriction for this mapping. */
  allowed_repo_ids: string[] | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCiOidcMappingRequest {
  name: string;
  priority?: number;
  claim_filters: ClaimFilters;
  allowed_repo_ids?: string[] | null;
  is_enabled?: boolean;
}

export interface UpdateCiOidcMappingRequest {
  name?: string;
  priority?: number;
  claim_filters?: ClaimFilters;
  allowed_repo_ids?: string[] | null;
  is_enabled?: boolean;
}
