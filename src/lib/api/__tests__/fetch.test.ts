import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({
  getActiveInstanceBaseUrl: () => "http://localhost:8080",
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { apiFetch } from "../fetch";

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
    text = "",
    textRejects = false,
  } = options;

  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(json),
    text: textRejects
      ? vi.fn().mockRejectedValue(new Error("body read failed"))
      : vi.fn().mockResolvedValue(text),
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
    expect(callArgs[1].headers).toMatchObject({
      "Content-Type": "application/json",
    });
  });

  // ---- Custom headers merge ----

  it("custom headers from init override the merged headers object via spread", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, status: 200, json: {} }));

    await apiFetch("/api/v1/test", {
      headers: { Authorization: "Bearer token-123" },
    });

    // Because apiFetch spreads ...init after building the headers object,
    // the init.headers replaces the merged headers entirely.
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers).toMatchObject({
      Authorization: "Bearer token-123",
    });
  });

  it("allows overriding Content-Type header via init spread", async () => {
    mockFetch.mockResolvedValue(mockResponse({ ok: true, status: 200, json: {} }));

    await apiFetch("/api/v1/upload", {
      headers: { "Content-Type": "multipart/form-data" },
    });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers).toMatchObject({
      "Content-Type": "multipart/form-data",
    });
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
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(result).toEqual({ items: [] });
  });
});
