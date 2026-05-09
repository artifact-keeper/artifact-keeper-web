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
  SsoProviderInfo as SdkSsoProviderInfo,
  OidcConfigResponse as SdkOidcConfigResponse,
  LdapConfigResponse as SdkLdapConfigResponse,
  SamlConfigResponse as SdkSamlConfigResponse,
  LdapTestResult as SdkLdapTestResult,
  ExchangeCodeResponse as SdkExchangeCodeResponse,
  CreateOidcConfigRequest as SdkCreateOidcConfigRequest,
  UpdateOidcConfigRequest as SdkUpdateOidcConfigRequest,
  CreateLdapConfigRequest as SdkCreateLdapConfigRequest,
  UpdateLdapConfigRequest as SdkUpdateLdapConfigRequest,
  CreateSamlConfigRequest as SdkCreateSamlConfigRequest,
  UpdateSamlConfigRequest as SdkUpdateSamlConfigRequest,
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
} from '@/types/sso';
import { assertData, narrowEnum } from '@/lib/api/fetch';

type SsoProviderType = 'oidc' | 'ldap' | 'saml';
const SSO_PROVIDER_TYPES = new Set<SsoProviderType>(['oidc', 'ldap', 'saml']);

// SDK declares attribute_mapping as `{[key: string]: unknown}` but the local
// types declare `Record<string, string>` because the consumer (SSO admin
// settings forms) renders the values as text inputs. Coerce non-string
// values defensively so a backend that ever returns a non-string doesn't
// crash render code; preserves prior `as never` behavior without the cast.
function adaptAttributeMapping(
  raw: { [key: string]: unknown } | null | undefined,
): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

function adaptSsoProvider(sdk: SdkSsoProviderInfo): SsoProvider {
  return {
    id: sdk.id,
    name: sdk.name,
    provider_type: narrowEnum(
      sdk.provider_type,
      SSO_PROVIDER_TYPES,
      'oidc',
      `ssoApi: unknown provider_type "${sdk.provider_type}" — falling back to "oidc".`,
    ),
    login_url: sdk.login_url,
  };
}

function adaptOidcConfig(sdk: SdkOidcConfigResponse): OidcConfig {
  return {
    id: sdk.id,
    name: sdk.name,
    issuer_url: sdk.issuer_url,
    client_id: sdk.client_id,
    has_secret: sdk.has_secret,
    scopes: sdk.scopes,
    attribute_mapping: adaptAttributeMapping(sdk.attribute_mapping),
    auto_create_users: sdk.auto_create_users,
    is_enabled: sdk.is_enabled,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
  };
}

function adaptLdapConfig(sdk: SdkLdapConfigResponse): LdapConfig {
  return {
    id: sdk.id,
    name: sdk.name,
    server_url: sdk.server_url,
    bind_dn: sdk.bind_dn ?? null,
    has_secret: sdk.has_bind_password,
    user_base_dn: sdk.user_base_dn,
    user_filter: sdk.user_filter,
    username_attribute: sdk.username_attribute,
    email_attribute: sdk.email_attribute,
    display_name_attribute: sdk.display_name_attribute,
    groups_attribute: sdk.groups_attribute,
    group_base_dn: sdk.group_base_dn ?? null,
    group_filter: sdk.group_filter ?? null,
    admin_group_dn: sdk.admin_group_dn ?? null,
    use_starttls: sdk.use_starttls,
    is_enabled: sdk.is_enabled,
    priority: sdk.priority,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
  };
}

function adaptSamlConfig(sdk: SdkSamlConfigResponse): SamlConfig {
  return {
    id: sdk.id,
    name: sdk.name,
    entity_id: sdk.entity_id,
    sso_url: sdk.sso_url,
    slo_url: sdk.slo_url ?? null,
    has_certificate: sdk.has_certificate,
    sp_entity_id: sdk.sp_entity_id,
    name_id_format: sdk.name_id_format,
    attribute_mapping: adaptAttributeMapping(sdk.attribute_mapping),
    sign_requests: sdk.sign_requests,
    require_signed_assertions: sdk.require_signed_assertions,
    admin_group: sdk.admin_group ?? null,
    is_enabled: sdk.is_enabled,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
  };
}

