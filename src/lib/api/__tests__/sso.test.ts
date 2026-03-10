import { describe, it, expect, vi, beforeEach } from "vitest";

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

describe("ssoApi", () => {
  beforeEach(() => vi.clearAllMocks());

  // Providers
  it("listProviders returns providers", async () => {
    const data = [{ id: "oidc1", type: "oidc" }];
    mockListProviders.mockResolvedValue({ data, error: undefined });
    const { ssoApi } = await import("../sso");
    expect(await ssoApi.listProviders()).toEqual(data);
  });

  it("listProviders throws on error", async () => {
    mockListProviders.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.listProviders()).rejects.toBe("fail");
  });

  // OIDC
  it("listOidc returns configs", async () => {
    const data = [{ id: "o1" }];
    mockListOidc.mockResolvedValue({ data, error: undefined });
    const { ssoApi } = await import("../sso");
    expect(await ssoApi.listOidc()).toEqual(data);
  });

  it("listOidc throws on error", async () => {
    mockListOidc.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.listOidc()).rejects.toBe("fail");
  });

  it("getOidc returns config", async () => {
    const data = { id: "o1" };
    mockGetOidc.mockResolvedValue({ data, error: undefined });
    const { ssoApi } = await import("../sso");
    expect(await ssoApi.getOidc("o1")).toEqual(data);
  });

  it("getOidc throws on error", async () => {
    mockGetOidc.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.getOidc("o1")).rejects.toBe("fail");
  });

  it("createOidc returns new config", async () => {
    const data = { id: "o2" };
    mockCreateOidc.mockResolvedValue({ data, error: undefined });
    const { ssoApi } = await import("../sso");
    expect(await ssoApi.createOidc({} as any)).toEqual(data);
  });

  it("createOidc throws on error", async () => {
    mockCreateOidc.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.createOidc({} as any)).rejects.toBe("fail");
  });

  it("updateOidc returns updated config", async () => {
    const data = { id: "o1" };
    mockUpdateOidc.mockResolvedValue({ data, error: undefined });
    const { ssoApi } = await import("../sso");
    expect(await ssoApi.updateOidc("o1", {} as any)).toEqual(data);
  });

  it("updateOidc throws on error", async () => {
    mockUpdateOidc.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.updateOidc("o1", {} as any)).rejects.toBe("fail");
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

  it("enableOidc toggles with enabled=true", async () => {
    mockToggleOidc.mockResolvedValue({ error: undefined });
    const { ssoApi } = await import("../sso");
    await ssoApi.enableOidc("o1");
    expect(mockToggleOidc).toHaveBeenCalledWith(
      expect.objectContaining({ body: { enabled: true } })
    );
  });

  it("enableOidc throws on error", async () => {
    mockToggleOidc.mockResolvedValue({ error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.enableOidc("o1")).rejects.toBe("fail");
  });

  it("disableOidc toggles with enabled=false", async () => {
    mockToggleOidc.mockResolvedValue({ error: undefined });
    const { ssoApi } = await import("../sso");
    await ssoApi.disableOidc("o1");
    expect(mockToggleOidc).toHaveBeenCalledWith(
      expect.objectContaining({ body: { enabled: false } })
    );
  });

  it("disableOidc throws on error", async () => {
    mockToggleOidc.mockResolvedValue({ error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.disableOidc("o1")).rejects.toBe("fail");
  });

  // LDAP
  it("listLdap returns configs", async () => {
    const data = [{ id: "l1" }];
    mockListLdap.mockResolvedValue({ data, error: undefined });
    const { ssoApi } = await import("../sso");
    expect(await ssoApi.listLdap()).toEqual(data);
  });

  it("listLdap throws on error", async () => {
    mockListLdap.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.listLdap()).rejects.toBe("fail");
  });

  it("getLdap returns config", async () => {
    mockGetLdap.mockResolvedValue({ data: { id: "l1" }, error: undefined });
    const { ssoApi } = await import("../sso");
    expect(await ssoApi.getLdap("l1")).toEqual({ id: "l1" });
  });

  it("getLdap throws on error", async () => {
    mockGetLdap.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.getLdap("l1")).rejects.toBe("fail");
  });

  it("createLdap returns config", async () => {
    mockCreateLdap.mockResolvedValue({ data: { id: "l2" }, error: undefined });
    const { ssoApi } = await import("../sso");
    expect(await ssoApi.createLdap({} as any)).toEqual({ id: "l2" });
  });

  it("createLdap throws on error", async () => {
    mockCreateLdap.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.createLdap({} as any)).rejects.toBe("fail");
  });

  it("updateLdap returns config", async () => {
    mockUpdateLdap.mockResolvedValue({ data: { id: "l1" }, error: undefined });
    const { ssoApi } = await import("../sso");
    expect(await ssoApi.updateLdap("l1", {} as any)).toEqual({ id: "l1" });
  });

  it("updateLdap throws on error", async () => {
    mockUpdateLdap.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.updateLdap("l1", {} as any)).rejects.toBe("fail");
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

  it("enableLdap toggles with enabled=true", async () => {
    mockToggleLdap.mockResolvedValue({ error: undefined });
    const { ssoApi } = await import("../sso");
    await ssoApi.enableLdap("l1");
    expect(mockToggleLdap).toHaveBeenCalledWith(
      expect.objectContaining({ body: { enabled: true } })
    );
  });

  it("enableLdap throws on error", async () => {
    mockToggleLdap.mockResolvedValue({ error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.enableLdap("l1")).rejects.toBe("fail");
  });

  it("disableLdap toggles with enabled=false", async () => {
    mockToggleLdap.mockResolvedValue({ error: undefined });
    const { ssoApi } = await import("../sso");
    await ssoApi.disableLdap("l1");
    expect(mockToggleLdap).toHaveBeenCalledWith(
      expect.objectContaining({ body: { enabled: false } })
    );
  });

  it("disableLdap throws on error", async () => {
    mockToggleLdap.mockResolvedValue({ error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.disableLdap("l1")).rejects.toBe("fail");
  });

  it("ldapLogin returns tokens", async () => {
    const data = { access_token: "at", refresh_token: "rt" };
    mockLdapLogin.mockResolvedValue({ data, error: undefined });
    const { ssoApi } = await import("../sso");
    expect(await ssoApi.ldapLogin("prov1", "user", "pass")).toEqual(data);
  });

  it("ldapLogin throws on error", async () => {
    mockLdapLogin.mockResolvedValue({ data: undefined, error: "bad creds" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.ldapLogin("prov1", "user", "pass")).rejects.toBe("bad creds");
  });

  it("testLdap returns result", async () => {
    const result = { success: true };
    mockTestLdap.mockResolvedValue({ data: result, error: undefined });
    const { ssoApi } = await import("../sso");
    expect(await ssoApi.testLdap("l1")).toEqual(result);
  });

  it("testLdap throws on error", async () => {
    mockTestLdap.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.testLdap("l1")).rejects.toBe("fail");
  });

  // SAML
  it("listSaml returns configs", async () => {
    mockListSaml.mockResolvedValue({ data: [{ id: "s1" }], error: undefined });
    const { ssoApi } = await import("../sso");
    expect(await ssoApi.listSaml()).toEqual([{ id: "s1" }]);
  });

  it("listSaml throws on error", async () => {
    mockListSaml.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.listSaml()).rejects.toBe("fail");
  });

  it("getSaml returns config", async () => {
    mockGetSaml.mockResolvedValue({ data: { id: "s1" }, error: undefined });
    const { ssoApi } = await import("../sso");
    expect(await ssoApi.getSaml("s1")).toEqual({ id: "s1" });
  });

  it("getSaml throws on error", async () => {
    mockGetSaml.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.getSaml("s1")).rejects.toBe("fail");
  });

  it("createSaml returns config", async () => {
    mockCreateSaml.mockResolvedValue({ data: { id: "s2" }, error: undefined });
    const { ssoApi } = await import("../sso");
    expect(await ssoApi.createSaml({} as any)).toEqual({ id: "s2" });
  });

  it("createSaml throws on error", async () => {
    mockCreateSaml.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.createSaml({} as any)).rejects.toBe("fail");
  });

  it("updateSaml returns config", async () => {
    mockUpdateSaml.mockResolvedValue({ data: { id: "s1" }, error: undefined });
    const { ssoApi } = await import("../sso");
    expect(await ssoApi.updateSaml("s1", {} as any)).toEqual({ id: "s1" });
  });

  it("updateSaml throws on error", async () => {
    mockUpdateSaml.mockResolvedValue({ data: undefined, error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.updateSaml("s1", {} as any)).rejects.toBe("fail");
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

  it("enableSaml toggles with enabled=true", async () => {
    mockToggleSaml.mockResolvedValue({ error: undefined });
    const { ssoApi } = await import("../sso");
    await ssoApi.enableSaml("s1");
    expect(mockToggleSaml).toHaveBeenCalledWith(
      expect.objectContaining({ body: { enabled: true } })
    );
  });

  it("enableSaml throws on error", async () => {
    mockToggleSaml.mockResolvedValue({ error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.enableSaml("s1")).rejects.toBe("fail");
  });

  it("disableSaml toggles with enabled=false", async () => {
    mockToggleSaml.mockResolvedValue({ error: undefined });
    const { ssoApi } = await import("../sso");
    await ssoApi.disableSaml("s1");
    expect(mockToggleSaml).toHaveBeenCalledWith(
      expect.objectContaining({ body: { enabled: false } })
    );
  });

  it("disableSaml throws on error", async () => {
    mockToggleSaml.mockResolvedValue({ error: "fail" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.disableSaml("s1")).rejects.toBe("fail");
  });

  // Exchange Code
  it("exchangeCode returns tokens", async () => {
    const data = { access_token: "at", refresh_token: "rt" };
    mockExchangeCode.mockResolvedValue({ data, error: undefined });
    const { ssoApi } = await import("../sso");
    expect(await ssoApi.exchangeCode("code123")).toEqual(data);
  });

  it("exchangeCode throws on error", async () => {
    mockExchangeCode.mockResolvedValue({ data: undefined, error: "invalid code" });
    const { ssoApi } = await import("../sso");
    await expect(ssoApi.exchangeCode("bad")).rejects.toBe("invalid code");
  });
});
