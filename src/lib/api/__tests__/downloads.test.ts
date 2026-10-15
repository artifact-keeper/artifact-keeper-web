import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockApiFetch = vi.fn();

vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const REPO_ID = "5a5a5a5a-3333-4f2b-9f7d-1c2d3e4f5a6b";

const ROW = {
  source: "hosted" as const,
  artifact_id: "0d9c34a6-9a2e-4f2b-9f7d-1c2d3e4f5a6b",
  repository_id: REPO_ID,
  path: "lodash/-/lodash-4.17.21.tgz",
  user_id: "0e8b23a5-1111-4f2b-9f7d-1c2d3e4f5a6b",
  username: "alice",
  ip_address: "10.1.2.3",
  user_agent: "npm/10.2.4 node/v20.11.0 linux x64",
  downloaded_at: "2026-07-10T12:00:00Z",
};

describe("downloadsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses a paginated download list response", async () => {
    mockApiFetch.mockResolvedValue({
      downloads: [ROW],
      total: 1,
      page: 1,
      per_page: 20,
    });
    const mod = await import("../downloads");
    const res = await mod.downloadsApi.list();
    expect(res.total).toBe(1);
    expect(res.downloads).toHaveLength(1);
    expect(res.downloads[0].username).toBe("alice");
    expect(res.downloads[0].ip_address).toBe("10.1.2.3");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/admin/downloads", {
      method: "GET",
    });
  });

  it("normalizes null/omitted optional fields", async () => {
    mockApiFetch.mockResolvedValue({
      downloads: [
        {
          ...ROW,
          user_id: null,
          username: null,
          ip_address: null,
          user_agent: undefined,
        },
      ],
      total: 1,
      page: 1,
      per_page: 20,
    });
    const mod = await import("../downloads");
    const res = await mod.downloadsApi.list();
    expect(res.downloads[0].user_id).toBeNull();
    expect(res.downloads[0].username).toBeNull();
    expect(res.downloads[0].ip_address).toBeNull();
    expect(res.downloads[0].user_agent).toBeNull();
  });

  it("throws on a response that does not match the expected shape", async () => {
    // e.g. an `items` key instead of the backend's `downloads` key
    mockApiFetch.mockResolvedValue({ items: [ROW], total: 1, page: 1, per_page: 20 });
    const mod = await import("../downloads");
    await expect(mod.downloadsApi.list()).rejects.toThrow(
      /did not match the expected shape/
    );
  });

  it("serializes filters and pagination into the query string", async () => {
    mockApiFetch.mockResolvedValue({ downloads: [], total: 0, page: 2, per_page: 50 });
    const mod = await import("../downloads");
    await mod.downloadsApi.list({
      artifact_id: ROW.artifact_id,
      user_id: ROW.user_id,
      ip: "10.1.2.3",
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-10T23:59:59.999Z",
      page: 2,
      per_page: 50,
    });
    const url = mockApiFetch.mock.calls[0][0] as string;
    const qs = new URLSearchParams(url.split("?")[1]);
    expect(url.startsWith("/api/v1/admin/downloads?")).toBe(true);
    expect(qs.get("artifact_id")).toBe(ROW.artifact_id);
    expect(qs.get("user_id")).toBe(ROW.user_id);
    expect(qs.get("ip")).toBe("10.1.2.3");
    expect(qs.get("from")).toBe("2026-07-01T00:00:00.000Z");
    expect(qs.get("to")).toBe("2026-07-10T23:59:59.999Z");
    expect(qs.get("page")).toBe("2");
    expect(qs.get("per_page")).toBe("50");
  });

  it("omits empty filters and trims whitespace", async () => {
    const mod = await import("../downloads");
    const qs = mod.buildDownloadsQueryString({
      ip: "  10.0.0.1  ",
      artifact_id: "",
      user_id: "   ",
    });
    expect(qs).toBe("?ip=10.0.0.1");
    expect(mod.buildDownloadsQueryString({})).toBe("");
  });

  it("clamps per_page to the backend max and floors page at 1", async () => {
    const mod = await import("../downloads");
    const qs = new URLSearchParams(
      mod.buildDownloadsQueryString({ page: 0, per_page: 999 }).slice(1)
    );
    expect(qs.get("page")).toBe("1");
    expect(qs.get("per_page")).toBe(String(mod.DOWNLOADS_MAX_PER_PAGE));
  });

  it("hits the by-ip endpoint with the IP path-encoded", async () => {
    mockApiFetch.mockResolvedValue({ downloads: [], total: 0, page: 1, per_page: 20 });
    const mod = await import("../downloads");
    await mod.downloadsApi.listByIp("2001:db8::1", { per_page: 10 });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url).toBe(
      "/api/v1/admin/downloads/by-ip/2001%3Adb8%3A%3A1?per_page=10"
    );
  });

  it("hits the by-user endpoint with the user id in the path", async () => {
    mockApiFetch.mockResolvedValue({ downloads: [], total: 0, page: 1, per_page: 20 });
    const mod = await import("../downloads");
    await mod.downloadsApi.listByUser(ROW.user_id);
    expect(mockApiFetch).toHaveBeenCalledWith(
      `/api/v1/admin/downloads/by-user/${ROW.user_id}`,
      { method: "GET" }
    );
  });
});

