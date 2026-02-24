import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the SDK client to prevent side effects during import
vi.mock("@artifact-keeper/sdk/client", () => ({
  client: {
    setConfig: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

describe("sdk-client", () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    vi.resetModules();
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:3000", pathname: "/", href: "/" },
    });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, val: string) => { mockStorage[key] = val; }),
      removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getActiveInstanceBaseUrl", () => {
    it("returns base URL for local instance", async () => {
      mockStorage["ak_active_instance"] = "local";
      const { getActiveInstanceBaseUrl } = await import("../sdk-client");
      expect(getActiveInstanceBaseUrl()).toBe("");
    });

    it("returns base URL when no active instance is set", async () => {
      const { getActiveInstanceBaseUrl } = await import("../sdk-client");
      expect(getActiveInstanceBaseUrl()).toBe("");
    });

    it("returns proxy URL for remote instances", async () => {
      mockStorage["ak_active_instance"] = "remote-1";
      const { getActiveInstanceBaseUrl } = await import("../sdk-client");
      expect(getActiveInstanceBaseUrl()).toBe(
        "/api/v1/instances/remote-1/proxy"
      );
    });

    it("encodes special characters in instance ID", async () => {
      mockStorage["ak_active_instance"] = "inst/special&id";
      const { getActiveInstanceBaseUrl } = await import("../sdk-client");
      const result = getActiveInstanceBaseUrl();
      expect(result).toContain(encodeURIComponent("inst/special&id"));
      expect(result).not.toContain("inst/special&id");
    });
  });

  describe("interceptors", () => {
    it("registers request and response interceptors on import", async () => {
      const { client } = await import("@artifact-keeper/sdk/client");
      await import("../sdk-client");
      expect(client.interceptors.request.use).toHaveBeenCalled();
      expect(client.interceptors.response.use).toHaveBeenCalled();
    });
  });
});
