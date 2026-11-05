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
import {
  MCP_SEARCH_MIN_CHARS,
  encodeServerName,
  isNotSupported,
  mcpApi,
  mcpProblemMessage,
  mcpWriteRefusal,
  toNamespaceGrant,
} from "../mcp";

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

const MGMT = "/api/v1/repositories/r/mcp";
const CAT_ITEM = { id: "c1", name: NAME, namespace: "com.acme", status: "pending", pins: [], ingested: [] };
const SNAP = { id: "s1", source: "remote_probe", observed: true, authState: "none", outcome: "ok" };

const READERS: { name: string; call: () => Promise<unknown>; url: string; ok: unknown; expected: unknown }[] = [
  {
    name: "listCatalog",
    call: () =>
      mcpApi.listCatalog("r", {
        search: "  acme ",
        status: "review",
        namespace: "com.acme",
        requested: true,
        queue: true,
        cursor: "c",
        limit: 5,
      }),
    url: `${MGMT}/catalog?search=acme&status=review&namespace=com.acme&requested=true&queue=true&cursor=c&limit=5`,
    ok: { items: [CAT_ITEM], nextCursor: "n", counts: { pending: 1 } },
    expected: { items: [CAT_ITEM], nextCursor: "n", counts: { pending: 1 } },
  },
  {
    name: "listCatalog (defaults)",
    call: () => mcpApi.listCatalog("r", { search: "   " }),
    url: `${MGMT}/catalog`,
    ok: {},
    expected: { items: [], nextCursor: null, counts: {} },
  },
  {
    name: "catalogItem",
    call: () => mcpApi.catalogItem("r", NAME),
    url: `${MGMT}/catalog/servers/com.acme/weather`,
    ok: CAT_ITEM,
    expected: CAT_ITEM,
  },
  {
    name: "syncState",
    call: () => mcpApi.syncState("r"),
    url: `${MGMT}/sync`,
    ok: { lastError: null, lastSummary: null },
    expected: { lastError: null, lastSummary: null },
  },
  {
    name: "listHolds",
    call: () => mcpApi.listHolds("r", { cursor: "c", limit: 10, search: " acme " }),
    url: "/mcp/r/v0.1/x/com.artifactkeeper/holds?cursor=c&limit=10&search=acme",
    ok: { holds: [{ status: 404 }], metadata: { count: 4, nextCursor: "n" } },
    expected: { holds: [{ status: 404 }], count: 4, nextCursor: "n" },
  },
  {
    name: "listHolds (short search, no metadata)",
    call: () => mcpApi.listHolds("r", { search: "ab" }),
    url: "/mcp/r/v0.1/x/com.artifactkeeper/holds",
    ok: { holds: [{ status: 404 }, { status: 503 }] },
    expected: { holds: [{ status: 404 }, { status: 503 }], count: 2, nextCursor: undefined },
  },
  {
    name: "listHolds (no holds field)",
    call: () => mcpApi.listHolds("r"),
    url: "/mcp/r/v0.1/x/com.artifactkeeper/holds",
    ok: { metadata: { nextCursor: "" } },
    expected: { holds: [], count: 0, nextCursor: undefined },
  },
  {
    name: "pendingSummary",
    call: () => mcpApi.pendingSummary(),
    url: "/api/v1/mcp/pending-summary",
    ok: { pending: 2, review: 1, drifted: 1, total: 4, repositories: [{ key: "a", pending: 2, review: 1, drifted: 1 }] },
    expected: { pending: 2, review: 1, drifted: 1, total: 4, repositories: [{ key: "a", pending: 2, review: 1, drifted: 1 }] },
  },
  {
    name: "pendingSummary (empty answer)",
    call: () => mcpApi.pendingSummary(),
    url: "/api/v1/mcp/pending-summary",
    ok: {},
    expected: { pending: 0, review: 0, drifted: 0, total: 0, repositories: [] },
  },
  {
    name: "capabilities",
    call: () => mcpApi.capabilities("r", NAME, "1.0.0", { snapshot: "s1", source: "remote_probe", limit: 3 }),
    url: `${REG}/versions/1.0.0/capabilities?snapshot=s1&source=remote_probe&limit=3`,
    ok: {
      repository: "r",
      server: NAME,
      version: "1.0.0",
      artifactId: "a1",
      current: SNAP,
      snapshots: [SNAP],
      introspection: { remoteProbe: "all", probeEnabled: true, sandbox: "on", sandboxEnabled: true, jobs: [] },
      notice: "n",
    },
    expected: {
      repository: "r",
      server: NAME,
      version: "1.0.0",
      artifactId: "a1",
      current: SNAP,
      snapshots: [SNAP],
      introspection: { remoteProbe: "all", probeEnabled: true, sandbox: "on", sandboxEnabled: true, jobs: [] },
      notice: "n",
    },
  },
  {
    name: "capabilities (defaults)",
    call: () => mcpApi.capabilities("r", NAME, "1.0.0"),
    url: `${REG}/versions/1.0.0/capabilities`,
    ok: { snapshots: "nope", introspection: { probeEnabled: "yes" } },
    expected: {
      current: null,
      snapshots: [],
      introspection: { remoteProbe: "off", sandbox: "off", probeEnabled: false, sandboxEnabled: false },
    },
  },
  {
    name: "capabilitiesDiff",
    call: () => mcpApi.capabilitiesDiff("r", NAME, "1.0.0", { from: "s0", to: "s1", source: "ci_reported" }),
    url: `${REG}/versions/1.0.0/capabilities/diff?from=s0&to=s1&source=ci_reported`,
    ok: { summary: { text: "Tools: +1 added" } },
    expected: { summary: { text: "Tools: +1 added" } },
  },
  {
    name: "health",
    call: () => mcpApi.health("r", NAME, "1.0.0"),
    url: `${ADMIN}/health`,
    ok: {
      name: NAME,
      version: "1.0.0",
      artifactId: "a1",
      status: "warning",
      packagePolicy: "own-repos",
      packages: [{ index: 0, package: "npm:x@1", high: 1 }],
      lint: { ran: true, block: 0, review: 1, warn: 2, findings: [{ id: "f1", rule: "r", action: "review" }] },
    },
    expected: {
      name: NAME,
      version: "1.0.0",
      artifactId: "a1",
      status: "warning",
      packagePolicy: "own-repos",
      packages: [{ index: 0, package: "npm:x@1", high: 1 }],
      lint: { ran: true, block: 0, review: 1, warn: 2, findings: [{ id: "f1", rule: "r", action: "review" }] },
    },
  },
  {
    name: "health (defaults)",
    call: () => mcpApi.health("r", NAME, "1.0.0"),
    url: `${ADMIN}/health`,
    ok: { status: "unknown", packages: null },
    expected: {
      status: "unknown",
      packages: [],
      lint: { ran: false, block: 0, review: 0, warn: 0, findings: [] },
    },
  },
];