describe("proxy pull-through serves (#960, backend artifact-keeper#4539)", () => {
  beforeEach(() => vi.clearAllMocks());

  const PROXY_ROW = {
    source: "proxy",
    artifact_id: null,
    repository_id: REPO_ID,
    path: "left-pad/-/left-pad-1.3.0.tgz",
    user_id: null,
    username: null,
    ip_address: "10.1.2.3",
    user_agent: "npm/10.2.4",
    downloaded_at: "2026-10-14T12:00:00Z",
  };

  it("parses a proxy row with a null artifact_id instead of rejecting the page", async () => {
    mockApiFetch.mockResolvedValue({
      downloads: [ROW, PROXY_ROW],
      total: 2,
      page: 1,
      per_page: 20,
    });
    const mod = await import("../downloads");
    const res = await mod.downloadsApi.list();
    expect(res.downloads).toHaveLength(2);
    expect(res.downloads[0]).toMatchObject({
      source: "hosted",
      artifact_id: ROW.artifact_id,
      path: ROW.path,
    });
    expect(res.downloads[1]).toMatchObject({
      source: "proxy",
      artifact_id: null,
      repository_id: REPO_ID,
      path: "left-pad/-/left-pad-1.3.0.tgz",
    });
  });

  it("reads a pre-1.11.0 row (no source, repository or path) as hosted", async () => {
    const legacy = {
      artifact_id: ROW.artifact_id,
      user_id: null,
      username: null,
      ip_address: null,
      user_agent: null,
      downloaded_at: ROW.downloaded_at,
    };
    mockApiFetch.mockResolvedValue({ downloads: [legacy], total: 1, page: 1, per_page: 20 });
    const mod = await import("../downloads");
    const [row] = (await mod.downloadsApi.list()).downloads;
    expect(row.source).toBe("hosted");
    expect(row.repository_id).toBeNull();
    expect(row.path).toBeNull();
  });

  it("infers proxy from a missing artifact_id when source is absent or unknown", async () => {
    mockApiFetch.mockResolvedValue({
      downloads: [
        { ...PROXY_ROW, source: undefined },
        { ...PROXY_ROW, source: "mirror" },
        { ...ROW, source: "mirror" },
      ],
      total: 3,
      page: 1,
      per_page: 20,
    });
    const mod = await import("../downloads");
    const res = await mod.downloadsApi.list();
    expect(res.downloads.map((r) => r.source)).toEqual(["proxy", "proxy", "hosted"]);
  });

  it("serializes the source and repository filters", async () => {
    mockApiFetch.mockResolvedValue({ downloads: [], total: 0, page: 1, per_page: 20 });
    const mod = await import("../downloads");
    await mod.downloadsApi.list({ source: "proxy", repository_id: ` ${REPO_ID} ` });
    const url = mockApiFetch.mock.calls[0][0] as string;
    const qs = new URLSearchParams(url.split("?")[1]);
    expect(qs.get("source")).toBe("proxy");
    expect(qs.get("repository_id")).toBe(REPO_ID);
  });

  it("counts distinct proxied paths as distinct items in the grouped views", async () => {
    const mod = await import("../downloads");
    const proxy = (path: string) => ({
      ...ROW,
      source: "proxy" as const,
      artifact_id: null,
      path,
    });
    const rows = [
      ROW,
      proxy("left-pad/-/left-pad-1.3.0.tgz"),
      proxy("left-pad/-/left-pad-1.3.0.tgz"),
      proxy("is-odd/-/is-odd-3.0.1.tgz"),
    ];
    expect(mod.groupDownloadsByIp(rows)[0].unique_artifacts).toBe(3);
    expect(mod.groupDownloadsByUser(rows)[0].unique_artifacts).toBe(3);
    expect(mod.downloadItemKey(rows[1])).toBe(`${REPO_ID}:left-pad/-/left-pad-1.3.0.tgz`);
    expect(mod.downloadItemKey(ROW)).toBe(ROW.artifact_id);
  });
});

