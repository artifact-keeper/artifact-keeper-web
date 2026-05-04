import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks for next/server
// ---------------------------------------------------------------------------

const mockRewrite = vi.fn();
const mockNext = vi.fn();

vi.mock("next/server", () => ({
  NextResponse: {
    rewrite: (...args: unknown[]) => {
      mockRewrite(...args);
      return { type: "rewrite", args };
    },
    next: (...args: unknown[]) => {
      mockNext(...args);
      return { type: "next" };
    },
  },
}));

const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
  mockRewrite.mockClear();
  mockNext.mockClear();
});

afterEach(() => {
  process.env = originalEnv;
});

function createMockNextRequest(pathname: string, search = "") {
  return {
    nextUrl: { pathname, search },
  } as unknown as import("next/server").NextRequest;
}

/**
 * Asserts that the most recent NextResponse.rewrite() call targeted the given
 * path on the given backend origin (defaults to the docker-compose default).
 */
function expectRewriteTo(pathname: string, origin = "http://backend:8080") {
  expect(mockRewrite).toHaveBeenCalledTimes(1);
  const url = mockRewrite.mock.calls[0][0] as URL;
  expect(url.pathname).toBe(pathname);
  expect(url.origin).toBe(origin);
  return url;
}

describe("middleware", () => {
  it("skips SSE event stream path and calls NextResponse.next()", async () => {
    const { middleware } = await import("../middleware");
    const request = createMockNextRequest("/api/v1/events/stream");
    const result = middleware(request);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRewrite).not.toHaveBeenCalled();
    expect(result).toEqual({ type: "next" });
  });

  it.each([
    ["/api/v1/events/stream/", "single trailing slash"],
    ["/api/v1/events/stream///", "multiple trailing slashes"],
  ])("skips SSE event stream path with %s variant (%s)", async (path) => {
    // skipTrailingSlashRedirect (set in next.config.ts) means trailing-slash
    // variants reach middleware verbatim instead of being 308'd to the
    // canonical form. The early-return must treat all variants equivalently,
    // otherwise SSE gets proxy-rewritten and the long-lived connection
    // breaks. The multi-slash case locks in the regex `/\/+$/` against
    // accidental refactors to a single-slash variant. See #337.
    const { middleware } = await import("../middleware");
    const request = createMockNextRequest(path);
    const result = middleware(request);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRewrite).not.toHaveBeenCalled();
    expect(result).toEqual({ type: "next" });
  });

  it("rewrites other API paths to backend", async () => {
    const { middleware } = await import("../middleware");
    const request = createMockNextRequest("/api/v1/users", "?page=1");
    middleware(request);

    expect(mockRewrite).toHaveBeenCalledTimes(1);
    const url = mockRewrite.mock.calls[0][0] as URL;
    expect(url.pathname).toBe("/api/v1/users");
    expect(url.search).toBe("?page=1");
    expect(url.origin).toBe("http://backend:8080");
  });

  it("rewrites /health to backend", async () => {
    const { middleware } = await import("../middleware");
    const request = createMockNextRequest("/health");
    middleware(request);

    expect(mockRewrite).toHaveBeenCalledTimes(1);
    const url = mockRewrite.mock.calls[0][0] as URL;
    expect(url.pathname).toBe("/health");
  });

  it("uses custom BACKEND_URL when set", async () => {
    process.env.BACKEND_URL = "http://custom-backend:9090";
    const { middleware } = await import("../middleware");
    const request = createMockNextRequest("/api/v1/repos");
    middleware(request);

    const url = mockRewrite.mock.calls[0][0] as URL;
    expect(url.origin).toBe("http://custom-backend:9090");
  });

  it("rewrites native format paths to backend", async () => {
    const { middleware } = await import("../middleware");

    const formatPaths = [
      "/pypi/my-repo/simple/",
      "/npm/my-repo/package",
      "/maven/my-repo/com/example/artifact",
      "/v2/my-repo/manifests/latest",
      "/helm/my-repo/index.yaml",
      "/cargo/my-repo/api/v1/crates",
    ];

    for (const path of formatPaths) {
      mockRewrite.mockClear();
      middleware(createMockNextRequest(path));
      expect(mockRewrite).toHaveBeenCalledTimes(1);
      const url = mockRewrite.mock.calls[0][0] as URL;
      expect(url.pathname).toBe(path);
      expect(url.origin).toBe("http://backend:8080");
    }
  });

  it("rewrites Docker Registry v2 ping endpoint (bare /v2/) to backend", async () => {
    // The docker client hits `GET /v2/` (with trailing slash) for the API
    // version check during `docker login`. The proxy must forward this verbatim
    // so the backend's `WWW-Authenticate` challenge reaches the client. See
    // #1007 — combined with `skipTrailingSlashRedirect` in next.config.ts.
    const { middleware } = await import("../middleware");

    for (const path of ["/v2/", "/v2"]) {
      mockRewrite.mockClear();
      middleware(createMockNextRequest(path));
      expectRewriteTo(path);
    }
  });

  it("exports matcher config for API, health, and native format routes", async () => {
    const { config } = await import("../middleware");
    expect(config.matcher).toContain("/api/:path*");
    expect(config.matcher).toContain("/health");
    expect(config.matcher).toContain("/pypi/:path*");
    expect(config.matcher).toContain("/npm/:path*");
    expect(config.matcher).toContain("/maven/:path*");
    expect(config.matcher).toContain("/v2");
    expect(config.matcher).toContain("/v2/:path*");
    expect(config.matcher.length).toBeGreaterThan(30);
  });
});