describe("Phase 2/3 readers", () => {
  it.each(READERS)("$name reads the right URL", async ({ call, url, ok, expected }) => {
    mockApiFetch.mockResolvedValueOnce(ok);
    expect(await call()).toEqual(expected);
    expect(lastUrl()).toBe(url);
    expect(lastCall()[1]?.method).toBeUndefined();
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

const WRITERS: { name: string; call: () => Promise<unknown>; url: string; method: string; body?: unknown; normalised?: true }[] = [
  {
    name: "decide approve",
    call: () => mcpApi.decide("r", "id 1", "approve", "ok"),
    url: `${MGMT}/catalog/id%201/approve`,
    method: "POST",
    body: { reason: "ok" },
  },
  {
    name: "decide block (no reason)",
    call: () => mcpApi.decide("r", "i1", "block"),
    url: `${MGMT}/catalog/i1/block`,
    method: "POST",
    body: {},
  },
  {
    name: "decide reopen of a name@version row",
    call: () => mcpApi.decide("r", "i1@1.0.0", "reopen", "again"),
    url: `${MGMT}/catalog/i1%401.0.0/reopen`,
    method: "POST",
    body: { reason: "again" },
  },
  {
    name: "pinVersion",
    call: () => mcpApi.pinVersion("r", NAME, "1.2.0", "only this one"),
    url: `${MGMT}/catalog/pins`,
    method: "POST",
    body: { name: NAME, version: "1.2.0", reason: "only this one" },
  },
  {
    name: "pinVersion (no reason)",
    call: () => mcpApi.pinVersion("r", NAME, "1.2.0"),
    url: `${MGMT}/catalog/pins`,
    method: "POST",
    body: { name: NAME, version: "1.2.0" },
  },
  {
    name: "bulkApprovePattern",
    call: () => mcpApi.bulkApprovePattern("r", { pattern: "com.acme/*", includeReview: true, reason: "trusted" }),
    url: `${MGMT}/catalog/bulk-approve`,
    normalised: true,
    method: "POST",
    body: { pattern: "com.acme/*", includeReview: true, reason: "trusted" },
  },
  {
    name: "bulkApprovePattern (defaults)",
    call: () => mcpApi.bulkApprovePattern("r", { pattern: "com.acme/*" }),
    url: `${MGMT}/catalog/bulk-approve`,
    normalised: true,
    method: "POST",
    body: { pattern: "com.acme/*", includeReview: false },
  },
  {
    name: "bulkApprovePattern (dry run)",
    call: () => mcpApi.bulkApprovePattern("r", { pattern: "com.acme/*", dryRun: true }),
    url: `${MGMT}/catalog/bulk-approve`,
    normalised: true,
    method: "POST",
    body: { pattern: "com.acme/*", includeReview: false, dryRun: true },
  },
  {
    name: "bulkBlockPattern",
    call: () => mcpApi.bulkBlockPattern("r", { pattern: "*.evil/*", reason: "squatters", dryRun: true }),
    url: `${MGMT}/catalog/bulk-block`,
    normalised: true,
    method: "POST",
    body: { pattern: "*.evil/*", reason: "squatters", dryRun: true },
  },
  {
    name: "bulkBlockPattern (defaults)",
    call: () => mcpApi.bulkBlockPattern("r", { pattern: "*.evil/*" }),
    url: `${MGMT}/catalog/bulk-block`,
    normalised: true,
    method: "POST",
    body: { pattern: "*.evil/*" },
  },
  {
    name: "bulkDecide",
    call: () => mcpApi.bulkDecide("r", ["c1", "c2"], "block", "bad"),
    url: `${MGMT}/catalog/bulk-decide`,
    normalised: true,
    method: "POST",
    body: { ids: ["c1", "c2"], action: "block", reason: "bad" },
  },
  {
    name: "bulkDecide (no reason)",
    call: () => mcpApi.bulkDecide("r", ["c1"], "approve"),
    url: `${MGMT}/catalog/bulk-decide`,
    normalised: true,
    method: "POST",
    body: { ids: ["c1"], action: "approve" },
  },
  {
    name: "requestApproval",
    call: () => mcpApi.requestApproval("r", "c1", "we need it"),
    url: `${MGMT}/catalog/c1/request-approval`,
    method: "POST",
    body: { note: "we need it" },
  },
  {
    name: "requestApproval (no note)",
    call: () => mcpApi.requestApproval("r", "c1"),
    url: `${MGMT}/catalog/c1/request-approval`,
    method: "POST",
    body: {},
  },
  {
    name: "triggerSync",
    call: () => mcpApi.triggerSync("r"),
    url: `${MGMT}/sync`,
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
    name: "deleteVersion (with statusMessage)",
    call: () => mcpApi.deleteVersion("r", NAME, "1.0.0", "superseded"),
    url: `${REG}/versions/1.0.0`,
    method: "DELETE",
    body: { statusMessage: "superseded" },
  },
  {
    name: "deleteNamespaceGrant",
    call: () => mcpApi.deleteNamespaceGrant("g/1"),
    url: "/api/v1/permissions/g%2F1",
    method: "DELETE",
  },
];

describe("writers", () => {
  it.each(WRITERS)("$name sends $method to the right URL", async ({ call, url, method, body, ...w }) => {
    mockApiFetch.mockResolvedValueOnce("ok");
    const result = await call();
    // Bulk answers are normalised (covered under "bulk results").
    if (!("normalised" in w)) expect(result).toBe("ok");
    expect(lastUrl()).toBe(url);
    expect(lastCall()[1]?.method).toBe(method);
    expect(lastBody()).toEqual(body);
  });

  it.each(WRITERS)("$name does not swallow a 404", async ({ call }) => {
    reject(404);
    await expect(call()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("probe", () => {
  it("POSTs to the registry capabilities/probe route and answers the queued ids", async () => {
    mockApiFetch.mockResolvedValueOnce({ queued: ["j1", "j2"], jobs: [] });
    expect(await mcpApi.probe("r", NAME, "1.0.0")).toEqual({ queued: ["j1", "j2"] });
    expect(lastUrl()).toBe(`${REG}/versions/1.0.0/capabilities/probe`);
    expect(lastCall()[1]?.method).toBe("POST");
    expect(lastBody()).toBeUndefined();
  });

  it("defaults queued to [] and rethrows a refusal", async () => {
    mockApiFetch.mockResolvedValueOnce(undefined);
    expect(await mcpApi.probe("r", NAME, "1.0.0")).toEqual({ queued: [] });
    reject(409, JSON.stringify({ code: "mcp_introspection_disabled" }));
    await expect(mcpApi.probe("r", NAME, "1.0.0")).rejects.toMatchObject({ status: 409 });
  });
});

// ---------------------------------------------------------------------------
// Namespace grants over /api/v1/permissions
// ---------------------------------------------------------------------------

const RULE = {
  id: "p1",
  principal_type: "service_account",
  principal_id: "sa1",
  principal_name: "ci-bot",
  target_type: "repository",
  target_id: "repo-uuid",
  actions: ["read", "write"],
  conditions: { mcp_namespaces: ["io.github.{repository_owner}/*", "com.acme"] },
  created_at: "2026-11-01T00:00:00Z",
};
const GRANT = {
  id: "p1",
  repository_id: "repo-uuid",
  principal_type: "service_account",
  principal_id: "sa1",
  principal_name: "ci-bot",
  actions: ["read", "write"],
  namespaces: ["io.github.{repository_owner}/*", "com.acme"],
  created_at: "2026-11-01T00:00:00Z",
};

describe("bulk results", () => {
  it("normalises a pattern result, keeping dryRun and the full name list", async () => {
    mockApiFetch.mockResolvedValueOnce({ approved: 2, names: ["a/x", "a/y"], dryRun: true });
    expect(await mcpApi.bulkApprovePattern("r", { pattern: "a/*", dryRun: true })).toEqual({
      approved: 2,
      blocked: 0,
      names: ["a/x", "a/y"],
      skippedDenied: 0,
      skippedReview: 0,
      dryRun: true,
    });
    mockApiFetch.mockResolvedValueOnce(undefined);
    expect(await mcpApi.bulkBlockPattern("r", { pattern: "a/*" })).toMatchObject({ blocked: 0, names: [], dryRun: false });
  });

  it("normalises a bulk-decide answer of id lists", async () => {
    mockApiFetch.mockResolvedValueOnce({ decided: ["c1"], skippedDenied: ["c2"] });
    expect(await mcpApi.bulkDecide("r", ["c1", "c2", "c3"], "approve")).toEqual({
      action: "approve",
      decided: ["c1"],
      unchanged: [],
      skippedDenied: ["c2"],
      notFound: [],
    });
    mockApiFetch.mockResolvedValueOnce({ action: "block", decided: [], unchanged: ["c1"], skippedDenied: [], notFound: ["c9"] });
    expect(await mcpApi.bulkDecide("r", ["c1", "c9"], "block")).toMatchObject({ unchanged: ["c1"], notFound: ["c9"] });
  });
});

describe("toNamespaceGrant", () => {
  it("reads the claim issuer", () => {
    expect(
      toNamespaceGrant({
        ...RULE,
        conditions: { mcp_namespaces: ["io.github.{repository_owner}/*"], mcp_namespace_issuer: "https://token.actions.githubusercontent.com" },
      }),
    ).toMatchObject({ issuer: "https://token.actions.githubusercontent.com" });
  });

  it("maps a rule carrying conditions.mcp_namespaces", () => {
    expect(toNamespaceGrant(RULE)).toEqual(GRANT);
  });

  it("drops non-string patterns and defaults optional fields", () => {
    const g = toNamespaceGrant({
      ...RULE,
      principal_name: null,
      created_at: undefined,
      conditions: { mcp_namespaces: ["com.acme", 3, null] },
    });
    expect(g).toMatchObject({ namespaces: ["com.acme"], principal_name: undefined, created_at: undefined });
  });

  it.each([
    ["no conditions", { ...RULE, conditions: undefined }],
    ["null conditions", { ...RULE, conditions: null }],
    ["an empty list", { ...RULE, conditions: { mcp_namespaces: [] } }],
    ["a non-list", { ...RULE, conditions: { mcp_namespaces: "com.acme" } }],
  ])("is null for %s", (_label, rule) => {
    expect(toNamespaceGrant(rule)).toBeNull();
  });
});

describe("listNamespaceGrants", () => {
  it("reads the repository's permission rules and keeps the namespace ones", async () => {
    mockApiFetch.mockResolvedValueOnce({
      items: [RULE, { ...RULE, id: "p2", conditions: null }],
      pagination: { total_pages: 1 },
    });
    expect(await mcpApi.listNamespaceGrants("repo-uuid")).toEqual([GRANT]);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(lastUrl()).toBe("/api/v1/permissions?target_type=repository&target_id=repo-uuid&page=1&per_page=100");
  });

  it("follows the pages", async () => {
    mockApiFetch
      .mockResolvedValueOnce({ items: [RULE], pagination: { total_pages: 2 } })
      .mockResolvedValueOnce({ items: [{ ...RULE, id: "p3" }], pagination: { total_pages: 2 } });
    const grants = await mcpApi.listNamespaceGrants("repo-uuid");
    expect(grants.map((g) => g.id)).toEqual(["p1", "p3"]);
    expect(lastUrl()).toContain("page=2");
  });

  it("stops after the page limit", async () => {
    mockApiFetch.mockResolvedValue({ items: [], pagination: { total_pages: 999 } });
    await mcpApi.listNamespaceGrants("repo-uuid");
    expect(mockApiFetch).toHaveBeenCalledTimes(20);
  });

  it("treats an empty answer as no grants and rethrows errors", async () => {
    mockApiFetch.mockResolvedValueOnce(null);
    expect(await mcpApi.listNamespaceGrants("repo-uuid")).toEqual([]);
    reject(403);
    await expect(mcpApi.listNamespaceGrants("repo-uuid")).rejects.toMatchObject({ status: 403 });
  });
});

describe("createNamespaceGrant", () => {
  const BODY = {
    principal_type: "service_account" as const,
    principal_id: "sa1",
    actions: ["read", "write"],
    namespaces: ["io.github.{repository_owner}/*", "com.acme"],
  };

  it("POSTs a repository permission rule with conditions.mcp_namespaces", async () => {
    mockApiFetch.mockResolvedValueOnce(RULE);
    expect(await mcpApi.createNamespaceGrant("repo-uuid", BODY)).toEqual(GRANT);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(lastUrl()).toBe("/api/v1/permissions");
    expect(lastCall()[1]?.method).toBe("POST");
    expect(lastBody()).toEqual({
      principal_type: "service_account",
      principal_id: "sa1",
      target_type: "repository",
      target_id: "repo-uuid",
      actions: ["read", "write"],
      conditions: { mcp_namespaces: ["io.github.{repository_owner}/*", "com.acme"] },
    });
  });

  it("sends mcp_namespace_issuer when given", async () => {
    mockApiFetch.mockResolvedValueOnce(RULE);
    await mcpApi.createNamespaceGrant("repo-uuid", { ...BODY, issuer: "https://token.actions.githubusercontent.com" });
    expect(lastBody()).toMatchObject({
      conditions: {
        mcp_namespaces: ["io.github.{repository_owner}/*", "com.acme"],
        mcp_namespace_issuer: "https://token.actions.githubusercontent.com",
      },
    });
  });

  it("deletes a rule stored without the condition and throws", async () => {
    mockApiFetch.mockResolvedValueOnce({ ...RULE, id: "p 9", conditions: null }).mockResolvedValueOnce(undefined);
    await expect(mcpApi.createNamespaceGrant("repo-uuid", BODY)).rejects.toThrow(
      "This server does not support MCP namespace grants; nothing was granted",
    );
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(lastUrl()).toBe("/api/v1/permissions/p%209");
    expect(lastCall()[1]?.method).toBe("DELETE");
  });

  it("still throws the unsupported error when the clean-up delete fails", async () => {
    mockApiFetch.mockResolvedValueOnce({ ...RULE, conditions: {} }).mockRejectedValueOnce(new ApiError(500, ""));
    await expect(mcpApi.createNamespaceGrant("repo-uuid", BODY)).rejects.toThrow("does not support MCP namespace");
  });

  it("throws without a delete when the answer has no id", async () => {
    mockApiFetch.mockResolvedValueOnce(undefined);
    await expect(mcpApi.createNamespaceGrant("repo-uuid", BODY)).rejects.toThrow("does not support MCP namespace");
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it("rethrows a refusal of the create", async () => {
    reject(400, JSON.stringify({ code: "bad_pattern" }));
    await expect(mcpApi.createNamespaceGrant("repo-uuid", BODY)).rejects.toMatchObject({ status: 400 });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
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

describe("mcpWriteRefusal", () => {
  it("names the missing namespace grant on 403 mcp_namespace_not_granted", () => {
    const body = JSON.stringify({ status: 403, error: "mcp_namespace_not_granted", detail: "no grant for 'com.x'" });
    const msg = mcpWriteRefusal(new ApiError(403, body));
    expect(msg).toMatch(/requires a namespace grant/);
    expect(msg).toContain("(no grant for 'com.x')");
    expect(mcpWriteRefusal(new ApiError(403, JSON.stringify({ error: "mcp_namespace_not_granted" })))).not.toContain("(");
  });

  it("reads any other 403 as missing write and 401 as a rejected sign-in", () => {
    expect(mcpWriteRefusal(new ApiError(403, "not json"))).toMatch(/need write access/);
    expect(mcpWriteRefusal(new ApiError(401, ""))).toMatch(/Sign in again/);
  });

  it("leaves every other answer to mcpProblemMessage", () => {
    expect(mcpWriteRefusal(new ApiError(422, "{}"))).toBeNull();
    expect(mcpWriteRefusal(new Error("x"))).toBeNull();
  });
});
