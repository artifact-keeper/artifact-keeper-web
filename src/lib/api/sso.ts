import apiClient from "@/lib/api-client";
import type {
  SsoProvider,
  OidcConfig,
  LdapConfig,
  SamlConfig,
  LdapTestResult,
  CreateOidcConfigRequest,
  UpdateOidcConfigRequest,
  CreateLdapConfigRequest,
  UpdateLdapConfigRequest,
  CreateSamlConfigRequest,
  UpdateSamlConfigRequest,
} from "@/types/sso";

export const ssoApi = {
  // --- Providers (public) ---

  listProviders: async (): Promise<SsoProvider[]> => {
    const response = await apiClient.get<SsoProvider[]>(
      "/api/v1/auth/sso/providers"
    );
    return response.data;
  },

  // --- OIDC ---

  listOidc: async (): Promise<OidcConfig[]> => {
    const response = await apiClient.get<OidcConfig[]>(
      "/api/v1/admin/sso/oidc"
    );
    return response.data;
  },

  getOidc: async (id: string): Promise<OidcConfig> => {
    const response = await apiClient.get<OidcConfig>(
      `/api/v1/admin/sso/oidc/${id}`
    );
    return response.data;
  },

  createOidc: async (data: CreateOidcConfigRequest): Promise<OidcConfig> => {
    const response = await apiClient.post<OidcConfig>(
      "/api/v1/admin/sso/oidc",
      data
    );
    return response.data;
  },

  updateOidc: async (
    id: string,
    data: UpdateOidcConfigRequest
  ): Promise<OidcConfig> => {
    const response = await apiClient.put<OidcConfig>(
      `/api/v1/admin/sso/oidc/${id}`,
      data
    );
    return response.data;
  },

  deleteOidc: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/admin/sso/oidc/${id}`);
  },

  enableOidc: async (id: string): Promise<void> => {
    await apiClient.post(`/api/v1/admin/sso/oidc/${id}/enable`);
  },

  disableOidc: async (id: string): Promise<void> => {
    await apiClient.post(`/api/v1/admin/sso/oidc/${id}/disable`);
  },

  // --- LDAP ---

  listLdap: async (): Promise<LdapConfig[]> => {
    const response = await apiClient.get<LdapConfig[]>(
      "/api/v1/admin/sso/ldap"
    );
    return response.data;
  },

  getLdap: async (id: string): Promise<LdapConfig> => {
    const response = await apiClient.get<LdapConfig>(
      `/api/v1/admin/sso/ldap/${id}`
    );
    return response.data;
  },

  createLdap: async (data: CreateLdapConfigRequest): Promise<LdapConfig> => {
    const response = await apiClient.post<LdapConfig>(
      "/api/v1/admin/sso/ldap",
      data
    );
    return response.data;
  },

  updateLdap: async (
    id: string,
    data: UpdateLdapConfigRequest
  ): Promise<LdapConfig> => {
    const response = await apiClient.put<LdapConfig>(
      `/api/v1/admin/sso/ldap/${id}`,
      data
    );
    return response.data;
  },

  deleteLdap: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/admin/sso/ldap/${id}`);
  },

  enableLdap: async (id: string): Promise<void> => {
    await apiClient.post(`/api/v1/admin/sso/ldap/${id}/enable`);
  },

  disableLdap: async (id: string): Promise<void> => {
    await apiClient.post(`/api/v1/admin/sso/ldap/${id}/disable`);
  },

  ldapLogin: async (
    providerId: string,
    username: string,
    password: string
  ): Promise<{ access_token: string; refresh_token: string }> => {
    const response = await apiClient.post<{
      access_token: string;
      refresh_token: string;
    }>(`/api/v1/auth/sso/ldap/${providerId}/login`, { username, password });
    return response.data;
  },

  testLdap: async (id: string): Promise<LdapTestResult> => {
    const response = await apiClient.post<LdapTestResult>(
      `/api/v1/admin/sso/ldap/${id}/test`
    );
    return response.data;
  },

  // --- SAML ---

  listSaml: async (): Promise<SamlConfig[]> => {
    const response = await apiClient.get<SamlConfig[]>(
      "/api/v1/admin/sso/saml"
    );
    return response.data;
  },

  getSaml: async (id: string): Promise<SamlConfig> => {
    const response = await apiClient.get<SamlConfig>(
      `/api/v1/admin/sso/saml/${id}`
    );
    return response.data;
  },

  createSaml: async (data: CreateSamlConfigRequest): Promise<SamlConfig> => {
    const response = await apiClient.post<SamlConfig>(
      "/api/v1/admin/sso/saml",
      data
    );
    return response.data;
  },

  updateSaml: async (
    id: string,
    data: UpdateSamlConfigRequest
  ): Promise<SamlConfig> => {
    const response = await apiClient.put<SamlConfig>(
      `/api/v1/admin/sso/saml/${id}`,
      data
    );
    return response.data;
  },

  deleteSaml: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/admin/sso/saml/${id}`);
  },

  enableSaml: async (id: string): Promise<void> => {
    await apiClient.post(`/api/v1/admin/sso/saml/${id}/enable`);
  },

  disableSaml: async (id: string): Promise<void> => {
    await apiClient.post(`/api/v1/admin/sso/saml/${id}/disable`);
  },
};

export default ssoApi;