function adaptLdapTestResult(sdk: SdkLdapTestResult): LdapTestResult {
  return {
    success: sdk.success,
    message: sdk.message,
    response_time_ms: sdk.response_time_ms,
  };
}

// Login / exchangeCode return a token pair. The local return type is just
// `{ access_token, refresh_token }`; the SDK adds `token_type` which we drop.
function adaptTokenPair(
  sdk: SdkExchangeCodeResponse,
): { access_token: string; refresh_token: string } {
  return {
    access_token: sdk.access_token,
    refresh_token: sdk.refresh_token,
  };
}

// Write requests: the local CreateXConfigRequest / UpdateXConfigRequest
// types are structurally compatible with the SDK's variants (the SDK uses
// `?: T | null` where the local uses `?: T`; `string | undefined` is a
// subtype of `string | null | undefined`). Pass through directly via
// `satisfies` instead of writing 6 near-identical 12-field forwarders —
// keeps the boundary typed without ballooning duplication, and a future
// local-type addition surfaces here when the SDK type drifts.

export const ssoApi = {
  // --- Providers (public) ---

  listProviders: async (): Promise<SsoProvider[]> => {
    const { data, error } = await sdkListProviders();
    if (error) throw error;
    return assertData(data, 'ssoApi.listProviders').map(adaptSsoProvider);
  },

  // --- OIDC ---

  listOidc: async (): Promise<OidcConfig[]> => {
    const { data, error } = await sdkListOidc();
    if (error) throw error;
    return assertData(data, 'ssoApi.listOidc').map(adaptOidcConfig);
  },

  getOidc: async (id: string): Promise<OidcConfig> => {
    const { data, error } = await sdkGetOidc({ path: { id } });
    if (error) throw error;
    return adaptOidcConfig(assertData(data, 'ssoApi.getOidc'));
  },

  createOidc: async (
    reqData: CreateOidcConfigRequest,
  ): Promise<OidcConfig> => {
    const { data, error } = await sdkCreateOidc({
      body: reqData satisfies SdkCreateOidcConfigRequest,
    });
    if (error) throw error;
    return adaptOidcConfig(assertData(data, 'ssoApi.createOidc'));
  },

  updateOidc: async (
    id: string,
    reqData: UpdateOidcConfigRequest,
  ): Promise<OidcConfig> => {
    const { data, error } = await sdkUpdateOidc({
      path: { id },
      body: reqData satisfies SdkUpdateOidcConfigRequest,
    });
    if (error) throw error;
    return adaptOidcConfig(assertData(data, 'ssoApi.updateOidc'));
  },

  deleteOidc: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteOidc({ path: { id } });
    if (error) throw error;
  },

  enableOidc: async (id: string): Promise<void> => {
    const { error } = await sdkToggleOidc({
      path: { id },
      body: { enabled: true },
    });
    if (error) throw error;
  },

  disableOidc: async (id: string): Promise<void> => {
    const { error } = await sdkToggleOidc({
      path: { id },
      body: { enabled: false },
    });
    if (error) throw error;
  },

  // --- LDAP ---

  listLdap: async (): Promise<LdapConfig[]> => {
    const { data, error } = await sdkListLdap();
    if (error) throw error;
    return assertData(data, 'ssoApi.listLdap').map(adaptLdapConfig);
  },

  getLdap: async (id: string): Promise<LdapConfig> => {
    const { data, error } = await sdkGetLdap({ path: { id } });
    if (error) throw error;
    return adaptLdapConfig(assertData(data, 'ssoApi.getLdap'));
  },

  createLdap: async (
    reqData: CreateLdapConfigRequest,
  ): Promise<LdapConfig> => {
    const { data, error } = await sdkCreateLdap({
      body: reqData satisfies SdkCreateLdapConfigRequest,
    });
    if (error) throw error;
    return adaptLdapConfig(assertData(data, 'ssoApi.createLdap'));
  },

  updateLdap: async (
    id: string,
    reqData: UpdateLdapConfigRequest,
  ): Promise<LdapConfig> => {
    const { data, error } = await sdkUpdateLdap({
      path: { id },
      body: reqData satisfies SdkUpdateLdapConfigRequest,
    });
    if (error) throw error;
    return adaptLdapConfig(assertData(data, 'ssoApi.updateLdap'));
  },

  deleteLdap: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteLdap({ path: { id } });
    if (error) throw error;
  },

  enableLdap: async (id: string): Promise<void> => {
    const { error } = await sdkToggleLdap({
      path: { id },
      body: { enabled: true },
    });
    if (error) throw error;
  },

  disableLdap: async (id: string): Promise<void> => {
    const { error } = await sdkToggleLdap({
      path: { id },
      body: { enabled: false },
    });
    if (error) throw error;
  },

  ldapLogin: async (
    providerId: string,
    username: string,
    password: string,
  ): Promise<{ access_token: string; refresh_token: string }> => {
    const { data, error } = await sdkLdapLogin({
      path: { id: providerId },
      body: { username, password },
    });
    if (error) throw error;
    // SDK types ldapLogin's 200 response as `unknown` — runtime narrow
    // and forward the token pair fields explicitly.
    const body = assertData(data, 'ssoApi.ldapLogin');
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as Record<string, unknown>).access_token !== 'string' ||
      typeof (body as Record<string, unknown>).refresh_token !== 'string'
    ) {
      throw new Error('ssoApi.ldapLogin: response missing access_token or refresh_token');
    }
    const obj = body as Record<string, unknown>;
    return {
      access_token: obj.access_token as string,
      refresh_token: obj.refresh_token as string,
    };
  },

  testLdap: async (id: string): Promise<LdapTestResult> => {
    const { data, error } = await sdkTestLdap({ path: { id } });
    if (error) throw error;
    return adaptLdapTestResult(assertData(data, 'ssoApi.testLdap'));
  },

  // --- SAML ---

  listSaml: async (): Promise<SamlConfig[]> => {
    const { data, error } = await sdkListSaml();
    if (error) throw error;
    return assertData(data, 'ssoApi.listSaml').map(adaptSamlConfig);
  },

  getSaml: async (id: string): Promise<SamlConfig> => {
    const { data, error } = await sdkGetSaml({ path: { id } });
    if (error) throw error;
    return adaptSamlConfig(assertData(data, 'ssoApi.getSaml'));
  },

  createSaml: async (
    reqData: CreateSamlConfigRequest,
  ): Promise<SamlConfig> => {
    const { data, error } = await sdkCreateSaml({
      body: reqData satisfies SdkCreateSamlConfigRequest,
    });
    if (error) throw error;
    return adaptSamlConfig(assertData(data, 'ssoApi.createSaml'));
  },

  updateSaml: async (
    id: string,
    reqData: UpdateSamlConfigRequest,
  ): Promise<SamlConfig> => {
    const { data, error } = await sdkUpdateSaml({
      path: { id },
      body: reqData satisfies SdkUpdateSamlConfigRequest,
    });
    if (error) throw error;
    return adaptSamlConfig(assertData(data, 'ssoApi.updateSaml'));
  },

  deleteSaml: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteSaml({ path: { id } });
    if (error) throw error;
  },

  enableSaml: async (id: string): Promise<void> => {
    const { error } = await sdkToggleSaml({
      path: { id },
      body: { enabled: true },
    });
    if (error) throw error;
  },

  disableSaml: async (id: string): Promise<void> => {
    const { error } = await sdkToggleSaml({
      path: { id },
      body: { enabled: false },
    });
    if (error) throw error;
  },

  // --- Exchange Code ---

  exchangeCode: async (
    code: string,
  ): Promise<{ access_token: string; refresh_token: string }> => {
    const { data, error } = await sdkExchangeCode({ body: { code } });
    if (error) throw error;
    return adaptTokenPair(assertData(data, 'ssoApi.exchangeCode'));
  },
};

export default ssoApi;
