import { apiFetch } from "@/lib/api/fetch";
import type {
  CiOidcProvider,
  CiOidcIdentityMapping,
  CreateCiOidcProviderRequest,
  UpdateCiOidcProviderRequest,
  CiOidcToggleRequest,
  CreateCiOidcMappingRequest,
  UpdateCiOidcMappingRequest,
} from "@/types/ci-oidc";

const BASE = "/api/v1/admin/ci-oidc";

export const ciOidcApi = {
  // -------------------------------------------------------------------------
  // Providers
  // -------------------------------------------------------------------------

  list(): Promise<CiOidcProvider[]> {
    return apiFetch<CiOidcProvider[]>(BASE);
  },

  get(id: string): Promise<CiOidcProvider> {
    return apiFetch<CiOidcProvider>(`${BASE}/${id}`);
  },

  create(req: CreateCiOidcProviderRequest): Promise<CiOidcProvider> {
    return apiFetch<CiOidcProvider>(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  },

  update(id: string, req: UpdateCiOidcProviderRequest): Promise<CiOidcProvider> {
    return apiFetch<CiOidcProvider>(`${BASE}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  },

  delete(id: string): Promise<void> {
    return apiFetch<void>(`${BASE}/${id}`, { method: "DELETE" });
  },

  toggle(id: string, req: CiOidcToggleRequest): Promise<CiOidcProvider> {
    return apiFetch<CiOidcProvider>(`${BASE}/${id}/toggle`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  },

  // -------------------------------------------------------------------------
  // Identity mappings (nested under a provider)
  // -------------------------------------------------------------------------

  listMappings(providerId: string): Promise<CiOidcIdentityMapping[]> {
    return apiFetch<CiOidcIdentityMapping[]>(`${BASE}/${providerId}/mappings`);
  },

  getMapping(providerId: string, mappingId: string): Promise<CiOidcIdentityMapping> {
    return apiFetch<CiOidcIdentityMapping>(`${BASE}/${providerId}/mappings/${mappingId}`);
  },

  createMapping(
    providerId: string,
    req: CreateCiOidcMappingRequest,
  ): Promise<CiOidcIdentityMapping> {
    return apiFetch<CiOidcIdentityMapping>(`${BASE}/${providerId}/mappings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  },

  updateMapping(
    providerId: string,
    mappingId: string,
    req: UpdateCiOidcMappingRequest,
  ): Promise<CiOidcIdentityMapping> {
    return apiFetch<CiOidcIdentityMapping>(`${BASE}/${providerId}/mappings/${mappingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  },

  deleteMapping(providerId: string, mappingId: string): Promise<void> {
    return apiFetch<void>(`${BASE}/${providerId}/mappings/${mappingId}`, {
      method: "DELETE",
    });
  },

  toggleMapping(
    providerId: string,
    mappingId: string,
    req: CiOidcToggleRequest,
  ): Promise<CiOidcIdentityMapping> {
    return apiFetch<CiOidcIdentityMapping>(
      `${BASE}/${providerId}/mappings/${mappingId}/toggle`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      },
    );
  },
};
