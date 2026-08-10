import type {
  CiOidcProviderResponse,
  CreateCiOidcProviderRequest,
  UpdateCiOidcProviderRequest,
  CiOidcToggleRequest,
  CreateCiOidcMappingRequest,
  UpdateCiOidcMappingRequest,
} from "@artifact-keeper/sdk";

export type CiOidcProvider = CiOidcProviderResponse;
export type CiOidcProviderType = "gitlab" | "github" | "generic";
export type ClaimFilters = Record<string, string | string[]>;

export interface CiOidcIdentityMapping {
  id: string;
  provider_id: string;
  name: string;
  priority: number;
  claim_filters: ClaimFilters;
  allowed_repo_ids: string[] | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type {
  CreateCiOidcProviderRequest,
  UpdateCiOidcProviderRequest,
  CiOidcToggleRequest,
  CreateCiOidcMappingRequest,
  UpdateCiOidcMappingRequest,
};