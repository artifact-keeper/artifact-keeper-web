import '@/lib/sdk-client';
import {
  listProviders as sdkListProviders,
  listOidc as sdkListOidc,
  getOidc as sdkGetOidc,
  createOidc as sdkCreateOidc,
  updateOidc as sdkUpdateOidc,
  deleteOidc as sdkDeleteOidc,
  toggleOidc as sdkToggleOidc,
  listLdap as sdkListLdap,
  getLdap as sdkGetLdap,
  createLdap as sdkCreateLdap,
  updateLdap as sdkUpdateLdap,
  deleteLdap as sdkDeleteLdap,
  toggleLdap as sdkToggleLdap,
  testLdap as sdkTestLdap,
  ldapLogin as sdkLdapLogin,
  listSaml as sdkListSaml,
  getSaml as sdkGetSaml,
  createSaml as sdkCreateSaml,
  updateSaml as sdkUpdateSaml,
  deleteSaml as sdkDeleteSaml,
  toggleSaml as sdkToggleSaml,
  exchangeCode as sdkExchangeCode,
} from '@artifact-keeper/sdk';
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
    const { data, error } = await sdkListProviders();
    if (error) throw error;
    return data as never;
  },

  // --- OIDC ---

  listOidc: async (): Promise<OidcConfig[]> => {
    const { data, error } = await sdkListOidc();
    if (error) throw error;
    return data as never;
  },

  getOidc: async (id: string): Promise<OidcConfig> => {
    const { data, error } = await sdkGetOidc({ path: { id } });
    if (error) throw error;
    return data as never;
  },

  createOidc: async (reqData: CreateOidcConfigRequest): Promise<OidcConfig> => {
    const { data, error } = await sdkCreateOidc({ body: reqData as never });
    if (error) throw error;
    return data as never;
  },

  updateOidc: async (
    id: string,
    reqData: UpdateOidcConfigRequest
  ): Promise<OidcConfig> => {
    const { data, error } = await sdkUpdateOidc({ path: { id }, body: reqData as never });
    if (error) throw error;
    return data as never;
  },

  deleteOidc: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteOidc({ path: { id } });
    if (error) throw error;
  },

  enableOidc: async (id: string): Promise<void> => {
    const { error } = await sdkToggleOidc({ path: { id }, body: { enabled: true } as never });
    if (error) throw error;
  },

  disableOidc: async (id: string): Promise<void> => {
    const { error } = await sdkToggleOidc({ path: { id }, body: { enabled: false } as never });
    if (error) throw error;
  },

  // --- LDAP ---

  listLdap: async (): Promise<LdapConfig[]> => {
    const { data, error } = await sdkListLdap();
    if (error) throw error;
    return data as never;
  },

  getLdap: async (id: string): Promise<LdapConfig> => {
    const { data, error } = await sdkGetLdap({ path: { id } });
    if (error) throw error;
    return data as never;
  },

  createLdap: async (reqData: CreateLdapConfigRequest): Promise<LdapConfig> => {
    const { data, error } = await sdkCreateLdap({ body: reqData as never });
    if (error) throw error;
    return data as never;
  },

  updateLdap: async (
    id: string,
    reqData: UpdateLdapConfigRequest
  ): Promise<LdapConfig> => {
    const { data, error } = await sdkUpdateLdap({ path: { id }, body: reqData as never });
    if (error) throw error;
    return data as never;
  },

  deleteLdap: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteLdap({ path: { id } });
    if (error) throw error;
  },

  enableLdap: async (id: string): Promise<void> => {
    const { error } = await sdkToggleLdap({ path: { id }, body: { enabled: true } as never });
    if (error) throw error;
  },

  disableLdap: async (id: string): Promise<void> => {
    const { error } = await sdkToggleLdap({ path: { id }, body: { enabled: false } as never });
    if (error) throw error;
  },

  ldapLogin: async (
    providerId: string,
    username: string,
    password: string
  ): Promise<{ access_token: string; refresh_token: string }> => {
    const { data, error } = await sdkLdapLogin({
      path: { id: providerId },
      body: { username, password } as never,
    });
    if (error) throw error;
    return data as never;
  },

  testLdap: async (id: string): Promise<LdapTestResult> => {
    const { data, error } = await sdkTestLdap({ path: { id } });
    if (error) throw error;
    return data as never;
  },

  // --- SAML ---

  listSaml: async (): Promise<SamlConfig[]> => {
    const { data, error } = await sdkListSaml();
    if (error) throw error;
    return data as never;
  },

  getSaml: async (id: string): Promise<SamlConfig> => {
    const { data, error } = await sdkGetSaml({ path: { id } });
    if (error) throw error;
    return data as never;
  },

  createSaml: async (reqData: CreateSamlConfigRequest): Promise<SamlConfig> => {
    const { data, error } = await sdkCreateSaml({ body: reqData as never });
    if (error) throw error;
    return data as never;
  },

  updateSaml: async (
    id: string,
    reqData: UpdateSamlConfigRequest
  ): Promise<SamlConfig> => {
    const { data, error } = await sdkUpdateSaml({ path: { id }, body: reqData as never });
    if (error) throw error;
    return data as never;
  },

  deleteSaml: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteSaml({ path: { id } });
    if (error) throw error;
  },

  enableSaml: async (id: string): Promise<void> => {
    const { error } = await sdkToggleSaml({ path: { id }, body: { enabled: true } as never });
    if (error) throw error;
  },

  disableSaml: async (id: string): Promise<void> => {
    const { error } = await sdkToggleSaml({ path: { id }, body: { enabled: false } as never });
    if (error) throw error;
  },

  // --- Exchange Code ---

  exchangeCode: async (
    code: string
  ): Promise<{ access_token: string; refresh_token: string }> => {
    const { data, error } = await sdkExchangeCode({ body: { code } as never });
    if (error) throw error;
    return data as never;
  },
};

export default ssoApi;