describe("subnetOf", () => {
  it("maps IPv4 addresses to their /24", async () => {
    const mod = await import("../downloads");
    expect(mod.subnetOf("10.1.2.3")).toBe("10.1.2.0/24");
    expect(mod.subnetOf("192.168.0.255")).toBe("192.168.0.0/24");
  });

  it("maps IPv6 addresses (including compressed forms) to their /64", async () => {
    const mod = await import("../downloads");
    expect(mod.subnetOf("2001:0db8:85a3:0001:0000:8a2e:0370:7334")).toBe(
      "2001:0db8:85a3:0001::/64"
    );
    expect(mod.subnetOf("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(mod.subnetOf("::1")).toBe("0:0:0:0::/64");
  });

  it("groups missing and malformed IPs under the unknown bucket", async () => {
    const mod = await import("../downloads");
    expect(mod.subnetOf(null)).toBe(mod.UNKNOWN_NETWORK);
    expect(mod.subnetOf("999.1.2.3")).toBe(mod.UNKNOWN_NETWORK);
    expect(mod.subnetOf("not-an-ip")).toBe(mod.UNKNOWN_NETWORK);
    expect(mod.subnetOf("1:2:3")).toBe(mod.UNKNOWN_NETWORK);
    expect(mod.subnetOf("1::2::3")).toBe(mod.UNKNOWN_NETWORK);
    expect(mod.subnetOf("2001:db8::zzzz")).toBe(mod.UNKNOWN_NETWORK);
  });
});

describe("groupDownloadsByIp", () => {
  it("aggregates downloads, unique users/artifacts, and last activity per IP", async () => {
    const mod = await import("../downloads");
    const groups = mod.groupDownloadsByIp([
      { ...ROW, downloaded_at: "2026-07-10T10:00:00Z" },
      {
        ...ROW,
        artifact_id: "1f7a12b4-2222-4f2b-9f7d-1c2d3e4f5a6b",
        downloaded_at: "2026-07-10T12:00:00Z",
      },
      {
        ...ROW,
        user_id: null,
        username: null,
        downloaded_at: "2026-07-09T09:00:00Z",
      },
      { ...ROW, ip_address: "10.9.9.9", downloaded_at: "2026-07-08T08:00:00Z" },
    ]);
    expect(groups).toHaveLength(2);
    // Busiest IP first.
    expect(groups[0].ip).toBe("10.1.2.3");
    expect(groups[0].subnet).toBe("10.1.2.0/24");
    expect(groups[0].downloads).toBe(3);
    expect(groups[0].unique_users).toBe(1);
    expect(groups[0].unique_artifacts).toBe(2);
    expect(groups[0].has_anonymous).toBe(true);
    expect(groups[0].last_downloaded_at).toBe("2026-07-10T12:00:00Z");
    expect(groups[1].ip).toBe("10.9.9.9");
    expect(groups[1].has_anonymous).toBe(false);
  });

  it("buckets rows without an IP under unknown", async () => {
    const mod = await import("../downloads");
    const groups = mod.groupDownloadsByIp([{ ...ROW, ip_address: null }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].ip).toBe(mod.UNKNOWN_NETWORK);
    expect(groups[0].subnet).toBe(mod.UNKNOWN_NETWORK);
  });
});

describe("groupDownloadsByUser", () => {
  it("aggregates per user and pools anonymous downloads into one bucket", async () => {
    const mod = await import("../downloads");
    const anon = { ...ROW, user_id: null, username: null };
    const groups = mod.groupDownloadsByUser([
      { ...ROW, downloaded_at: "2026-07-10T10:00:00Z" },
      { ...ROW, ip_address: "10.9.9.9", downloaded_at: "2026-07-10T12:00:00Z" },
      { ...anon, downloaded_at: "2026-07-09T09:00:00Z" },
      { ...anon, ip_address: "10.8.8.8", downloaded_at: "2026-07-09T10:00:00Z" },
      { ...anon, ip_address: "10.8.8.9", downloaded_at: "2026-07-09T11:00:00Z" },
    ]);
    expect(groups).toHaveLength(2);
    // Anonymous bucket is busiest here.
    expect(groups[0].user_id).toBeNull();
    expect(groups[0].username).toBeNull();
    expect(groups[0].downloads).toBe(3);
    expect(groups[0].unique_ips).toBe(3);
    expect(groups[1].user_id).toBe(ROW.user_id);
    expect(groups[1].username).toBe("alice");
    expect(groups[1].downloads).toBe(2);
    expect(groups[1].unique_ips).toBe(2);
    expect(groups[1].last_downloaded_at).toBe("2026-07-10T12:00:00Z");
  });

  it("backfills the username from a later row when the first row lacks it", async () => {
    const mod = await import("../downloads");
    const groups = mod.groupDownloadsByUser([
      { ...ROW, username: null },
      { ...ROW, username: "alice" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].username).toBe("alice");
  });
});
