import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks for next/server
// ---------------------------------------------------------------------------

const mockRewrite = vi.fn();
const mockNext = vi.fn();

interface MockResponse {
  type: string;
  args: unknown[];
  headers: {
    set: (key: string, value: string) => void;
    get: (key: string) => string | undefined;
    entries: () => [string, string][];
  };
}

function makeMockResponse(type: string, args: unknown[]): MockResponse {
  const headers = new Map<string, string>();
  return {
    type,
    args,
    headers: {
      set: (key, value) => void headers.set(key, value),
      get: (key) => headers.get(key),
      entries: () => [...headers.entries()],
    },
  };
}

vi.mock("next/server", () => ({
  NextResponse: {
    rewrite: (...args: unknown[]) => {
      mockRewrite(...args);
      return makeMockResponse("rewrite", args);
    },
    next: (...args: unknown[]) => {
      mockNext(...args);
      return makeMockResponse("next", args);
    },
  },
}));

const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
  delete process.env.AK_ENFORCE_HTTPS;
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

describe("middleware proxying", () => {
  it("skips SSE event stream path and calls NextResponse.next()", async () => {
    const { middleware } = await import("../middleware");
    const request = createMockNextRequest("/api/v1/events/stream");
    const result = middleware(request) as unknown as MockResponse;

    expect(mockNext).toHaveBeenCalled();
    expect(mockRewrite).not.toHaveBeenCalled();
    expect(result.type).toBe("next");
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
    const result = middleware(request) as unknown as MockResponse;

    expect(mockNext).toHaveBeenCalled();
    expect(mockRewrite).not.toHaveBeenCalled();
    expect(result.type).toBe("next");
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

  it("passes page routes through with NextResponse.next()", async () => {
    const { middleware } = await import("../middleware");

    for (const path of ["/", "/login", "/repositories", "/repositories/npm/my-repo/packages/lodash/1.0.0"]) {
      mockNext.mockClear();
      mockRewrite.mockClear();
      middleware(createMockNextRequest(path));
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRewrite).not.toHaveBeenCalled();
    }
  });

  it("exports a catch-all matcher that excludes only Next.js internals", async () => {
    // The matcher must cover page routes (for runtime security headers, #679)
    // as well as the proxy paths; the middleware function itself decides
    // which is which.
    const { config } = await import("../middleware");
    expect(config.matcher).toHaveLength(1);
    expect(config.matcher[0]).toBe(
      "/((?!_next/static|_next/image|favicon.ico).*)",
    );
  });
});

describe("middleware security headers (#679)", () => {
  it("emits the always-on baseline headers on page routes by default", async () => {
    const { middleware } = await import("../middleware");
    const result = middleware(
      createMockNextRequest("/repositories"),
    ) as unknown as MockResponse;

    expect(result.headers.get("X-Frame-Options")).toBe("DENY");
    expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(result.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(result.headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    expect(result.headers.get("Content-Security-Policy")).toContain(
      "default-src 'self'",
    );
  });

  it("emits the baseline headers on proxied API responses too", async () => {
    const { middleware } = await import("../middleware");
    const result = middleware(
      createMockNextRequest("/api/v1/users"),
    ) as unknown as MockResponse;

    expect(result.type).toBe("rewrite");
    expect(result.headers.get("X-Frame-Options")).toBe("DENY");
    expect(result.headers.get("Content-Security-Policy")).toContain(
      "default-src 'self'",
    );
  });

  it("emits the baseline headers on the SSE pass-through path", async () => {
    const { middleware } = await import("../middleware");
    const result = middleware(
      createMockNextRequest("/api/v1/events/stream"),
    ) as unknown as MockResponse;

    expect(result.type).toBe("next");
    expect(result.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("omits HSTS and upgrade-insecure-requests when AK_ENFORCE_HTTPS is unset", async () => {
    const { middleware } = await import("../middleware");
    const result = middleware(
      createMockNextRequest("/repositories"),
    ) as unknown as MockResponse;

    expect(result.headers.get("Strict-Transport-Security")).toBeUndefined();
    expect(result.headers.get("Content-Security-Policy")).not.toContain(
      "upgrade-insecure-requests",
    );
  });

  it.each(["true", "1"])(
    "emits HSTS and upgrade-insecure-requests when AK_ENFORCE_HTTPS=%s is set at runtime",
    async (value) => {
      // Set AFTER import to prove the flag is read per request, not at
      // module load (i.e. not baked in at build time).
      const { middleware } = await import("../middleware");
      process.env.AK_ENFORCE_HTTPS = value;
      const result = middleware(
        createMockNextRequest("/repositories"),
      ) as unknown as MockResponse;

      expect(result.headers.get("Strict-Transport-Security")).toBe(
        "max-age=31536000; includeSubDomains",
      );
      expect(result.headers.get("Content-Security-Policy")).toContain(
        "upgrade-insecure-requests",
      );
    },
  );

  it("applies the runtime HTTPS headers on proxied API responses as well", async () => {
    const { middleware } = await import("../middleware");
    process.env.AK_ENFORCE_HTTPS = "true";
    const result = middleware(
      createMockNextRequest("/api/v1/users"),
    ) as unknown as MockResponse;

    expect(result.type).toBe("rewrite");
    expect(result.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });

  it("stops emitting HSTS when the flag is removed at runtime", async () => {
    const { middleware } = await import("../middleware");
    process.env.AK_ENFORCE_HTTPS = "true";
    const on = middleware(
      createMockNextRequest("/repositories"),
    ) as unknown as MockResponse;
    expect(on.headers.get("Strict-Transport-Security")).toBeDefined();

    delete process.env.AK_ENFORCE_HTTPS;
    const off = middleware(
      createMockNextRequest("/repositories"),
    ) as unknown as MockResponse;
    expect(off.headers.get("Strict-Transport-Security")).toBeUndefined();
  });
});
