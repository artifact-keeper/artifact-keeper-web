import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the SDK client and capture interceptors
const requestInterceptors: Array<(req: Request) => Request> = [];
const responseInterceptors: Array<
  (res: Response, req: Request) => Response | Promise<Response>
> = [];

vi.mock("@artifact-keeper/sdk/client", () => ({
  client: {
    setConfig: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn((fn: (req: Request) => Request) => {
          requestInterceptors.push(fn);
        }),
      },
      response: {
        use: vi.fn(
          (
            fn: (res: Response, req: Request) => Response | Promise<Response>
          ) => {
            responseInterceptors.push(fn);
          }
        ),
      },
    },
  },
}));

describe("sdk-client", () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    vi.resetModules();
    requestInterceptors.length = 0;
    responseInterceptors.length = 0;
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:3000", pathname: "/", href: "/" },
    });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        mockStorage[key] = val;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
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

  describe("request interceptor", () => {
    it("does not modify requests for local instances", async () => {
      mockStorage["ak_active_instance"] = "local";
      await import("../sdk-client");
      const interceptor = requestInterceptors[0];

      const request = new Request("http://localhost:3000/api/v1/repos");
      const result = interceptor(request);
      expect(result.url).toBe("http://localhost:3000/api/v1/repos");
    });

    it("prepends proxy path for remote instances", async () => {
      mockStorage["ak_active_instance"] = "remote-1";
      await import("../sdk-client");
      const interceptor = requestInterceptors[0];

      const request = new Request("http://localhost:3000/api/v1/repos");
      const result = interceptor(request);
      expect(new URL(result.url).pathname).toBe(
        "/api/v1/instances/remote-1/proxy/api/v1/repos"
      );
    });

    it("only modifies pathname, not protocol or host", async () => {
      mockStorage["ak_active_instance"] = "remote-1";
      await import("../sdk-client");
      const interceptor = requestInterceptors[0];

      const request = new Request("http://localhost:3000/api/v1/repos");
      const result = interceptor(request);
      const url = new URL(result.url);
      expect(url.protocol).toBe("http:");
      expect(url.host).toBe("localhost:3000");
    });
  });

  describe("interceptors registration", () => {
    it("registers request and response interceptors on import", async () => {
      const { client } = await import("@artifact-keeper/sdk/client");
      await import("../sdk-client");
      expect(client.interceptors.request.use).toHaveBeenCalled();
      expect(client.interceptors.response.use).toHaveBeenCalled();
    });
  });
});
