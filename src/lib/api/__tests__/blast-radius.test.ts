import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockApiFetch = vi.fn();

vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const DOWNLOADER = {
  user_id: "0e8b23a5-1111-4f2b-9f7d-1c2d3e4f5a6b",
  username: "jane",
  download_count: 2,
  distinct_ip_count: 2,
  first_download: "2026-07-09T10:00:00Z",
  last_download: "2026-07-10T12:00:00Z",
  ip_addresses: ["198.51.100.10", "198.51.100.11"],
};

const REPO = {
  repository_id: "1f7a12b4-2222-4f2b-9f7d-1c2d3e4f5a6b",
  repository_key: "libs-release",
  is_public: false,
  access_scope: "restricted_roles",
};

const RESPONSE = {
  target: { kind: "cve", value: "CVE-2021-44228" },
  summary: {
    affected_artifact_count: 2,
    affected_repo_count: 1,
    downloader_user_count: 2,
    anonymous_download_present: true,
    distinct_ip_count: 4,
    total_download_count: 4,
  },
  affected_repos: [REPO],
  downloaders: [DOWNLOADER],
  total_downloaders: 3,
  page: 1,
  per_page: 20,
};

describe("blastRadiusApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses a blast-radius response for a CVE", async () => {
    mockApiFetch.mockResolvedValue(RESPONSE);
    const mod = await import("../blast-radius");
    const res = await mod.blastRadiusApi.forCve("CVE-2021-44228");
    expect(res.target).toEqual({ kind: "cve", value: "CVE-2021-44228" });
    expect(res.summary.affected_artifact_count).toBe(2);
    expect(res.summary.anonymous_download_present).toBe(true);
    expect(res.affected_repos[0].access_scope).toBe("restricted_roles");
    expect(res.downloaders[0].username).toBe("jane");
    expect(res.total_downloaders).toBe(3);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/admin/security/cve/CVE-2021-44228/blast-radius",
      { method: "GET" }
    );
  });

  it("routes artifact targets through the artifact endpoint", async () => {
    mockApiFetch.mockResolvedValue({
      ...RESPONSE,
      target: { kind: "artifact", value: REPO.repository_id },
    });
    const mod = await import("../blast-radius");
    await mod.blastRadiusApi.forArtifact(` ${REPO.repository_id} `, {
      page: 2,
      per_page: 50,
    });
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(url.startsWith(
      `/api/v1/admin/security/artifact/${REPO.repository_id}/blast-radius?`
    )).toBe(true);
    const qs = new URLSearchParams(url.split("?")[1]);
    expect(qs.get("page")).toBe("2");
    expect(qs.get("per_page")).toBe("50");
  });

  it("uppercases CVE ids and URL-encodes the path segment", async () => {
    mockApiFetch.mockResolvedValue(RESPONSE);
    const mod = await import("../blast-radius");
    await mod.blastRadiusApi.forCve(" cve-2021-44228 ");
    expect(mockApiFetch.mock.calls[0][0]).toBe(
      "/api/v1/admin/security/cve/CVE-2021-44228/blast-radius"
    );
  });

  it("normalizes null/omitted downloader fields (anonymous principal)", async () => {
    mockApiFetch.mockResolvedValue({
      ...RESPONSE,
      downloaders: [
        {
          ...DOWNLOADER,
          user_id: null,
          username: null,
          ip_addresses: undefined,
        },
      ],
    });
    const mod = await import("../blast-radius");
    const res = await mod.blastRadiusApi.forCve("CVE-2021-44228");
    expect(res.downloaders[0].user_id).toBeNull();
    expect(res.downloaders[0].username).toBeNull();
    expect(res.downloaders[0].ip_addresses).toEqual([]);
  });

  it("throws on a response that does not match the expected shape", async () => {
    mockApiFetch.mockResolvedValue({ rows: [] });
    const mod = await import("../blast-radius");
    await expect(mod.blastRadiusApi.forCve("CVE-2021-44228")).rejects.toThrow(
      /did not match the expected shape/
    );
  });

  it("serializes date bounds into the query string", async () => {
    mockApiFetch.mockResolvedValue(RESPONSE);
    const mod = await import("../blast-radius");
    await mod.blastRadiusApi.forCve("CVE-2021-44228", {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-10T23:59:59.999Z",
    });
    const url = mockApiFetch.mock.calls[0][0] as string;
    const qs = new URLSearchParams(url.split("?")[1]);
    expect(qs.get("from")).toBe("2026-07-01T00:00:00.000Z");
    expect(qs.get("to")).toBe("2026-07-10T23:59:59.999Z");
  });

  it("clamps per_page to the backend max and floors page at 1", async () => {
    const mod = await import("../blast-radius");
    const qs = new URLSearchParams(
      mod.buildBlastRadiusQueryString({ page: 0, per_page: 999 }).slice(1)
    );
    expect(qs.get("page")).toBe("1");
    expect(qs.get("per_page")).toBe(String(mod.BLAST_RADIUS_MAX_PER_PAGE));
    expect(mod.buildBlastRadiusQueryString({})).toBe("");
  });

  it("validates CVE and GHSA ids for client-side feedback", async () => {
    const mod = await import("../blast-radius");
    expect(mod.isValidVulnId("CVE-2021-44228")).toBe(true);
    expect(mod.isValidVulnId(" cve-2024-1234 ")).toBe(true);
    expect(mod.isValidVulnId("GHSA-jfh8-c2jp-5v3q")).toBe(true);
    expect(mod.isValidVulnId("CVE-2021")).toBe(false);
    expect(mod.isValidVulnId("log4shell")).toBe(false);
    expect(mod.isValidVulnId("")).toBe(false);
  });

  it("normalizes vulnerability ids to their canonical casing", async () => {
    const mod = await import("../blast-radius");
    expect(mod.normalizeVulnId(" cve-2021-44228 ")).toBe("CVE-2021-44228");
    expect(mod.normalizeVulnId("ghsa-JFH8-C2JP-5V3Q")).toBe(
      "GHSA-jfh8-c2jp-5v3q"
    );
    expect(mod.normalizeVulnId("weird-id")).toBe("weird-id");
  });

  it("builds a deep link into the blast-radius page", async () => {
    const mod = await import("../blast-radius");
    expect(mod.blastRadiusHref("CVE-2021-44228")).toBe(
      "/security/blast-radius?cve=CVE-2021-44228"
    );
  });
});

