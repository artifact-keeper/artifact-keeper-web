import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();
vi.mock("../fetch", async () => {
  const actual = await vi.importActual<typeof import("../fetch")>("../fetch");
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { proxyScansApi, normalizePathResponse } from "../proxy-scans";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("proxyScansApi.list", () => {
  it("GETs the repository-scoped endpoint", async () => {
    mockApiFetch.mockResolvedValue({ items: [], summary: {}, total: 0 });

    await proxyScansApi.list("npm-remote");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/npm-remote/security/proxy-scans",
    );
  });

  it("passes pagination through as query parameters", async () => {
    mockApiFetch.mockResolvedValue({ items: [], summary: {}, total: 0 });

    await proxyScansApi.list("npm-remote", { page: 3, per_page: 25 });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/npm-remote/security/proxy-scans?page=3&per_page=25",
    );
  });

  it("percent-encodes the repository key", async () => {
    mockApiFetch.mockResolvedValue({ items: [], summary: {}, total: 0 });

    await proxyScansApi.list("team/npm remote");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/team%2Fnpm%20remote/security/proxy-scans",
    );
  });
});

describe("proxyScansApi.getByPath", () => {
  it("encodes the cache path as a query parameter", async () => {
    mockApiFetch.mockResolvedValue({
      scan_on_proxy: true,
      proxy_scan_action: "fail_closed",
      entry: { path: "a/b.tgz", state: "clean" },
    });

    const result = await proxyScansApi.getByPath("npm-remote", "left-pad/-/a b.tgz");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/npm-remote/security/proxy-scans?path=left-pad%2F-%2Fa+b.tgz",
    );
    expect(result.entry?.state).toBe("clean");
    expect(result.scan_on_proxy).toBe(true);
  });

  it("propagates the error rather than reporting an absent verdict", async () => {
    // Swallowing a failure here would let the caller render "no findings".
    mockApiFetch.mockRejectedValue(new Error("API error 401: unauthorized"));

    await expect(proxyScansApi.getByPath("npm-remote", "a.tgz")).rejects.toThrow(
      /401/,
    );
  });
});

describe("normalizePathResponse", () => {
  it("accepts the inline-entry shape", () => {
    const result = normalizePathResponse({
      scan_on_proxy: true,
      proxy_scan_action: "fail_closed",
      entry: { path: "a.tgz", state: "vulnerable" },
    });
    expect(result.entry?.state).toBe("vulnerable");
    expect(result.proxy_scan_action).toBe("fail_closed");
  });

  it("accepts the list-envelope shape with a single item", () => {
    const result = normalizePathResponse({
      scan_on_proxy: false,
      proxy_scan_action: "fail_open",
      items: [{ path: "a.tgz", state: "clean" }],
      total: 1,
    });
    expect(result.entry?.path).toBe("a.tgz");
    expect(result.scan_on_proxy).toBe(false);
  });

  it("returns a null entry for an empty result instead of inventing one", () => {
    expect(normalizePathResponse({ items: [] }).entry).toBeNull();
    expect(normalizePathResponse({}).entry).toBeNull();
    expect(normalizePathResponse(null).entry).toBeNull();
  });

  it("defaults enforcement conservatively when the fields are missing", () => {
    // An older backend that does not carry enforcement context must not be
    // read as "this repository scans and blocks".
    const result = normalizePathResponse({ items: [] });
    expect(result.scan_on_proxy).toBe(false);
    expect(result.proxy_scan_action).toBe("fail_open");
  });
});
