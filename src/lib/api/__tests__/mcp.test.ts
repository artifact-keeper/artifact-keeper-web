import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();
// Real ApiError so the `instanceof` checks are the production ones; only the
// transport is stubbed.
vi.mock("../fetch", async () => {
  const actual = await vi.importActual<typeof import("../fetch")>("../fetch");
  return {
    ApiError: actual.ApiError,
    apiFetch: (...a: unknown[]) => mockApiFetch(...a),
  };
});
vi.mock("@/lib/sdk-client", () => ({}));

const mockArtifactsGet = vi.fn();
vi.mock("@/lib/api/artifacts", () => ({
  artifactsApi: { get: (...a: unknown[]) => mockArtifactsGet(...a) },
}));

import { ApiError } from "../fetch";
import { MCP_SEARCH_MIN_CHARS, encodeServerName, isNotSupported, mcpApi, mcpProblemMessage } from "../mcp";

const NAME = "com.acme/weather";
const SERVER = { name: NAME, description: "Weather", version: "1.0.0" };
const ENTRY = { server: SERVER, _meta: {} };

const ADMIN = "/api/v1/repositories/r/mcp/servers/com.acme/weather/versions/1.0.0";
const REG = "/mcp/r/v0.1/servers/com.acme/weather";

function lastCall(): [string, RequestInit | undefined] {
  return mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1] as [string, RequestInit | undefined];
}

function lastUrl(): string {
  return lastCall()[0];
}

function lastBody(): unknown {
  const body = lastCall()[1]?.body;
  return typeof body === "string" ? JSON.parse(body) : undefined;
}

function reject(status: number, body = "") {
  mockApiFetch.mockRejectedValueOnce(new ApiError(status, body));
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockArtifactsGet.mockReset();
});

describe("encodeServerName", () => {
  it("keeps the slash literal and escapes each segment", () => {
    expect(encodeServerName(NAME)).toBe(NAME);
    expect(encodeServerName("com.acme/a b?")).toBe("com.acme/a%20b%3F");
  });
});

describe("listServers", () => {
  it("builds the URL with every param and encodes the repo key", async () => {
    mockApiFetch.mockResolvedValueOnce({ servers: [ENTRY], metadata: { nextCursor: "n", count: 1 } });
    const page = await mcpApi.listServers("my repo", {
      cursor: "c1",
      limit: 20,
      search: "  weather ",
      version: "latest",
      include_deleted: true,
      updated_since: "2026-01-01T00:00:00Z",
    });
    expect(lastUrl()).toBe(
      "/mcp/my%20repo/v0.1/servers?cursor=c1&limit=20&search=weather&version=latest&include_deleted=true&updated_since=2026-01-01T00%3A00%3A00Z",
    );
    expect(page).toEqual({ servers: [ENTRY], nextCursor: "n", count: 1, dropped: 0 });
  });

  it("sends no query string without params", async () => {
    mockApiFetch.mockResolvedValueOnce({ servers: [] });
    await mcpApi.listServers("r");
    expect(lastUrl()).toBe("/mcp/r/v0.1/servers");
  });

  it("omits searches shorter than the minimum once trimmed", async () => {
    expect(MCP_SEARCH_MIN_CHARS).toBe(3);
    mockApiFetch.mockResolvedValue({ servers: [] });
    await mcpApi.listServers("r", { search: " ab  " });
    expect(lastUrl()).toBe("/mcp/r/v0.1/servers");
    await mcpApi.listServers("r", { search: "abc" });
    expect(lastUrl()).toBe("/mcp/r/v0.1/servers?search=abc");
  });
});

describe("listVersions", () => {
  it("hits the versions route with a literal slash", async () => {
    mockApiFetch.mockResolvedValueOnce({ servers: [ENTRY, { bad: true }] });
    expect(await mcpApi.listVersions("r", NAME)).toEqual([ENTRY]);
    expect(lastUrl()).toBe(`${REG}/versions`);
  });

  it("maps 404 to an empty list", async () => {
    reject(404);
    expect(await mcpApi.listVersions("r", NAME)).toEqual([]);
  });

  it("rethrows other errors", async () => {
    reject(500);
    await expect(mcpApi.listVersions("r", NAME)).rejects.toMatchObject({ status: 500 });
  });
});

