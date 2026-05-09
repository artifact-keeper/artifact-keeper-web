import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  SsoProviderInfo as SdkSsoProviderInfo,
  OidcConfigResponse as SdkOidcConfigResponse,
  LdapConfigResponse as SdkLdapConfigResponse,
  SamlConfigResponse as SdkSamlConfigResponse,
  LdapTestResult as SdkLdapTestResult,
  ExchangeCodeResponse as SdkExchangeCodeResponse,
} from "@artifact-keeper/sdk";

vi.mock("@/lib/sdk-client", () => ({}));

const mockListProviders = vi.fn();
const mockListOidc = vi.fn();
const mockGetOidc = vi.fn();
const mockCreateOidc = vi.fn();
const mockUpdateOidc = vi.fn();
const mockDeleteOidc = vi.fn();
const mockToggleOidc = vi.fn();
const mockListLdap = vi.fn();
const mockGetLdap = vi.fn();
const mockCreateLdap = vi.fn();
const mockUpdateLdap = vi.fn();
const mockDeleteLdap = vi.fn();
const mockToggleLdap = vi.fn();
const mockTestLdap = vi.fn();
const mockLdapLogin = vi.fn();
const mockListSaml = vi.fn();
const mockGetSaml = vi.fn();
const mockCreateSaml = vi.fn();
const mockUpdateSaml = vi.fn();
const mockDeleteSaml = vi.fn();
const mockToggleSaml = vi.fn();
const mockExchangeCode = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  listProviders: (...args: unknown[]) => mockListProviders(...args),
  listOidc: (...args: unknown[]) => mockListOidc(...args),
  getOidc: (...args: unknown[]) => mockGetOidc(...args),
  createOidc: (...args: unknown[]) => mockCreateOidc(...args),
  updateOidc: (...args: unknown[]) => mockUpdateOidc(...args),
  deleteOidc: (...args: unknown[]) => mockDeleteOidc(...args),
  toggleOidc: (...args: unknown[]) => mockToggleOidc(...args),
  listLdap: (...args: unknown[]) => mockListLdap(...args),
  getLdap: (...args: unknown[]) => mockGetLdap(...args),
  createLdap: (...args: unknown[]) => mockCreateLdap(...args),
  updateLdap: (...args: unknown[]) => mockUpdateLdap(...args),
  deleteLdap: (...args: unknown[]) => mockDeleteLdap(...args),
  toggleLdap: (...args: unknown[]) => mockToggleLdap(...args),
  testLdap: (...args: unknown[]) => mockTestLdap(...args),
  ldapLogin: (...args: unknown[]) => mockLdapLogin(...args),
  listSaml: (...args: unknown[]) => mockListSaml(...args),
  getSaml: (...args: unknown[]) => mockGetSaml(...args),
  createSaml: (...args: unknown[]) => mockCreateSaml(...args),
  updateSaml: (...args: unknown[]) => mockUpdateSaml(...args),
  deleteSaml: (...args: unknown[]) => mockDeleteSaml(...args),
  toggleSaml: (...args: unknown[]) => mockToggleSaml(...args),
  exchangeCode: (...args: unknown[]) => mockExchangeCode(...args),
}));

const SDK_PROVIDER: SdkSsoProviderInfo = {
  id: "p1",
  name: "Corp SSO",
  provider_type: "oidc",
  login_url: "/api/v1/sso/oidc/p1/login",
};

