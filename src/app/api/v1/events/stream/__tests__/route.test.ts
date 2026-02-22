import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
  vi.restoreAllMocks();
});

function createMockRequest(cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return { headers } as unknown as import("next/server").NextRequest;
}

describe("GET /api/v1/events/stream", () => {
  it("proxies SSE stream from backend with correct headers", async () => {
    const mockBody = new ReadableStream();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: mockBody,
        status: 200,
        statusText: "OK",
      })
    );

    const { GET } = await import("../route");
    const request = createMockRequest("ak_access_token=abc123");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe(
      "no-cache, no-transform"
    );
    expect(response.headers.get("Connection")).toBe("keep-alive");
    expect(response.body).toBe(mockBody);

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const url = fetchCall[0] as URL;
    expect(url.pathname).toBe("/api/v1/events/stream");
    expect(url.origin).toBe("http://backend:8080");

    const reqHeaders = fetchCall[1]!.headers as Headers;
    expect(reqHeaders.get("cookie")).toBe("ak_access_token=abc123");
    expect(reqHeaders.get("accept")).toBe("text/event-stream");
  });

  it("uses custom BACKEND_URL when set", async () => {
    process.env.BACKEND_URL = "http://localhost:9090";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream(),
        status: 200,
        statusText: "OK",
      })
    );

    const { GET } = await import("../route");
    const request = createMockRequest();
    await GET(request);

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const url = fetchCall[0] as URL;
    expect(url.origin).toBe("http://localhost:9090");
  });

  it("returns error response when upstream fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        body: null,
        status: 401,
        statusText: "Unauthorized",
      })
    );

    const { GET } = await import("../route");
    const request = createMockRequest();
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("returns error response when upstream body is null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: null,
        status: 200,
        statusText: "OK",
      })
    );

    const { GET } = await import("../route");
    const request = createMockRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe("OK");
  });

  it("omits cookie header when request has no cookies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream(),
        status: 200,
        statusText: "OK",
      })
    );

    const { GET } = await import("../route");
    const request = createMockRequest();
    await GET(request);

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const reqHeaders = fetchCall[1]!.headers as Headers;
    expect(reqHeaders.has("cookie")).toBe(false);
    expect(reqHeaders.get("accept")).toBe("text/event-stream");
  });
});