describe("getVersion", () => {
  const problem = { status: 404, error: "mcp_backing_artifact_blocked", hold: "backing" };

  it("classifies a parsable 200 as served", async () => {
    mockApiFetch.mockResolvedValueOnce(ENTRY);
    expect(await mcpApi.getVersion("r", NAME, "1.0.0")).toEqual({ kind: "served", entry: ENTRY });
    expect(lastUrl()).toBe(`${REG}/versions/1.0.0`);
  });

  it("adds include_deleted and encodes the version", async () => {
    mockApiFetch.mockResolvedValueOnce(ENTRY);
    await mcpApi.getVersion("r", NAME, "1.0.0+b/1", { includeDeleted: true });
    expect(lastUrl()).toBe(`${REG}/versions/1.0.0%2Bb%2F1?include_deleted=true`);
  });

  it("classifies an unparsable 200 as hidden", async () => {
    mockApiFetch.mockResolvedValueOnce({ nope: 1 });
    expect(await mcpApi.getVersion("r", NAME, "1.0.0")).toEqual({ kind: "hidden" });
  });

  it("classifies a reason-gated 404 as held", async () => {
    reject(404, JSON.stringify(problem));
    expect(await mcpApi.getVersion("r", NAME, "1.0.0")).toEqual({ kind: "held", problem });
  });

  it.each([
    ["empty", ""],
    ["plain text", "Not Found"],
    ["problem without error", JSON.stringify({ status: 404, title: "Not Found" })],
  ])("classifies a %s 404 as hidden", async (_label, body) => {
    reject(404, body);
    expect(await mcpApi.getVersion("r", NAME, "1.0.0")).toEqual({ kind: "hidden" });
  });

  it("classifies 503 as unavailable, with the problem when it parses", async () => {
    reject(503, JSON.stringify({ status: 503, detail: "resolving" }));
    expect(await mcpApi.getVersion("r", NAME, "1.0.0")).toEqual({
      kind: "unavailable",
      problem: { status: 503, detail: "resolving" },
    });
    reject(503, "<html>");
    expect(await mcpApi.getVersion("r", NAME, "1.0.0")).toEqual({ kind: "unavailable", problem: undefined });
  });

  it("rethrows other statuses and non-ApiErrors", async () => {
    reject(500, "{}");
    await expect(mcpApi.getVersion("r", NAME, "1.0.0")).rejects.toMatchObject({ status: 500 });
    mockApiFetch.mockRejectedValueOnce(new TypeError("network"));
    await expect(mcpApi.getVersion("r", NAME, "1.0.0")).rejects.toThrow("network");
  });
});

describe("publish and status writes", () => {
  it("POSTs the document to /publish", async () => {
    mockApiFetch.mockResolvedValueOnce(ENTRY);
    expect(await mcpApi.publish("r", SERVER)).toEqual(ENTRY);
    expect(lastUrl()).toBe("/mcp/r/v0.1/publish");
    expect(lastCall()[1]?.method).toBe("POST");
    expect(lastBody()).toEqual(SERVER);
  });

  it("throws on an unrecognised publish answer", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true });
    await expect(mcpApi.publish("r", SERVER)).rejects.toThrow("Publish answered with an unrecognised document");
  });

  it("PATCHes a version status with and without a message", async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await mcpApi.setVersionStatus("r", NAME, "1.0.0", "deprecated", "use 2.x");
    expect(lastUrl()).toBe(`${REG}/versions/1.0.0/status`);
    expect(lastCall()[1]?.method).toBe("PATCH");
    expect(lastBody()).toEqual({ status: "deprecated", statusMessage: "use 2.x" });
    await mcpApi.setVersionStatus("r", NAME, "1.0.0", "active");
    expect(lastBody()).toEqual({ status: "active" });
  });

  it("PATCHes a server status and defaults updatedCount", async () => {
    mockApiFetch.mockResolvedValueOnce({ updatedCount: 3 });
    expect(await mcpApi.setServerStatus("r", NAME, "deleted", "gone")).toEqual({ updatedCount: 3 });
    expect(lastUrl()).toBe(`${REG}/status`);
    expect(lastBody()).toEqual({ status: "deleted", statusMessage: "gone" });
    mockApiFetch.mockResolvedValueOnce(undefined);
    expect(await mcpApi.setServerStatus("r", NAME, "active")).toEqual({ updatedCount: 0 });
    expect(lastBody()).toEqual({ status: "active" });
  });
});

