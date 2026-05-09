import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({
  getActiveInstanceBaseUrl: () => "http://localhost:8080",
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { apiFetch, assertData } from "../fetch";

function mockResponse(options: {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
  textRejects?: boolean;
}): Response {
  const {
    ok = true,
    status = 200,
    json,
    text,
    textRejects = false,
  } = options;

  // When `json` is provided but `text` is not, serialize the JSON value so
  // both `.json()` and `.text()` return consistent data. The implementation
  // reads the body via `.text()` + `JSON.parse()` to safely handle empty
  // response bodies.
  const resolvedText = text ?? (json !== undefined ? JSON.stringify(json) : "");

  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(json),
    text: textRejects
      ? vi.fn().mockRejectedValue(new Error("body read failed"))
      : vi.fn().mockResolvedValue(resolvedText),
    headers: new Headers(),
  } as unknown as Response;
}

describe("apiFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Successful JSON response ----

  it("returns parsed JSON on successful 200 response", async () => {
    const data = { id: "123", name: "test-artifact" };
    mockFetch.mockResolvedValue(mockResponse({ ok: true, status: 200, json: data }));

    const result = await apiFetch<{ id: string; name: string }>("/api/v1/artifacts");

    expect(result).toEqual(data);
  });

  it("constructs the full URL from base URL and path", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, status: 200, json: {} }));

    await apiFetch("/api/v1/repositories");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/repositories",
      expect.any(Object)
    );
  });

  // ---- 204 No Content ----

  it("returns undefined for 204 No Content response", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, status: 204 }));

    const result = await apiFetch<void>("/api/v1/service-accounts/sa-1");

    expect(result).toBeUndefined();
  });

  // ---- 200 with empty body (e.g. DELETE rewritten from 204 by proxy) ----

  it("returns undefined for 200 response with empty body", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, status: 200, text: "" }));

    const result = await apiFetch<void>("/api/v1/service-accounts/sa-1", {
      method: "DELETE",
    });

    expect(result).toBeUndefined();
  });

  // ---- 200 with whitespace-only body ----

  it("returns undefined for 200 response with whitespace-only body", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, status: 200, text: "  \n\t  " }));

    const result = await apiFetch<void>("/api/v1/service-accounts/sa-1", {
      method: "DELETE",
    });

    expect(result).toBeUndefined();
  });

  // ---- Non-ok response error handling ----

  it("throws an error with status and body for non-ok response", async () => {
    mockFetch.mockResolvedValue(
      mockResponse({ ok: false, status: 404, text: "Not Found" })
    );

    await expect(apiFetch("/api/v1/missing")).rejects.toThrow(
      "API error 404: Not Found"
    );
  });

  it("throws an error with status 500 and server error body", async () => {
    mockFetch.mockResolvedValue(
      mockResponse({
        ok: false,
        status: 500,
        text: '{"error":"Internal Server Error"}',
      })
    );

    await expect(apiFetch("/api/v1/broken")).rejects.toThrow(
      'API error 500: {"error":"Internal Server Error"}'
    );
  });

  it("throws with empty body when response.text() fails", async () => {
    mockFetch.mockResolvedValue(
      mockResponse({ ok: false, status: 502, textRejects: true })
    );

    await expect(apiFetch("/api/v1/bad-gateway")).rejects.toThrow(
      "API error 502: "
    );
  });

  it("throws with status 401 for unauthorized requests", async () => {
    mockFetch.mockResolvedValue(
      mockResponse({ ok: false, status: 401, text: "Unauthorized" })
    );

    await expect(apiFetch("/api/v1/protected")).rejects.toThrow(
      "API error 401: Unauthorized"
    );
  });

  // ---- Credentials and headers ----

  it("includes credentials: include in the request", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, status: 200, json: {} }));

    await apiFetch("/api/v1/test");

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]).toMatchObject({ credentials: "include" });
  });

  it("includes Content-Type: application/json header by default", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, status: 200, json: {} }));

    await apiFetch("/api/v1/test");

    const callArgs = mockFetch.mock.calls[0];
    const headers: Headers = callArgs[1].headers;
    expect(headers).toBeInstanceOf(Headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  // ---- Custom headers merge ----

  it("merges custom headers from init with defaults", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, status: 200, json: {} }));

    await apiFetch("/api/v1/test", {
      headers: { Authorization: "Bearer token-123" },
    });

    // apiFetch builds a Headers object with defaults, then merges caller
    // headers on top, so both the default Content-Type and the custom
    // Authorization header should be present.
    const callArgs = mockFetch.mock.calls[0];
    const headers: Headers = callArgs[1].headers;
    expect(headers).toBeInstanceOf(Headers);
    expect(headers.get("Authorization")).toBe("Bearer token-123");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("allows overriding Content-Type header via init", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, status: 200, json: {} }));

    await apiFetch("/api/v1/upload", {
      headers: { "Content-Type": "multipart/form-data" },
    });

    const callArgs = mockFetch.mock.calls[0];
    const headers: Headers = callArgs[1].headers;
    expect(headers).toBeInstanceOf(Headers);
    expect(headers.get("Content-Type")).toBe("multipart/form-data");
  });

  // ---- Pass-through of init options ----

  it("passes through method from init options", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, status: 200, json: {} }));

    await apiFetch("/api/v1/service-accounts", { method: "POST" });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].method).toBe("POST");
  });

  it("passes through body from init options", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, status: 200, json: {} }));

    const body = JSON.stringify({ name: "test" });
    await apiFetch("/api/v1/service-accounts", { method: "POST", body });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].body).toBe(body);
  });

  it("passes through DELETE method from init options", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, status: 204 }));

    await apiFetch("/api/v1/service-accounts/sa-1", { method: "DELETE" });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].method).toBe("DELETE");
  });

  it("passes through PATCH method and body from init options", async () => {
    const body = JSON.stringify({ is_active: false });
    mockFetch.mockResolvedValue(mockResponse({ ok: true, status: 200, json: { is_active: false } }));

    await apiFetch("/api/v1/service-accounts/sa-1", {
      method: "PATCH",
      body,
    });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].method).toBe("PATCH");
    expect(callArgs[1].body).toBe(body);
  });

  // ---- Default behavior without init ----

  it("works correctly when no init argument is provided", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, status: 200, json: { items: [] } }));

    const result = await apiFetch<{ items: unknown[] }>("/api/v1/repos");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/repos",
      expect.objectContaining({
        credentials: "include",
      })
    );
    const callArgs = mockFetch.mock.calls[0];
    const headers: Headers = callArgs[1].headers;
    expect(headers).toBeInstanceOf(Headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(result).toEqual({ items: [] });
  });
});

describe("assertData", () => {
  it("throws with the context name when data is undefined", () => {
    expect(() => assertData(undefined, "ctx")).toThrow(
      /Empty response body for ctx/
    );
  });

  it("throws when data is null", () => {
    expect(() => assertData(null as unknown as undefined, "ctx")).toThrow(
      /Empty response body for ctx/
    );
  });

  it("throws when data is an empty string", () => {
    // An empty string body is almost always a misconfigured proxy or a 200
    // with no JSON; treat it as an empty response and refuse to silently
    // hand `""` to downstream consumers.
    expect(() => assertData("" as unknown as undefined, "ctx")).toThrow(
      /Empty response body for ctx/
    );
  });

  it("returns 0 unchanged (zero is valid data)", () => {
    expect(assertData(0, "ctx")).toBe(0);
  });

  it("returns false unchanged (boolean false is valid data)", () => {
    expect(assertData(false, "ctx")).toBe(false);
  });

  it("returns objects unchanged", () => {
    const obj = { foo: 1 };
    expect(assertData(obj, "ctx")).toBe(obj);
  });

  it("returns empty arrays unchanged", () => {
    const arr: number[] = [];
    expect(assertData(arr, "ctx")).toBe(arr);
  });
});
