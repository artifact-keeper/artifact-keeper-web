import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  CiOidcProviderResponse as SdkCiOidcProviderResponse,
  CiOidcMappingResponse as SdkCiOidcMappingResponse,
} from "@artifact-keeper/sdk";

vi.mock("@/lib/sdk-client", () => ({}));

const mockCioidcListProviders = vi.fn();
const mockCreateProvider = vi.fn();
const mockGetProvider = vi.fn();
const mockUpdateProvider = vi.fn();
const mockDeleteProvider = vi.fn();
const mockToggleProvider = vi.fn();
const mockListMappings = vi.fn();
const mockCreateMapping = vi.fn();
const mockGetMapping = vi.fn();
const mockUpdateMapping = vi.fn();
const mockDeleteMapping = vi.fn();
const mockToggleMapping = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  ciOidcListProviders: (...args: unknown[]) =>
    mockCioidcListProviders(...args),
  createProvider: (...args: unknown[]) => mockCreateProvider(...args),
  getProvider: (...args: unknown[]) => mockGetProvider(...args),
  updateProvider: (...args: unknown[]) => mockUpdateProvider(...args),
  deleteProvider: (...args: unknown[]) => mockDeleteProvider(...args),
  toggleProvider: (...args: unknown[]) => mockToggleProvider(...args),
  listMappings: (...args: unknown[]) => mockListMappings(...args),
  createMapping: (...args: unknown[]) => mockCreateMapping(...args),
  getMapping: (...args: unknown[]) => mockGetMapping(...args),
  updateMapping: (...args: unknown[]) => mockUpdateMapping(...args),
  deleteMapping: (...args: unknown[]) => mockDeleteMapping(...args),
  toggleMapping: (...args: unknown[]) => mockToggleMapping(...args),
}));

