import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the SDK client and capture interceptors
// ---------------------------------------------------------------------------

const mockSetConfig = vi.fn();
const requestInterceptors: Array<(req: Request) => Request> = [];
const responseInterceptors: Array<
  (res: Response, req: Request) => Response | Promise<Response>
> = [];

vi.mock("@artifact-keeper/sdk/client", () => ({
  client: {
    setConfig: (...args: any[]) => mockSetConfig(...args),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockStorage: Record<string, string> = {};

function setupBrowserEnv(overrides: Partial<{ pathname: string; href: string }> = {}) {
  for (const key of Object.keys(mockStorage)) delete mockStorage[key];

  vi.stubGlobal("window", {
    location: {
      origin: "http://localhost:3000",
      pathname: overrides.pathname ?? "/",
      href: overrides.href ?? "/",
    },
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
}

function setupServerEnv() {
  // Simulate server-side: no window
  vi.stubGlobal("window", undefined);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sdk-client", () => {
  beforeEach(() => {
    vi.resetModules();
    requestInterceptors.length = 0;
    responseInterceptors.length = 0;
    mockSetConfig.mockClear();
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // getActiveInstanceBaseUrl
  // -------------------------------------------------------------------------

  describe("getActiveInstanceBaseUrl", () => {
    it("returns empty string on server-side (window undefined)", async () => {
      setupServerEnv();
      const { getActiveInstanceBaseUrl } = await import("../sdk-client");
      expect(getActiveInstanceBaseUrl()).toBe("");
    });

    it("returns empty string for local instance", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "local";
      const { getActiveInstanceBaseUrl } = await import("../sdk-client");
      expect(getActiveInstanceBaseUrl()).toBe("");
    });

    it("returns proxy path for remote instance", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "remote-1";
      const { getActiveInstanceBaseUrl } = await import("../sdk-client");
      expect(getActiveInstanceBaseUrl()).toBe(
        "/api/v1/instances/remote-1/proxy"
      );
    });

    it("returns empty string when no active instance is set (defaults to local)", async () => {
      setupBrowserEnv();
      const { getActiveInstanceBaseUrl } = await import("../sdk-client");
      expect(getActiveInstanceBaseUrl()).toBe("");
    });

    it("encodes special characters in instance ID", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "inst/special&id";
      const { getActiveInstanceBaseUrl } = await import("../sdk-client");
      const result = getActiveInstanceBaseUrl();
      expect(result).toContain(encodeURIComponent("inst/special&id"));
      expect(result).not.toContain("inst/special&id");
    });

    it("returns API_BASE_URL when localStorage throws", async () => {
      setupBrowserEnv();
      // Override localStorage.getItem to throw
      vi.stubGlobal("localStorage", {
        getItem: vi.fn(() => {
          throw new Error("SecurityError");
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      });
      const { getActiveInstanceBaseUrl } = await import("../sdk-client");
      // Should fall back to API_BASE_URL (empty string since NEXT_PUBLIC_API_URL is not set)
      expect(getActiveInstanceBaseUrl()).toBe("");
    });
  });

  // -------------------------------------------------------------------------
  // isRemoteInstance (tested indirectly through interceptors)
  // -------------------------------------------------------------------------

  describe("isRemoteInstance (indirect via interceptors)", () => {
    it("returns false on server-side", async () => {
      setupServerEnv();
      await import("../sdk-client");
      // The request interceptor checks isRemoteInstance; on server-side it returns early
      const interceptor = requestInterceptors[0];
      const request = new Request("http://localhost:3000/api/v1/repos");
      // Since window is undefined, isRemoteInstance should be false and interceptor returns unchanged request
      // But the interceptor also checks typeof window === 'undefined' first, so it returns request immediately
      // We need to create a real Request in the test environment
      const result = interceptor(request);
      expect(result.url).toBe("http://localhost:3000/api/v1/repos");
    });

    it("returns false for local instance (request unmodified)", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "local";
      await import("../sdk-client");
      const interceptor = requestInterceptors[0];
      const request = new Request("http://localhost:3000/api/v1/repos");
      const result = interceptor(request);
      expect(result.url).toBe("http://localhost:3000/api/v1/repos");
    });

    it("returns false when localStorage throws (request unmodified)", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "remote-1";
      await import("../sdk-client");
      const interceptor = requestInterceptors[0];

      // Now override localStorage to throw to hit the isRemoteInstance catch branch
      vi.stubGlobal("localStorage", {
        getItem: vi.fn(() => {
          throw new Error("SecurityError");
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      });

      const request = new Request("http://localhost:3000/api/v1/repos");
      const result = interceptor(request);
      // isRemoteInstance catches and returns false, so request is unmodified
      expect(result.url).toBe("http://localhost:3000/api/v1/repos");
    });

    it("returns true for remote instance (request modified)", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "remote-1";
      await import("../sdk-client");
      const interceptor = requestInterceptors[0];
      const request = new Request("http://localhost:3000/api/v1/repos");
      const result = interceptor(request);
      expect(new URL(result.url).pathname).toBe(
        "/api/v1/instances/remote-1/proxy/api/v1/repos"
      );
    });
  });

  // -------------------------------------------------------------------------
  // client.setConfig
  // -------------------------------------------------------------------------

  describe("client.setConfig", () => {
    it("is called with baseUrl and credentials on module import", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "local";
      await import("../sdk-client");
      expect(mockSetConfig).toHaveBeenCalledWith({
        baseUrl: "",
        credentials: "include",
      });
    });

    it("is called with proxy baseUrl for remote instance", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "remote-1";
      await import("../sdk-client");
      expect(mockSetConfig).toHaveBeenCalledWith({
        baseUrl: "/api/v1/instances/remote-1/proxy",
        credentials: "include",
      });
    });
  });

  // -------------------------------------------------------------------------
  // Request interceptor
  // -------------------------------------------------------------------------

  describe("request interceptor", () => {
    it("returns unmodified request for local instance", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "local";
      await import("../sdk-client");
      const interceptor = requestInterceptors[0];
      const request = new Request("http://localhost:3000/api/v1/repos");
      const result = interceptor(request);
      expect(result.url).toBe("http://localhost:3000/api/v1/repos");
    });

    it("rewrites URL for remote instance", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "remote-1";
      await import("../sdk-client");
      const interceptor = requestInterceptors[0];
      const request = new Request("http://localhost:3000/api/v1/repos");
      const result = interceptor(request);
      expect(new URL(result.url).pathname).toBe(
        "/api/v1/instances/remote-1/proxy/api/v1/repos"
      );
    });

    it("only modifies pathname, preserving protocol and host", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "remote-1";
      await import("../sdk-client");
      const interceptor = requestInterceptors[0];
      const request = new Request("http://localhost:3000/api/v1/repos");
      const result = interceptor(request);
      const url = new URL(result.url);
      expect(url.protocol).toBe("http:");
      expect(url.host).toBe("localhost:3000");
    });

    it("returns request unmodified when window is undefined (server-side)", async () => {
      setupServerEnv();
      await import("../sdk-client");
      // Re-setup browser env for the interceptor call
      setupBrowserEnv();
      const interceptor = requestInterceptors[0];
      const request = new Request("http://localhost:3000/api/v1/repos");
      // The interceptor was created during import when window was undefined,
      // but it checks typeof window at call time. Now window is defined
      // but since isRemoteInstance checks localStorage which has no active instance,
      // it defaults to local and returns unchanged.
      const result = interceptor(request);
      expect(result.url).toBe("http://localhost:3000/api/v1/repos");
    });
  });

  // -------------------------------------------------------------------------
  // Response interceptor: 403 SETUP_REQUIRED
  // -------------------------------------------------------------------------

  describe("response interceptor - 403 SETUP_REQUIRED", () => {
    it("redirects to /login on 403 SETUP_REQUIRED", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "local";
      await import("../sdk-client");
      const interceptor = responseInterceptors[0];

      const response = new Response(
        JSON.stringify({ error: "SETUP_REQUIRED" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
      const request = new Request("http://localhost:3000/api/v1/repos");

      await interceptor(response, request);

      expect(window.location.href).toBe("/login");
    });

    it("does not redirect on 403 if already on /login", async () => {
      setupBrowserEnv({ pathname: "/login" });
      mockStorage["ak_active_instance"] = "local";
      await import("../sdk-client");
      const interceptor = responseInterceptors[0];

      const response = new Response(
        JSON.stringify({ error: "SETUP_REQUIRED" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
      const request = new Request("http://localhost:3000/api/v1/repos");

      const result = await interceptor(response, request);
      // Should just pass through
      expect(result.status).toBe(403);
      expect(window.location.href).not.toBe("/login");
    });

    it("does not redirect on 403 if already on /change-password", async () => {
      setupBrowserEnv({ pathname: "/change-password" });
      mockStorage["ak_active_instance"] = "local";
      await import("../sdk-client");
      const interceptor = responseInterceptors[0];

      const response = new Response(
        JSON.stringify({ error: "SETUP_REQUIRED" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
      const request = new Request("http://localhost:3000/api/v1/repos");

      const result = await interceptor(response, request);
      expect(result.status).toBe(403);
    });

    it("does not redirect on 403 if body is not SETUP_REQUIRED", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "local";
      await import("../sdk-client");
      const interceptor = responseInterceptors[0];

      const response = new Response(
        JSON.stringify({ error: "FORBIDDEN" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
      const request = new Request("http://localhost:3000/api/v1/repos");

      const result = await interceptor(response, request);
      // Should not redirect, should continue to 401 check (which passes through since status is 403)
      expect(result.status).toBe(403);
    });

    it("handles non-JSON 403 response body gracefully", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "local";
      await import("../sdk-client");
      const interceptor = responseInterceptors[0];

      const response = new Response("Not JSON body", {
        status: 403,
      });
      const request = new Request("http://localhost:3000/api/v1/repos");

      const result = await interceptor(response, request);
      // Should not throw, should fall through and return the response
      expect(result.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Response interceptor: 401 token refresh
  // -------------------------------------------------------------------------

  describe("response interceptor - 401 token refresh", () => {
    it("attempts token refresh on 401 for non-auth endpoints", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "local";

      const mockFetch = vi.fn();
      // First call: refresh endpoint returns success
      mockFetch.mockResolvedValueOnce(
        new Response("{}", { status: 200 })
      );
      // Second call: retried original request
      mockFetch.mockResolvedValueOnce(
        new Response("{}", { status: 200 })
      );
      vi.stubGlobal("fetch", mockFetch);

      await import("../sdk-client");
      const interceptor = responseInterceptors[0];

      const response = new Response("Unauthorized", { status: 401 });
      const request = new Request("http://localhost:3000/api/v1/repos");

      const result = await interceptor(response, request);

      // Should have called fetch for refresh
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/auth/refresh",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
        })
      );
      // Should have retried the original request
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.status).toBe(200);
    });

    it("skips refresh for /auth/me endpoint", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "local";
      await import("../sdk-client");
      const interceptor = responseInterceptors[0];

      const response = new Response("Unauthorized", { status: 401 });
      const request = new Request("http://localhost:3000/api/v1/auth/me");

      const result = await interceptor(response, request);
      expect(result.status).toBe(401);
    });

    it("skips refresh for /auth/refresh endpoint", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "local";
      await import("../sdk-client");
      const interceptor = responseInterceptors[0];

      const response = new Response("Unauthorized", { status: 401 });
      const request = new Request(
        "http://localhost:3000/api/v1/auth/refresh"
      );

      const result = await interceptor(response, request);
      expect(result.status).toBe(401);
    });

    it("skips refresh for /auth/login endpoint", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "local";
      await import("../sdk-client");
      const interceptor = responseInterceptors[0];

      const response = new Response("Unauthorized", { status: 401 });
      const request = new Request(
        "http://localhost:3000/api/v1/auth/login"
      );

      const result = await interceptor(response, request);
      expect(result.status).toBe(401);
    });

    it("skips refresh for remote instance (returns 401 directly)", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "remote-1";
      await import("../sdk-client");
      const interceptor = responseInterceptors[0];

      const response = new Response("Unauthorized", { status: 401 });
      const request = new Request("http://localhost:3000/api/v1/repos");

      const result = await interceptor(response, request);
      expect(result.status).toBe(401);
    });

    it("redirects to /login when refresh fails", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "local";

      const mockFetch = vi.fn();
      // Refresh endpoint returns 401 (not ok)
      mockFetch.mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401 })
      );
      vi.stubGlobal("fetch", mockFetch);

      await import("../sdk-client");
      const interceptor = responseInterceptors[0];

      const response = new Response("Unauthorized", { status: 401 });
      const request = new Request("http://localhost:3000/api/v1/repos");

      const result = await interceptor(response, request);

      expect(window.location.href).toBe("/login");
      expect(result.status).toBe(401);
    });

    it("does not redirect to /login when already on /login and refresh fails", async () => {
      setupBrowserEnv({ pathname: "/login", href: "/login" });
      mockStorage["ak_active_instance"] = "local";

      const mockFetch = vi.fn();
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      vi.stubGlobal("fetch", mockFetch);

      await import("../sdk-client");
      const interceptor = responseInterceptors[0];

      const response = new Response("Unauthorized", { status: 401 });
      const request = new Request("http://localhost:3000/api/v1/repos");

      const result = await interceptor(response, request);

      // Should not change href since we are already on /login
      expect(window.location.href).toBe("/login");
      expect(result.status).toBe(401);
    });

    it("redirects to /login when refresh fetch throws a network error", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "local";

      const mockFetch = vi.fn();
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      vi.stubGlobal("fetch", mockFetch);

      await import("../sdk-client");
      const interceptor = responseInterceptors[0];

      const response = new Response("Unauthorized", { status: 401 });
      const request = new Request("http://localhost:3000/api/v1/repos");

      const result = await interceptor(response, request);

      expect(window.location.href).toBe("/login");
      expect(result.status).toBe(401);
    });

    it("returns response as-is for non-401 non-403 status codes", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "local";
      await import("../sdk-client");
      const interceptor = responseInterceptors[0];

      const response = new Response("OK", { status: 200 });
      const request = new Request("http://localhost:3000/api/v1/repos");

      const result = await interceptor(response, request);
      expect(result.status).toBe(200);
    });

    it("returns response as-is for 500 status codes", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "local";
      await import("../sdk-client");
      const interceptor = responseInterceptors[0];

      const response = new Response("Internal Server Error", { status: 500 });
      const request = new Request("http://localhost:3000/api/v1/repos");

      const result = await interceptor(response, request);
      expect(result.status).toBe(500);
    });

    it("queues concurrent 401 requests and retries them after refresh completes", async () => {
      setupBrowserEnv();
      mockStorage["ak_active_instance"] = "local";

      let resolveRefresh!: (value: Response) => void;
      const refreshPromise = new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      });

      const mockFetch = vi.fn();
      // First call: refresh endpoint (delayed)
      mockFetch.mockImplementationOnce(() => refreshPromise);
      // Second call: retry of first request (after refresh completes)
      mockFetch.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
      // Third call: retry of second request (from subscriber)
      mockFetch.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
      vi.stubGlobal("fetch", mockFetch);

      await import("../sdk-client");
      const interceptor = responseInterceptors[0];

      const response1 = new Response("Unauthorized", { status: 401 });
      const response2 = new Response("Unauthorized", { status: 401 });
      const request1 = new Request("http://localhost:3000/api/v1/repos");
      const request2 = new Request("http://localhost:3000/api/v1/artifacts");

      // Fire the first 401 (starts the refresh)
      const result1Promise = interceptor(response1, request1);

      // Fire the second 401 (should queue as subscriber since isRefreshing is true)
      const result2Promise = interceptor(response2, request2);

      // Now resolve the refresh
      resolveRefresh(new Response("{}", { status: 200 }));

      const [result1, result2] = await Promise.all([result1Promise, result2Promise]);

      // Both should have succeeded after refresh
      expect(result1.status).toBe(200);
      expect(result2.status).toBe(200);

      // fetch should have been called 3 times: refresh + 2 retries
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("returns 401 directly when window is undefined (server-side)", async () => {
      setupServerEnv();
      await import("../sdk-client");
      const interceptor = responseInterceptors[0];

      // Restore window for Response/Request constructors
      setupBrowserEnv();
      const response = new Response("Unauthorized", { status: 401 });
      const request = new Request("http://localhost:3000/api/v1/repos");

      // Temporarily remove window to simulate server-side check
      vi.stubGlobal("window", undefined);
      const result = await interceptor(response, request);
      expect(result.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Interceptor registration
  // -------------------------------------------------------------------------

  describe("interceptor registration", () => {
    it("registers both request and response interceptors on module import", async () => {
      setupBrowserEnv();
      await import("../sdk-client");
      const { client } = await import("@artifact-keeper/sdk/client");
      expect(client.interceptors.request.use).toHaveBeenCalled();
      expect(client.interceptors.response.use).toHaveBeenCalled();
    });

    it("registers exactly one request and one response interceptor", async () => {
      setupBrowserEnv();
      await import("../sdk-client");
      expect(requestInterceptors).toHaveLength(1);
      expect(responseInterceptors).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Exports
  // -------------------------------------------------------------------------

  describe("exports", () => {
    it("exports client from the SDK", async () => {
      setupBrowserEnv();
      const mod = await import("../sdk-client");
      expect(mod.client).toBeDefined();
      expect(mod.client.setConfig).toBeDefined();
    });

    it("exports getActiveInstanceBaseUrl", async () => {
      setupBrowserEnv();
      const mod = await import("../sdk-client");
      expect(typeof mod.getActiveInstanceBaseUrl).toBe("function");
    });
  });
});
