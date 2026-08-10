import '@/lib/sdk-client';
import {
  ciOidcListProviders as sdkCiOidcListProviders,
  createProvider as sdkCreateProvider,
  getProvider as sdkGetProvider,
  updateProvider as sdkUpdateProvider,
  deleteProvider as sdkDeleteProvider,
  toggleProvider as sdkToggleProvider,
  listMappings as sdkListMappings,
  createMapping as sdkCreateMapping,
  getMapping as sdkGetMapping,
  updateMapping as sdkUpdateMapping,
  deleteMapping as sdkDeleteMapping,
  toggleMapping as sdkToggleMapping,
} from '@artifact-keeper/sdk';
import type {
  CiOidcProviderResponse as SdkCiOidcProviderResponse,
  CiOidcMappingResponse as SdkCiOidcMappingResponse,
  CreateCiOidcProviderRequest as SdkCreateCiOidcProviderRequest,
  UpdateCiOidcProviderRequest as SdkUpdateCiOidcProviderRequest,
  CreateCiOidcMappingRequest as SdkCreateCiOidcMappingRequest,
  UpdateCiOidcMappingRequest as SdkUpdateCiOidcMappingRequest,
} from '@artifact-keeper/sdk';
import { assertData } from '@/lib/api/fetch';
import { unwrap } from '@/lib/sdk-utils';
import type {
  CiOidcProvider,
  CiOidcIdentityMapping,
  ClaimFilters,
  CreateCiOidcProviderRequest,
  UpdateCiOidcProviderRequest,
  CreateCiOidcMappingRequest,
  UpdateCiOidcMappingRequest,
} from '@/types/ci-oidc';

function adaptProvider(sdk: SdkCiOidcProviderResponse): CiOidcProvider {
  return {
    id: sdk.id,
    name: sdk.name,
    provider_type: sdk.provider_type,
    issuer_url: sdk.issuer_url,
    audience: sdk.audience,
    is_enabled: sdk.is_enabled,
    mapping_count: sdk.mapping_count,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
  };
}

function adaptMapping(sdk: SdkCiOidcMappingResponse): CiOidcIdentityMapping {
  return {
    id: sdk.id,
    provider_id: sdk.provider_id,
    name: sdk.name,
    priority: sdk.priority,
    claim_filters: sdk.claim_filters as ClaimFilters,
    allowed_repo_ids: sdk.allowed_repo_ids ?? null,
    is_enabled: sdk.is_enabled,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
  };
}

export const ciOidcApi = {
  // --- Providers ---

  list: async (): Promise<CiOidcProvider[]> => {
    const data = await unwrap(sdkCiOidcListProviders());
    return assertData(data, 'ciOidcApi.list').map(adaptProvider);
  },

  get: async (id: string): Promise<CiOidcProvider> => {
    const data = await unwrap(sdkGetProvider({ path: { id } }));
    return adaptProvider(assertData(data, 'ciOidcApi.get'));
  },

  create: async (
    req: CreateCiOidcProviderRequest,
  ): Promise<CiOidcProvider> => {
    const data = await unwrap(sdkCreateProvider({
      body: req satisfies SdkCreateCiOidcProviderRequest,
    }));
    return adaptProvider(assertData(data, 'ciOidcApi.create'));
  },

  update: async (
    id: string,
    req: UpdateCiOidcProviderRequest,
  ): Promise<CiOidcProvider> => {
    const data = await unwrap(sdkUpdateProvider({
      path: { id },
      body: req satisfies SdkUpdateCiOidcProviderRequest,
    }));
    return adaptProvider(assertData(data, 'ciOidcApi.update'));
  },

  delete: async (id: string): Promise<void> => {
    await unwrap(sdkDeleteProvider({ path: { id } }));
  },

  enableProvider: async (id: string): Promise<void> => {
    await unwrap(sdkToggleProvider({
      path: { id },
      body: { enabled: true },
    }));
  },

  disableProvider: async (id: string): Promise<void> => {
    await unwrap(sdkToggleProvider({
      path: { id },
      body: { enabled: false },
    }));
  },

  // --- Identity mappings (nested under a provider) ---

  listMappings: async (providerId: string): Promise<CiOidcIdentityMapping[]> => {
    const data = await unwrap(sdkListMappings({ path: { id: providerId } }));
    return assertData(data, 'ciOidcApi.listMappings').map(adaptMapping);
  },

  getMapping: async (
    providerId: string,
    mappingId: string,
  ): Promise<CiOidcIdentityMapping> => {
    const data = await unwrap(sdkGetMapping({
      path: { id: providerId, mid: mappingId },
    }));
    return adaptMapping(assertData(data, 'ciOidcApi.getMapping'));
  },

  createMapping: async (
    providerId: string,
    req: CreateCiOidcMappingRequest,
  ): Promise<CiOidcIdentityMapping> => {
    const data = await unwrap(sdkCreateMapping({
      path: { id: providerId },
      body: req satisfies SdkCreateCiOidcMappingRequest,
    }));
    return adaptMapping(assertData(data, 'ciOidcApi.createMapping'));
  },

  updateMapping: async (
    providerId: string,
    mappingId: string,
    req: UpdateCiOidcMappingRequest,
  ): Promise<CiOidcIdentityMapping> => {
    const data = await unwrap(sdkUpdateMapping({
      path: { id: providerId, mid: mappingId },
      body: req satisfies SdkUpdateCiOidcMappingRequest,
    }));
    return adaptMapping(assertData(data, 'ciOidcApi.updateMapping'));
  },

  deleteMapping: async (
    providerId: string,
    mappingId: string,
  ): Promise<void> => {
    await unwrap(sdkDeleteMapping({
      path: { id: providerId, mid: mappingId },
    }));
  },

  enableMapping: async (
    providerId: string,
    mappingId: string,
  ): Promise<void> => {
    await unwrap(sdkToggleMapping({
      path: { id: providerId, mid: mappingId },
      body: { enabled: true },
    }));
  },

  disableMapping: async (
    providerId: string,
    mappingId: string,
  ): Promise<void> => {
    await unwrap(sdkToggleMapping({
      path: { id: providerId, mid: mappingId },
      body: { enabled: false },
    }));
  },
};