// ---------------------------------------------------------------------------
// Accessible-but-not-downloaded (latent exposure) — 1.6.0 dimension (#2386)
// ---------------------------------------------------------------------------

const ACCESSIBLE_USER = {
  reason: "has-access",
  user_id: "0e8b23a5-1111-4f2b-9f7d-1c2d3e4f5a6b",
  username: "carol",
  via: "permission",
};

const ACCESSIBLE_RESPONSE = {
  target: { kind: "cve", value: "CVE-2021-44228" },
  repository: {
    repository_id: "1f7a12b4-2222-4f2b-9f7d-1c2d3e4f5a6b",
    repository_key: "libs-release",
    access_scope: "restricted_acl",
  },
  exposure: "enumerable",
  accessible_not_downloaded: [ACCESSIBLE_USER],
  total: 5,
  page: 1,
  per_page: 20,
};

describe("accessibleUsersApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses an accessible-users response and scopes the CVE route to a repo", async () => {
    mockApiFetch.mockResolvedValue(ACCESSIBLE_RESPONSE);
    const mod = await import("../blast-radius");
    const res = await mod.accessibleUsersApi.forCve("CVE-2021-44228", {
      repository_id: "1f7a12b4-2222-4f2b-9f7d-1c2d3e4f5a6b",
      page: 1,
      per_page: 20,
    });
    expect(res.exposure).toBe("enumerable");
    expect(res.repository.repository_key).toBe("libs-release");
    expect(res.accessible_not_downloaded[0].username).toBe("carol");
    expect(res.accessible_not_downloaded[0].via).toBe("permission");
    expect(res.accessible_not_downloaded[0].reason).toBe("has-access");
    expect(res.total).toBe(5);

    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(
      url.startsWith(
        "/api/v1/admin/security/cve/CVE-2021-44228/accessible-users?"
      )
    ).toBe(true);
    const qs = new URLSearchParams(url.split("?")[1]);
    expect(qs.get("repository_id")).toBe(
      "1f7a12b4-2222-4f2b-9f7d-1c2d3e4f5a6b"
    );
    expect(qs.get("page")).toBe("1");
    expect(qs.get("per_page")).toBe("20");
  });

  it("routes artifact targets through the artifact accessible-users endpoint", async () => {
    mockApiFetch.mockResolvedValue({
      ...ACCESSIBLE_RESPONSE,
      target: { kind: "artifact", value: ACCESSIBLE_RESPONSE.repository.repository_id },
    });
    const mod = await import("../blast-radius");
    await mod.accessibleUsersApi.forArtifact(
      ` ${ACCESSIBLE_RESPONSE.repository.repository_id} `,
      { page: 2, per_page: 50 }
    );
    const url = mockApiFetch.mock.calls[0][0] as string;
    expect(
      url.startsWith(
        `/api/v1/admin/security/artifact/${ACCESSIBLE_RESPONSE.repository.repository_id}/accessible-users?`
      )
    ).toBe(true);
    const qs = new URLSearchParams(url.split("?")[1]);
    expect(qs.get("page")).toBe("2");
    expect(qs.get("per_page")).toBe("50");
  });

  it("normalizes a public/everyone response with a null total and empty list", async () => {
    mockApiFetch.mockResolvedValue({
      ...ACCESSIBLE_RESPONSE,
      repository: {
        ...ACCESSIBLE_RESPONSE.repository,
        access_scope: "public",
      },
      exposure: "everyone",
      accessible_not_downloaded: [],
      total: null,
    });
    const mod = await import("../blast-radius");
    const res = await mod.accessibleUsersApi.forCve("CVE-2021-44228", {
      repository_id: "r1",
    });
    expect(res.exposure).toBe("everyone");
    expect(res.accessible_not_downloaded).toEqual([]);
    expect(res.total).toBeNull();
  });

  it("treats an omitted total as null", async () => {
    const noTotal: Record<string, unknown> = { ...ACCESSIBLE_RESPONSE };
    delete noTotal.total;
    mockApiFetch.mockResolvedValue(noTotal);
    const mod = await import("../blast-radius");
    const res = await mod.accessibleUsersApi.forArtifact("art");
    expect(res.total).toBeNull();
  });

  it("throws on an accessible-users response that does not match the shape", async () => {
    mockApiFetch.mockResolvedValue({ users: [] });
    const mod = await import("../blast-radius");
    await expect(
      mod.accessibleUsersApi.forCve("CVE-2021-44228", { repository_id: "r1" })
    ).rejects.toThrow(/did not match the expected shape/);
  });

  it("omits empty params and clamps per_page in the accessible-users query string", async () => {
    const mod = await import("../blast-radius");
    expect(mod.buildAccessibleUsersQueryString({})).toBe("");
    const qs = new URLSearchParams(
      mod
        .buildAccessibleUsersQueryString({ page: 0, per_page: 999 })
        .slice(1)
    );
    expect(qs.get("page")).toBe("1");
    expect(qs.get("per_page")).toBe(String(mod.BLAST_RADIUS_MAX_PER_PAGE));
  });
});
