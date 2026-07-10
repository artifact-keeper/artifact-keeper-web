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
