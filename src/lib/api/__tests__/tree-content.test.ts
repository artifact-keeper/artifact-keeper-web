import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock sdk-client (side-effect import used by tree.ts)
vi.mock("@/lib/sdk-client", () => ({}));

// Mock the SDK getTree function (used by getChildren, not under test here)
vi.mock("@artifact-keeper/sdk", () => ({
  getTree: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { treeApi } from "../tree";

function createFetchResponse(options: {
  ok?: boolean;
  status?: number;
  contentType?: string;
  contentSize?: string;
  body?: ArrayBuffer;
}): Response {
  const {
    ok = true,
    status = 200,
    contentType = "text/plain",
    contentSize = "42",
    body = new ArrayBuffer(8),
  } = options;

  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  if (contentSize) headers.set("x-content-size", contentSize);

  return {
    ok,
    status,
    headers,
    arrayBuffer: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("treeApi.getContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Successful fetch ----

  it("calls fetch with the correct URL built from repository_key and path", async () => {
    mockFetch.mockResolvedValue(createFetchResponse({}));

    await treeApi.getContent({
      repository_key: "my-repo",
      path: "src/main.rs",
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/api/v1/tree/content?");
    const params = new URLSearchParams(calledUrl.split("?")[1]);
    expect(params.get("repository_key")).toBe("my-repo");
    expect(params.get("path")).toBe("src/main.rs");
  });

  it("uses credentials: include in the request", async () => {
    mockFetch.mockResolvedValue(createFetchResponse({}));

    await treeApi.getContent({
      repository_key: "my-repo",
      path: "README.md",
    });

    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs).toMatchObject({ credentials: "include" });
  });

  it("returns data, contentType, and totalSize on success", async () => {
    const bodyBuffer = new ArrayBuffer(16);
    mockFetch.mockResolvedValue(
      createFetchResponse({
        contentType: "application/json",
        contentSize: "1024",
        body: bodyBuffer,
      })
    );

    const result = await treeApi.getContent({
      repository_key: "my-repo",
      path: "package.json",
    });

    expect(result.data).toBe(bodyBuffer);
    expect(result.contentType).toBe("application/json");
    expect(result.totalSize).toBe(1024);
  });

  it("reads content-type header correctly", async () => {
    mockFetch.mockResolvedValue(
      createFetchResponse({ contentType: "image/png" })
    );

    const result = await treeApi.getContent({
      repository_key: "my-repo",
      path: "logo.png",
    });

    expect(result.contentType).toBe("image/png");
  });

  it("reads x-content-size header and parses it as a number", async () => {
    mockFetch.mockResolvedValue(
      createFetchResponse({ contentSize: "98765" })
    );

    const result = await treeApi.getContent({
      repository_key: "my-repo",
      path: "large-file.bin",
    });

    expect(result.totalSize).toBe(98765);
  });

  it("defaults contentType to application/octet-stream when header is missing", async () => {
    const headers = new Headers();
    headers.set("x-content-size", "100");
    // No content-type header

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    } as unknown as Response);

    const result = await treeApi.getContent({
      repository_key: "my-repo",
      path: "unknown-file",
    });

    expect(result.contentType).toBe("application/octet-stream");
  });

  it("defaults totalSize to 0 when x-content-size header is missing", async () => {
    const headers = new Headers();
    headers.set("content-type", "text/plain");
    // No x-content-size header

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    } as unknown as Response);

    const result = await treeApi.getContent({
      repository_key: "my-repo",
      path: "some-file.txt",
    });

    expect(result.totalSize).toBe(0);
  });

  // ---- max_bytes parameter ----

  it("includes max_bytes in query string when provided", async () => {
    mockFetch.mockResolvedValue(createFetchResponse({}));

    await treeApi.getContent({
      repository_key: "my-repo",
      path: "big-file.tar.gz",
      max_bytes: 512000,
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    const params = new URLSearchParams(calledUrl.split("?")[1]);
    expect(params.get("max_bytes")).toBe("512000");
  });

  it("omits max_bytes from query string when not provided", async () => {
    mockFetch.mockResolvedValue(createFetchResponse({}));

    await treeApi.getContent({
      repository_key: "my-repo",
      path: "small-file.txt",
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    const params = new URLSearchParams(calledUrl.split("?")[1]);
    expect(params.has("max_bytes")).toBe(false);
  });

  // ---- Error handling ----

  it("throws when response is not ok (404)", async () => {
    mockFetch.mockResolvedValue(
      createFetchResponse({ ok: false, status: 404 })
    );

    await expect(
      treeApi.getContent({
        repository_key: "my-repo",
        path: "nonexistent.txt",
      })
    ).rejects.toThrow("Failed to fetch content: 404");
  });

  it("throws when response is not ok (500)", async () => {
    mockFetch.mockResolvedValue(
      createFetchResponse({ ok: false, status: 500 })
    );

    await expect(
      treeApi.getContent({
        repository_key: "my-repo",
        path: "server-error.txt",
      })
    ).rejects.toThrow("Failed to fetch content: 500");
  });

  it("throws when response is not ok (403)", async () => {
    mockFetch.mockResolvedValue(
      createFetchResponse({ ok: false, status: 403 })
    );

    await expect(
      treeApi.getContent({
        repository_key: "private-repo",
        path: "secret.txt",
      })
    ).rejects.toThrow("Failed to fetch content: 403");
  });
});