const SDK_PROVIDER: SdkCiOidcProviderResponse = {
  id: "p1",
  name: "GitLab CI",
  provider_type: "gitlab",
  issuer_url: "https://gitlab.com",
  audience: "artifact-keeper",
  is_enabled: true,
  mapping_count: 3,
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

const SDK_MAPPING: SdkCiOidcMappingResponse = {
  id: "m1",
  provider_id: "p1",
  name: "Prod deploy",
  priority: 10,
  claim_filters: { namespace_path: "my-org/my-group" },
  allowed_repo_ids: ["repo-1", "repo-2"],
  is_enabled: true,
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

describe("ciOidcApi", () => {
  beforeEach(() => vi.clearAllMocks());

  // ---- Providers ----

  describe("list", () => {
    it("returns adapted providers", async () => {
      mockCioidcListProviders.mockResolvedValue({
        data: [SDK_PROVIDER],
        error: undefined,
      });
      const { ciOidcApi } = await import("../ci-oidc");
      const out = await ciOidcApi.list();
      expect(out[0].id).toBe("p1");
      expect(out[0].name).toBe("GitLab CI");
      expect(out[0].provider_type).toBe("gitlab");
    });

    it("throws on error", async () => {
      mockCioidcListProviders.mockResolvedValue({
        data: undefined,
        error: "fail",
      });
      const { ciOidcApi } = await import("../ci-oidc");
      await expect(ciOidcApi.list()).rejects.toBe("fail");
    });
  });

  describe("get", () => {
    it("returns adapted provider", async () => {
      mockGetProvider.mockResolvedValue({ data: SDK_PROVIDER, error: undefined });
      const { ciOidcApi } = await import("../ci-oidc");
      const out = await ciOidcApi.get("p1");
      expect(out.id).toBe("p1");
      expect(out.mapping_count).toBe(3);
    });

    it("passes id in path", async () => {
      mockGetProvider.mockResolvedValue({ data: SDK_PROVIDER, error: undefined });
      const { ciOidcApi } = await import("../ci-oidc");
      await ciOidcApi.get("p1");
      expect(mockGetProvider).toHaveBeenCalledWith({ path: { id: "p1" } });
    });

    it("throws on error", async () => {
      mockGetProvider.mockResolvedValue({ data: undefined, error: "fail" });
      const { ciOidcApi } = await import("../ci-oidc");
      await expect(ciOidcApi.get("p1")).rejects.toBe("fail");
    });
  });

  describe("create", () => {
    it("returns new provider and forwards body", async () => {
      mockCreateProvider.mockResolvedValue({
        data: SDK_PROVIDER,
        error: undefined,
      });
      const { ciOidcApi } = await import("../ci-oidc");
      await ciOidcApi.create({
        name: "GitLab CI",
        issuer_url: "https://gitlab.com",
        audience: "artifact-keeper",
      });
      expect(mockCreateProvider).toHaveBeenCalledWith({
        body: {
          name: "GitLab CI",
          issuer_url: "https://gitlab.com",
          audience: "artifact-keeper",
        },
      });
    });

    it("throws on error", async () => {
      mockCreateProvider.mockResolvedValue({ data: undefined, error: "fail" });
      const { ciOidcApi } = await import("../ci-oidc");
      await expect(
        ciOidcApi.create({
          name: "x",
          issuer_url: "x",
        }),
      ).rejects.toBe("fail");
    });
  });

  describe("update", () => {
    it("returns updated provider and forwards path + body", async () => {
      mockUpdateProvider.mockResolvedValue({
        data: SDK_PROVIDER,
        error: undefined,
      });
      const { ciOidcApi } = await import("../ci-oidc");
      await ciOidcApi.update("p1", { name: "Renamed" });
      expect(mockUpdateProvider).toHaveBeenCalledWith({
        path: { id: "p1" },
        body: { name: "Renamed" },
      });
    });

    it("throws on error", async () => {
      mockUpdateProvider.mockResolvedValue({ data: undefined, error: "fail" });
      const { ciOidcApi } = await import("../ci-oidc");
      await expect(
        ciOidcApi.update("p1", { name: "x" }),
      ).rejects.toBe("fail");
    });
  });

  describe("delete", () => {
    it("calls delete with path", async () => {
      mockDeleteProvider.mockResolvedValue({ data: undefined, error: undefined });
      const { ciOidcApi } = await import("../ci-oidc");
      await ciOidcApi.delete("p1");
      expect(mockDeleteProvider).toHaveBeenCalledWith({ path: { id: "p1" } });
    });

    it("throws on error", async () => {
      mockDeleteProvider.mockResolvedValue({ data: undefined, error: "fail" });
      const { ciOidcApi } = await import("../ci-oidc");
      await expect(ciOidcApi.delete("p1")).rejects.toBe("fail");
    });
  });

  describe("enableProvider / disableProvider", () => {
    it("enableProvider calls toggle with enabled: true", async () => {
      mockToggleProvider.mockResolvedValue({ data: undefined, error: undefined });
      const { ciOidcApi } = await import("../ci-oidc");
      await ciOidcApi.enableProvider("p1");
      expect(mockToggleProvider).toHaveBeenCalledWith({
        path: { id: "p1" },
        body: { enabled: true },
      });
    });

    it("disableProvider calls toggle with enabled: false", async () => {
      mockToggleProvider.mockResolvedValue({ data: undefined, error: undefined });
      const { ciOidcApi } = await import("../ci-oidc");
      await ciOidcApi.disableProvider("p1");
      expect(mockToggleProvider).toHaveBeenCalledWith({
        path: { id: "p1" },
        body: { enabled: false },
      });
    });

    it("throws on error", async () => {
      mockToggleProvider.mockResolvedValue({ data: undefined, error: "fail" });
      const { ciOidcApi } = await import("../ci-oidc");
      await expect(ciOidcApi.enableProvider("p1")).rejects.toBe("fail");
    });
  });

  // ---- Mappings ----

  describe("listMappings", () => {
    it("returns adapted mappings", async () => {
      mockListMappings.mockResolvedValue({
        data: [SDK_MAPPING],
        error: undefined,
      });
      const { ciOidcApi } = await import("../ci-oidc");
      const out = await ciOidcApi.listMappings("p1");
      expect(out[0].id).toBe("m1");
      expect(out[0].provider_id).toBe("p1");
      expect(out[0].claim_filters).toEqual({
        namespace_path: "my-org/my-group",
      });
    });

    it("passes provider id in path", async () => {
      mockListMappings.mockResolvedValue({
        data: [],
        error: undefined,
      });
      const { ciOidcApi } = await import("../ci-oidc");
      await ciOidcApi.listMappings("p1");
      expect(mockListMappings).toHaveBeenCalledWith({ path: { id: "p1" } });
    });

    it("adapts null allowed_repo_ids", async () => {
      mockListMappings.mockResolvedValue({
        data: [{ ...SDK_MAPPING, allowed_repo_ids: null }],
        error: undefined,
      });
      const { ciOidcApi } = await import("../ci-oidc");
      const out = await ciOidcApi.listMappings("p1");
      expect(out[0].allowed_repo_ids).toBeNull();
    });

    it("adapts undefined allowed_repo_ids to null", async () => {
      mockListMappings.mockResolvedValue({
        data: [{ ...SDK_MAPPING, allowed_repo_ids: undefined }],
        error: undefined,
      });
      const { ciOidcApi } = await import("../ci-oidc");
      const out = await ciOidcApi.listMappings("p1");
      expect(out[0].allowed_repo_ids).toBeNull();
    });

    it("throws on error", async () => {
      mockListMappings.mockResolvedValue({ data: undefined, error: "fail" });
      const { ciOidcApi } = await import("../ci-oidc");
      await expect(ciOidcApi.listMappings("p1")).rejects.toBe("fail");
    });
  });

  describe("getMapping", () => {
    it("returns adapted mapping", async () => {
      mockGetMapping.mockResolvedValue({ data: SDK_MAPPING, error: undefined });
      const { ciOidcApi } = await import("../ci-oidc");
      const out = await ciOidcApi.getMapping("p1", "m1");
      expect(out.id).toBe("m1");
      expect(out.priority).toBe(10);
    });

    it("passes provider id and mapping id in path", async () => {
      mockGetMapping.mockResolvedValue({ data: SDK_MAPPING, error: undefined });
      const { ciOidcApi } = await import("../ci-oidc");
      await ciOidcApi.getMapping("p1", "m1");
      expect(mockGetMapping).toHaveBeenCalledWith({
        path: { id: "p1", mid: "m1" },
      });
    });

    it("throws on error", async () => {
      mockGetMapping.mockResolvedValue({ data: undefined, error: "fail" });
      const { ciOidcApi } = await import("../ci-oidc");
      await expect(ciOidcApi.getMapping("p1", "m1")).rejects.toBe("fail");
    });
  });

  describe("createMapping", () => {
    it("returns new mapping and forwards path + body", async () => {
      mockCreateMapping.mockResolvedValue({
        data: SDK_MAPPING,
        error: undefined,
      });
      const { ciOidcApi } = await import("../ci-oidc");
      await ciOidcApi.createMapping("p1", {
        name: "Prod deploy",
        priority: 10,
        claim_filters: { namespace_path: "my-org/my-group" },
      });
      expect(mockCreateMapping).toHaveBeenCalledWith({
        path: { id: "p1" },
        body: {
          name: "Prod deploy",
          priority: 10,
          claim_filters: { namespace_path: "my-org/my-group" },
        },
      });
    });

    it("throws on error", async () => {
      mockCreateMapping.mockResolvedValue({ data: undefined, error: "fail" });
      const { ciOidcApi } = await import("../ci-oidc");
      await expect(
        ciOidcApi.createMapping("p1", {
          name: "x",
          claim_filters: {},
        }),
      ).rejects.toBe("fail");
    });
  });

  describe("updateMapping", () => {
    it("forwards path with both ids + body", async () => {
      mockUpdateMapping.mockResolvedValue({
        data: SDK_MAPPING,
        error: undefined,
      });
      const { ciOidcApi } = await import("../ci-oidc");
      await ciOidcApi.updateMapping("p1", "m1", { name: "Renamed" });
      expect(mockUpdateMapping).toHaveBeenCalledWith({
        path: { id: "p1", mid: "m1" },
        body: { name: "Renamed" },
      });
    });

    it("throws on error", async () => {
      mockUpdateMapping.mockResolvedValue({ data: undefined, error: "fail" });
      const { ciOidcApi } = await import("../ci-oidc");
      await expect(
        ciOidcApi.updateMapping("p1", "m1", { name: "x" }),
      ).rejects.toBe("fail");
    });
  });

  describe("deleteMapping", () => {
    it("calls delete with both ids in path", async () => {
      mockDeleteMapping.mockResolvedValue({ data: undefined, error: undefined });
      const { ciOidcApi } = await import("../ci-oidc");
      await ciOidcApi.deleteMapping("p1", "m1");
      expect(mockDeleteMapping).toHaveBeenCalledWith({
        path: { id: "p1", mid: "m1" },
      });
    });

    it("throws on error", async () => {
      mockDeleteMapping.mockResolvedValue({ data: undefined, error: "fail" });
      const { ciOidcApi } = await import("../ci-oidc");
      await expect(ciOidcApi.deleteMapping("p1", "m1")).rejects.toBe("fail");
    });
  });

  describe("enableMapping / disableMapping", () => {
    it("enableMapping calls toggle with enabled: true", async () => {
      mockToggleMapping.mockResolvedValue({ data: undefined, error: undefined });
      const { ciOidcApi } = await import("../ci-oidc");
      await ciOidcApi.enableMapping("p1", "m1");
      expect(mockToggleMapping).toHaveBeenCalledWith({
        path: { id: "p1", mid: "m1" },
        body: { enabled: true },
      });
    });

    it("disableMapping calls toggle with enabled: false", async () => {
      mockToggleMapping.mockResolvedValue({ data: undefined, error: undefined });
      const { ciOidcApi } = await import("../ci-oidc");
      await ciOidcApi.disableMapping("p1", "m1");
      expect(mockToggleMapping).toHaveBeenCalledWith({
        path: { id: "p1", mid: "m1" },
        body: { enabled: false },
      });
    });

    it("throws on error", async () => {
      mockToggleMapping.mockResolvedValue({ data: undefined, error: "fail" });
      const { ciOidcApi } = await import("../ci-oidc");
      await expect(ciOidcApi.enableMapping("p1", "m1")).rejects.toBe("fail");
    });
  });

  // ---- Helper coverage (exported pure functions are in the page, test them too) ----

  describe("parseClaimFilters", () => {
    it("returns empty object for empty string", async () => {
      const { parseClaimFilters } = await import(
        "@/app/(app)/(admin)/settings/sso/ci/page"
      );
      expect(parseClaimFilters("")).toEqual({});
      expect(parseClaimFilters("   ")).toEqual({});
    });

    it("parses valid JSON", async () => {
      const { parseClaimFilters } = await import(
        "@/app/(app)/(admin)/settings/sso/ci/page"
      );
      const result = parseClaimFilters('{"sub": "value"}');
      expect(result).toEqual({ sub: "value" });
    });

    it("rejects arrays", async () => {
      const { parseClaimFilters } = await import(
        "@/app/(app)/(admin)/settings/sso/ci/page"
      );
      expect(parseClaimFilters("[1,2]")).toBeUndefined();
    });

    it("rejects strings", async () => {
      const { parseClaimFilters } = await import(
        "@/app/(app)/(admin)/settings/sso/ci/page"
      );
      expect(parseClaimFilters('"foo"')).toBeUndefined();
    });

    it("rejects numbers", async () => {
      const { parseClaimFilters } = await import(
        "@/app/(app)/(admin)/settings/sso/ci/page"
      );
      expect(parseClaimFilters("42")).toBeUndefined();
    });

    it("rejects null", async () => {
      const { parseClaimFilters } = await import(
        "@/app/(app)/(admin)/settings/sso/ci/page"
      );
      expect(parseClaimFilters("null")).toBeUndefined();
    });

    it("returns undefined for invalid JSON", async () => {
      const { parseClaimFilters } = await import(
        "@/app/(app)/(admin)/settings/sso/ci/page"
      );
      expect(parseClaimFilters("{bad")).toBeUndefined();
    });
  });

  describe("claimFilterSummary", () => {
    it("shows no-filters message for empty object", async () => {
      const { claimFilterSummary } = await import(
        "@/app/(app)/(admin)/settings/sso/ci/page"
      );
      expect(claimFilterSummary({})).toBe("No filters (any JWT accepted)");
    });

    it("formats string values", async () => {
      const { claimFilterSummary } = await import(
        "@/app/(app)/(admin)/settings/sso/ci/page"
      );
      expect(claimFilterSummary({ sub: "value" })).toBe("sub = value");
    });

    it("formats array values with any-of notation", async () => {
      const { claimFilterSummary } = await import(
        "@/app/(app)/(admin)/settings/sso/ci/page"
      );
      expect(
        claimFilterSummary({ namespace_path: ["group-a", "group-b"] }),
      ).toBe("namespace_path ∈ [group-a, group-b]");
    });
  });

  describe("repoScopeSummary", () => {
    it('returns "All repositories" for null', async () => {
      const { repoScopeSummary } = await import(
        "@/app/(app)/(admin)/settings/sso/ci/page"
      );
      expect(repoScopeSummary(null)).toBe("All repositories");
    });

    it('returns "No repositories" for empty array', async () => {
      const { repoScopeSummary } = await import(
        "@/app/(app)/(admin)/settings/sso/ci/page"
      );
      expect(repoScopeSummary([])).toBe("No repositories");
    });

    it("returns singular for one repo", async () => {
      const { repoScopeSummary } = await import(
        "@/app/(app)/(admin)/settings/sso/ci/page"
      );
      expect(repoScopeSummary(["r1"])).toBe("1 repository");
    });

    it("returns plural for multiple repos", async () => {
      const { repoScopeSummary } = await import(
        "@/app/(app)/(admin)/settings/sso/ci/page"
      );
      expect(repoScopeSummary(["r1", "r2", "r3"])).toBe("3 repositories");
    });
  });
});