describe("getStoredMetadata", () => {
  const stored = { server: SERVER, registry: { status: "active" } };

  it("skips the artifact lookup when an id is given", async () => {
    mockApiFetch.mockResolvedValueOnce({ metadata: stored });
    const r = await mcpApi.getStoredMetadata("r", NAME, "1.0.0", "a/1");
    expect(mockArtifactsGet).not.toHaveBeenCalled();
    expect(lastUrl()).toBe("/api/v1/artifacts/a%2F1/metadata");
    expect(r?.artifactId).toBe("a/1");
    expect(r?.metadata.server.name).toBe(NAME);
  });

  it("looks the artifact up by path otherwise", async () => {
    mockArtifactsGet.mockResolvedValueOnce({ id: "a2" });
    mockApiFetch.mockResolvedValueOnce({ metadata: stored });
    const r = await mcpApi.getStoredMetadata("r", NAME, "1.0.0");
    expect(mockArtifactsGet).toHaveBeenCalledWith("r", "servers/com.acme/weather/1.0.0/server.json");
    expect(r?.artifactId).toBe("a2");
  });

  it("is null when the lookup fails", async () => {
    mockArtifactsGet.mockRejectedValueOnce(new Error("missing"));
    expect(await mcpApi.getStoredMetadata("r", NAME, "1.0.0")).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("is null when the metadata is 404 or unparsable", async () => {
    reject(404);
    expect(await mcpApi.getStoredMetadata("r", NAME, "1.0.0", "a1")).toBeNull();
    mockApiFetch.mockResolvedValueOnce({ metadata: { server: { name: "" } } });
    expect(await mcpApi.getStoredMetadata("r", NAME, "1.0.0", "a1")).toBeNull();
  });

  it("rethrows a server error on the metadata read", async () => {
    reject(500);
    await expect(mcpApi.getStoredMetadata("r", NAME, "1.0.0", "a1")).rejects.toMatchObject({ status: 500 });
  });
});

// ---------------------------------------------------------------------------
// Phase 2/3 readers: 404/405/501 -> null, anything else rethrown
// ---------------------------------------------------------------------------

const READERS: { name: string; call: () => Promise<unknown>; url: string; ok: unknown; expected: unknown }[] = [
  {
    name: "listReviews (array)",
    call: () => mcpApi.listReviews("r", { status: "pending", search: "acme" }),
    url: "/api/v1/repositories/r/mcp/reviews?status=pending&search=acme",
    ok: [{ id: "1" }],
    expected: [{ id: "1" }],
  },
  {
    name: "listReviews ({items})",
    call: () => mcpApi.listReviews("r"),
    url: "/api/v1/repositories/r/mcp/reviews",
    ok: { items: [{ id: "2" }] },
    expected: [{ id: "2" }],
  },
  {
    name: "listReviews (empty object)",
    call: () => mcpApi.listReviews("r"),
    url: "/api/v1/repositories/r/mcp/reviews",
    ok: {},
    expected: [],
  },
  {
    name: "upstreamCatalog",
    call: () => mcpApi.upstreamCatalog("r", { search: "x", cursor: "c", limit: 5 }),
    url: "/api/v1/repositories/r/mcp/upstream?search=x&cursor=c&limit=5",
    ok: { servers: [] },
    expected: { servers: [] },
  },
  {
    name: "listHolds",
    call: () => mcpApi.listHolds("r", { name: NAME, version: "1.0.0" }),
    url: "/mcp/r/v0.1/x/com.artifactkeeper/holds?name=com.acme%2Fweather&version=1.0.0",
    ok: { holds: [{ status: 404 }] },
    expected: [{ status: 404 }],
  },
  {
    name: "listHolds (no holds field)",
    call: () => mcpApi.listHolds("r"),
    url: "/mcp/r/v0.1/x/com.artifactkeeper/holds",
    ok: {},
    expected: [],
  },
  {
    name: "pendingReviewCount",
    call: () => mcpApi.pendingReviewCount(),
    url: "/api/v1/admin/holds/summary",
    ok: { mcp_pending_reviews: 7 },
    expected: 7,
  },
  {
    name: "pendingReviewCount (no number)",
    call: () => mcpApi.pendingReviewCount(),
    url: "/api/v1/admin/holds/summary",
    ok: { mcp_pending_reviews: "7" },
    expected: null,
  },
  {
    name: "capabilities",
    call: () => mcpApi.capabilities("r", NAME, "1.0.0"),
    url: `${ADMIN}/capabilities`,
    ok: { probe_available: true, snapshots: [{ source: "remote_probe" }] },
    expected: { probe_available: true, snapshots: [{ source: "remote_probe" }] },
  },
  {
    name: "capabilities (snapshots default)",
    call: () => mcpApi.capabilities("r", NAME, "1.0.0"),
    url: `${ADMIN}/capabilities`,
    ok: { probe_available: false },
    expected: { probe_available: false, snapshots: [] },
  },
  {
    name: "health",
    call: () => mcpApi.health("r", NAME, "1.0.0"),
    url: `${ADMIN}/health`,
    ok: { state: "healthy", packages: [] },
    expected: { state: "healthy", packages: [] },
  },
  {
    name: "bundle",
    call: () => mcpApi.bundle("r", NAME, "1.0.0"),
    url: `${ADMIN}/bundle`,
    ok: { name: NAME, version: "1.0.0", sha256: "a" },
    expected: { name: NAME, version: "1.0.0", sha256: "a" },
  },
  {
    name: "listNamespaceGrants (array)",
    call: () => mcpApi.listNamespaceGrants("r"),
    url: "/api/v1/repositories/r/mcp/namespace-grants",
    ok: [{ id: "g1" }],
    expected: [{ id: "g1" }],
  },
  {
    name: "listNamespaceGrants ({items})",
    call: () => mcpApi.listNamespaceGrants("r"),
    url: "/api/v1/repositories/r/mcp/namespace-grants",
    ok: { items: [{ id: "g2" }] },
    expected: [{ id: "g2" }],
  },
  {
    name: "listNamespaceGrants (null)",
    call: () => mcpApi.listNamespaceGrants("r"),
    url: "/api/v1/repositories/r/mcp/namespace-grants",
    ok: null,
    expected: [],
  },
];

describe("Phase 2/3 readers", () => {
  it.each(READERS)("$name reads the right URL", async ({ call, url, ok, expected }) => {
    mockApiFetch.mockResolvedValueOnce(ok);
    expect(await call()).toEqual(expected);
    expect(lastUrl()).toBe(url);
  });

  const unsupported = READERS.flatMap((r) => [404, 405, 501].map((status) => ({ ...r, status })));
  it.each(unsupported)("$name maps $status to null", async ({ call, status }) => {
    reject(status);
    expect(await call()).toBeNull();
  });

  it.each(READERS)("$name rethrows a 500", async ({ call }) => {
    reject(500);
    await expect(call()).rejects.toMatchObject({ status: 500 });
  });
});

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

const WRITERS: { name: string; call: () => Promise<unknown>; url: string; method: string; body?: unknown }[] = [
  {
    name: "approveReview",
    call: () => mcpApi.approveReview("id 1", { reason: "ok", version: "1.0.0" }),
    url: "/api/v1/curation/packages/id%201/approve",
    method: "POST",
    body: { reason: "ok", version: "1.0.0" },
  },
  {
    name: "approveReview (default body)",
    call: () => mcpApi.approveReview("i1"),
    url: "/api/v1/curation/packages/i1/approve",
    method: "POST",
    body: {},
  },
  {
    name: "blockReview",
    call: () => mcpApi.blockReview("i1", { reason: "bad" }),
    url: "/api/v1/curation/packages/i1/block",
    method: "POST",
    body: { reason: "bad" },
  },
  {
    name: "blockReview (default body)",
    call: () => mcpApi.blockReview("i1"),
    url: "/api/v1/curation/packages/i1/block",
    method: "POST",
    body: {},
  },
  {
    name: "bulkApprove",
    call: () => mcpApi.bulkApprove(["a", "b"], "batch"),
    url: "/api/v1/curation/packages/bulk-approve",
    method: "POST",
    body: { ids: ["a", "b"], reason: "batch" },
  },
  {
    name: "bulkBlock",
    call: () => mcpApi.bulkBlock(["a"], "nope"),
    url: "/api/v1/curation/packages/bulk-block",
    method: "POST",
    body: { ids: ["a"], reason: "nope" },
  },
  {
    name: "bulkApproveNamespace",
    call: () => mcpApi.bulkApproveNamespace("r", "com.acme/*", "trusted"),
    url: "/api/v1/repositories/r/mcp/reviews/bulk-approve-namespace",
    method: "POST",
    body: { namespace_glob: "com.acme/*", reason: "trusted" },
  },
  {
    name: "requestApproval",
    call: () => mcpApi.requestApproval("r", NAME),
    url: "/api/v1/repositories/r/mcp/upstream/request-approval",
    method: "POST",
    body: { name: NAME },
  },
  {
    name: "probe",
    call: () => mcpApi.probe("r", NAME, "1.0.0"),
    url: `${ADMIN}/capabilities/probe`,
    method: "POST",
  },
  {
    name: "editVersion",
    call: () => mcpApi.editVersion("r", NAME, "1.0.0", SERVER),
    url: `${REG}/versions/1.0.0`,
    method: "PUT",
    body: SERVER,
  },
  {
    name: "deleteVersion",
    call: () => mcpApi.deleteVersion("r", NAME, "1.0.0"),
    url: `${REG}/versions/1.0.0`,
    method: "DELETE",
  },
  {
    name: "createNamespaceGrant",
    call: () =>
      mcpApi.createNamespaceGrant("r", {
        principal_type: "group",
        principal_id: "g1",
        actions: ["write"],
        namespaces: ["com.acme"],
      }),
    url: "/api/v1/repositories/r/mcp/namespace-grants",
    method: "POST",
    body: { principal_type: "group", principal_id: "g1", actions: ["write"], namespaces: ["com.acme"] },
  },
  {
    name: "deleteNamespaceGrant",
    call: () => mcpApi.deleteNamespaceGrant("r", "g/1"),
    url: "/api/v1/repositories/r/mcp/namespace-grants/g%2F1",
    method: "DELETE",
  },
];

describe("writers", () => {
  it.each(WRITERS)("$name sends $method to the right URL", async ({ call, url, method, body }) => {
    mockApiFetch.mockResolvedValueOnce("ok");
    expect(await call()).toBe("ok");
    expect(lastUrl()).toBe(url);
    expect(lastCall()[1]?.method).toBe(method);
    expect(lastBody()).toEqual(body);
  });

  it.each(WRITERS)("$name does not swallow a 404", async ({ call }) => {
    reject(404);
    await expect(call()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("isNotSupported", () => {
  it.each([
    [new ApiError(404, ""), true],
    [new ApiError(405, ""), true],
    [new ApiError(501, ""), true],
    [new ApiError(400, ""), false],
    [new ApiError(500, ""), false],
    [new Error("404"), false],
    [null, false],
  ])("%s -> %s", (err, expected) => {
    expect(isNotSupported(err)).toBe(expected);
  });
});

describe("mcpProblemMessage", () => {
  it.each([
    ["detail wins", JSON.stringify({ title: "Bad", detail: "name not admitted" }), "name not admitted"],
    ["falls back to title", JSON.stringify({ title: "Bad Request" }), "Bad Request"],
    ["neither", JSON.stringify({ status: 400 }), null],
    ["JSON non-object", JSON.stringify("text"), null],
    ["JSON null", "null", null],
    ["non-JSON body", "<html>oops</html>", null],
  ])("%s", (_label, body, expected) => {
    expect(mcpProblemMessage(new ApiError(400, body))).toBe(expected);
  });

  it("is null for a non-ApiError", () => {
    expect(mcpProblemMessage(new Error("x"))).toBeNull();
    expect(mcpProblemMessage("x")).toBeNull();
  });
});