const SDK_OIDC: SdkOidcConfigResponse = {
  id: "o1",
  name: "Corp OIDC",
  issuer_url: "https://accounts.example.com",
  client_id: "client-1",
  has_secret: true,
  scopes: ["openid", "email"],
  attribute_mapping: { email: "email", name: "name" },
  auto_create_users: true,
  is_enabled: true,
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

const SDK_LDAP: SdkLdapConfigResponse = {
  id: "l1",
  name: "Corp LDAP",
  server_url: "ldap://ldap.example.com",
  bind_dn: "cn=admin,dc=example,dc=com",
  has_bind_password: true,
  user_base_dn: "ou=users,dc=example,dc=com",
  user_filter: "(uid={username})",
  username_attribute: "uid",
  email_attribute: "mail",
  display_name_attribute: "cn",
  groups_attribute: "memberOf",
  group_base_dn: "ou=groups,dc=example,dc=com",
  group_filter: "(member={dn})",
  admin_group_dn: "cn=admins,ou=groups,dc=example,dc=com",
  use_starttls: true,
  is_enabled: true,
  priority: 10,
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

const SDK_SAML: SdkSamlConfigResponse = {
  id: "s1",
  name: "Corp SAML",
  entity_id: "https://idp.example.com/saml",
  sso_url: "https://idp.example.com/saml/sso",
  slo_url: "https://idp.example.com/saml/slo",
  has_certificate: true,
  sp_entity_id: "https://artifact-keeper.example.com/saml",
  name_id_format: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
  attribute_mapping: { email: "Email", name: "DisplayName" },
  sign_requests: true,
  require_signed_assertions: true,
  admin_group: "Admins",
  is_enabled: true,
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

const SDK_TEST: SdkLdapTestResult = {
  success: true,
  message: "ok",
  response_time_ms: 12,
};

const SDK_TOKENS: SdkExchangeCodeResponse = {
  access_token: "AT",
  refresh_token: "RT",
  token_type: "Bearer",
};

describe("ssoApi", () => {
  beforeEach(() => vi.clearAllMocks());

  // Providers
  it("listProviders returns providers", async () => {
    mockListProviders.mockResolvedValue({
      data: [SDK_PROVIDER],
      error: undefined,
    });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.listProviders();
    expect(out[0].id).toBe("p1");
    expect(out[0].provider_type).toBe("oidc");
  });

  it("listProviders narrows unknown provider_type (#359)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockListProviders.mockResolvedValue({
      data: [{ ...SDK_PROVIDER, provider_type: "exotic" }],
      error: undefined,
    });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.listProviders();
    expect(out[0].provider_type).toBe("oidc");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("listProviders throws on error", async () => {
    mockListProviders.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.listProviders()).rejects.toBe("fail");
  });

  // OIDC
  it("listOidc returns configs", async () => {
    mockListOidc.mockResolvedValue({ data: [SDK_OIDC], error: undefined });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.listOidc();
    expect(out[0].id).toBe("o1");
    expect(out[0].attribute_mapping).toEqual({ email: "email", name: "name" });
  });

  it("listOidc coerces non-string attribute_mapping values (#359)", async () => {
    mockListOidc.mockResolvedValue({
      data: [{ ...SDK_OIDC, attribute_mapping: { email: 42, name: "name" } }],
      error: undefined,
    });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.listOidc();
    expect(out[0].attribute_mapping.email).toBe("42");
    expect(out[0].attribute_mapping.name).toBe("name");
  });

  it("listOidc throws on error", async () => {
    mockListOidc.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.listOidc()).rejects.toBe("fail");
  });

  it("getOidc returns config", async () => {
    mockGetOidc.mockResolvedValue({ data: SDK_OIDC, error: undefined });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.getOidc("o1");
    expect(out.id).toBe("o1");
  });

  it("getOidc throws on error", async () => {
    mockGetOidc.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.getOidc("o1")).rejects.toBe("fail");
  });

  it("createOidc returns new config and forwards body", async () => {
    mockCreateOidc.mockResolvedValue({ data: SDK_OIDC, error: undefined });
    const { ssoApi } = await import("../sso");
    await ssoApi.createOidc({
      name: "Corp OIDC",
      issuer_url: "https://accounts.example.com",
      client_id: "client-1",
      client_secret: "secret",
      scopes: ["openid"],
      auto_create_users: true,
    });
    expect(mockCreateOidc).toHaveBeenCalledWith({
      body: {
        name: "Corp OIDC",
        issuer_url: "https://accounts.example.com",
        client_id: "client-1",
        client_secret: "secret",
        scopes: ["openid"],
        attribute_mapping: undefined,
        auto_create_users: true,
      },
    });
  });

  it("createOidc throws on error", async () => {
    mockCreateOidc.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(
      ssoApi.createOidc({
        name: "x",
        issuer_url: "x",
        client_id: "x",
        client_secret: "x",
      }),
    ).rejects.toBe("fail");
  });

  it("updateOidc returns config", async () => {
    mockUpdateOidc.mockResolvedValue({ data: SDK_OIDC, error: undefined });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.updateOidc("o1", { name: "renamed" });
    expect(out.id).toBe("o1");
  });

  it("updateOidc throws on error", async () => {
    mockUpdateOidc.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.updateOidc("o1", {})).rejects.toBe("fail");
  });

  it("deleteOidc calls SDK", async () => {
    mockDeleteOidc.mockResolvedValue({ error: undefined });
    const { ssoApi } = await import("../sso");
    await ssoApi.deleteOidc("o1");
    expect(mockDeleteOidc).toHaveBeenCalled();
  });

  it("deleteOidc throws on error", async () => {
    mockDeleteOidc.mockResolvedValue({ error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.deleteOidc("o1")).rejects.toBe("fail");
  });

  it("enableOidc passes enabled=true", async () => {
    mockToggleOidc.mockResolvedValue({ error: undefined });
    const { ssoApi } = await import("../sso");
    await ssoApi.enableOidc("o1");
    expect(mockToggleOidc).toHaveBeenCalledWith({
      path: { id: "o1" },
      body: { enabled: true },
    });
  });

  it("disableOidc passes enabled=false", async () => {
    mockToggleOidc.mockResolvedValue({ error: undefined });
    const { ssoApi } = await import("../sso");
    await ssoApi.disableOidc("o1");
    expect(mockToggleOidc).toHaveBeenCalledWith({
      path: { id: "o1" },
      body: { enabled: false },
    });
  });

  // LDAP
  it("listLdap returns configs", async () => {
    mockListLdap.mockResolvedValue({ data: [SDK_LDAP], error: undefined });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.listLdap();
    expect(out[0].id).toBe("l1");
    expect(out[0].has_secret).toBe(true);
  });

  it("listLdap normalizes nullable fields to null (#359)", async () => {
    mockListLdap.mockResolvedValue({
      data: [
        {
          ...SDK_LDAP,
          bind_dn: undefined,
          group_base_dn: undefined,
          group_filter: undefined,
          admin_group_dn: undefined,
        },
      ],
      error: undefined,
    });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.listLdap();
    expect(out[0].bind_dn).toBeNull();
    expect(out[0].group_base_dn).toBeNull();
    expect(out[0].group_filter).toBeNull();
    expect(out[0].admin_group_dn).toBeNull();
  });

  it("listLdap throws on error", async () => {
    mockListLdap.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.listLdap()).rejects.toBe("fail");
  });

  it("getLdap returns config", async () => {
    mockGetLdap.mockResolvedValue({ data: SDK_LDAP, error: undefined });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.getLdap("l1");
    expect(out.id).toBe("l1");
  });

  it("getLdap throws on error", async () => {
    mockGetLdap.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.getLdap("l1")).rejects.toBe("fail");
  });

  it("createLdap returns config", async () => {
    mockCreateLdap.mockResolvedValue({ data: SDK_LDAP, error: undefined });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.createLdap({
      name: "Corp LDAP",
      server_url: "ldap://ldap.example.com",
      user_base_dn: "ou=users,dc=example,dc=com",
    });
    expect(out.id).toBe("l1");
  });

  it("createLdap throws on error", async () => {
    mockCreateLdap.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(
      ssoApi.createLdap({
        name: "x",
        server_url: "x",
        user_base_dn: "x",
      }),
    ).rejects.toBe("fail");
  });

  it("updateLdap returns config", async () => {
    mockUpdateLdap.mockResolvedValue({ data: SDK_LDAP, error: undefined });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.updateLdap("l1", { name: "renamed" });
    expect(out.id).toBe("l1");
  });

  it("updateLdap throws on error", async () => {
    mockUpdateLdap.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.updateLdap("l1", {})).rejects.toBe("fail");
  });

  it("deleteLdap calls SDK", async () => {
    mockDeleteLdap.mockResolvedValue({ error: undefined });
    const { ssoApi } = await import("../sso");
    await ssoApi.deleteLdap("l1");
    expect(mockDeleteLdap).toHaveBeenCalled();
  });

  it("deleteLdap throws on error", async () => {
    mockDeleteLdap.mockResolvedValue({ error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.deleteLdap("l1")).rejects.toBe("fail");
  });

  it("enableLdap / disableLdap pass correct enabled flag", async () => {
    mockToggleLdap.mockResolvedValue({ error: undefined });
    const { ssoApi } = await import("../sso");
    await ssoApi.enableLdap("l1");
    expect(mockToggleLdap).toHaveBeenLastCalledWith({
      path: { id: "l1" },
      body: { enabled: true },
    });
    await ssoApi.disableLdap("l1");
    expect(mockToggleLdap).toHaveBeenLastCalledWith({
      path: { id: "l1" },
      body: { enabled: false },
    });
  });

  it("ldapLogin returns token pair and forwards body", async () => {
    mockLdapLogin.mockResolvedValue({
      data: { access_token: "AT", refresh_token: "RT", token_type: "Bearer" },
      error: undefined,
    });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.ldapLogin("l1", "alice", "secret");
    expect(out).toEqual({ access_token: "AT", refresh_token: "RT" });
    expect(mockLdapLogin).toHaveBeenCalledWith({
      path: { id: "l1" },
      body: { username: "alice", password: "secret" },
    });
  });

  it("ldapLogin throws on error", async () => {
    mockLdapLogin.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(
      ssoApi.ldapLogin("l1", "alice", "secret"),
    ).rejects.toBe("fail");
  });

  it("ldapLogin throws on missing token fields (#359)", async () => {
    // The SDK declares LdapLoginResponses.200 as `unknown` — runtime-narrow.
    mockLdapLogin.mockResolvedValue({
      data: { access_token: "AT" },
      error: undefined,
    });
    const { ssoApi } = await import("../sso");
    await expect(
      ssoApi.ldapLogin("l1", "alice", "secret"),
    ).rejects.toThrow(/missing access_token or refresh_token/);
  });

  it("testLdap returns result", async () => {
    mockTestLdap.mockResolvedValue({ data: SDK_TEST, error: undefined });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.testLdap("l1");
    expect(out.success).toBe(true);
    expect(out.response_time_ms).toBe(12);
  });

  it("testLdap throws on error", async () => {
    mockTestLdap.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.testLdap("l1")).rejects.toBe("fail");
  });

  // SAML
  it("listSaml returns configs", async () => {
    mockListSaml.mockResolvedValue({ data: [SDK_SAML], error: undefined });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.listSaml();
    expect(out[0].id).toBe("s1");
  });

  it("listSaml normalizes nullable fields (#359)", async () => {
    mockListSaml.mockResolvedValue({
      data: [{ ...SDK_SAML, slo_url: undefined, admin_group: undefined }],
      error: undefined,
    });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.listSaml();
    expect(out[0].slo_url).toBeNull();
    expect(out[0].admin_group).toBeNull();
  });

  it("listSaml throws on error", async () => {
    mockListSaml.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.listSaml()).rejects.toBe("fail");
  });

  it("getSaml returns config", async () => {
    mockGetSaml.mockResolvedValue({ data: SDK_SAML, error: undefined });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.getSaml("s1");
    expect(out.id).toBe("s1");
  });

  it("getSaml throws on error", async () => {
    mockGetSaml.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.getSaml("s1")).rejects.toBe("fail");
  });

  it("createSaml returns config", async () => {
    mockCreateSaml.mockResolvedValue({ data: SDK_SAML, error: undefined });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.createSaml({
      name: "Corp SAML",
      entity_id: "x",
      sso_url: "x",
      certificate: "PEM",
    });
    expect(out.id).toBe("s1");
  });

  it("createSaml throws on error", async () => {
    mockCreateSaml.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(
      ssoApi.createSaml({
        name: "x",
        entity_id: "x",
        sso_url: "x",
        certificate: "x",
      }),
    ).rejects.toBe("fail");
  });

  it("updateSaml returns config", async () => {
    mockUpdateSaml.mockResolvedValue({ data: SDK_SAML, error: undefined });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.updateSaml("s1", { name: "renamed" });
    expect(out.id).toBe("s1");
  });

  it("updateSaml throws on error", async () => {
    mockUpdateSaml.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.updateSaml("s1", {})).rejects.toBe("fail");
  });

  it("deleteSaml calls SDK", async () => {
    mockDeleteSaml.mockResolvedValue({ error: undefined });
    const { ssoApi } = await import("../sso");
    await ssoApi.deleteSaml("s1");
    expect(mockDeleteSaml).toHaveBeenCalled();
  });

  it("deleteSaml throws on error", async () => {
    mockDeleteSaml.mockResolvedValue({ error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.deleteSaml("s1")).rejects.toBe("fail");
  });

  it("enableSaml / disableSaml pass correct enabled flag", async () => {
    mockToggleSaml.mockResolvedValue({ error: undefined });
    const { ssoApi } = await import("../sso");
    await ssoApi.enableSaml("s1");
    expect(mockToggleSaml).toHaveBeenLastCalledWith({
      path: { id: "s1" },
      body: { enabled: true },
    });
    await ssoApi.disableSaml("s1");
    expect(mockToggleSaml).toHaveBeenLastCalledWith({
      path: { id: "s1" },
      body: { enabled: false },
    });
  });

  // Exchange Code
  it("exchangeCode returns token pair and forwards body", async () => {
    mockExchangeCode.mockResolvedValue({ data: SDK_TOKENS, error: undefined });
    const { ssoApi } = await import("../sso");
    const out = await ssoApi.exchangeCode("auth-code");
    expect(out).toEqual({ access_token: "AT", refresh_token: "RT" });
    expect(mockExchangeCode).toHaveBeenCalledWith({
      body: { code: "auth-code" },
    });
  });

  it("exchangeCode throws on error", async () => {
    mockExchangeCode.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.exchangeCode("code")).rejects.toBe("fail");
  });
});
