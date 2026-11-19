import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockApiFetch = vi.fn();
vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const DECISION = {
  id: "d1",
  lineage_id: "l1",
  repository_id: "r1",
  checksum_sha256: "a".repeat(64),
  finding_class: "vulnerability",
  advisory: "CVE-2024-1",
  component: "openssl",
  component_version: "1.1",
  max_severity: "high",
  reason: "risk_accepted",
  acknowledged_by: "u1",
  acknowledged_at: "2026-11-01T00:00:00Z",
  expires_at: null,
  created_via: "api",
  carried_by: null,
  revoked_at: null,
  revoked_by: null,
  revoked_reason: null,
  state: "active",
};

describe("acknowledgementsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists decisions with its filters on the query string", async () => {
    mockApiFetch.mockResolvedValue({ items: [DECISION], total: 1 });
    const { acknowledgementsApi } = await import("../acknowledgements");
    const out = await acknowledgementsApi.list({
      include_inactive: true,
      advisory: "CVE-2024-1",
      page: 2,
      per_page: 20,
    });
    const url = new URL(mockApiFetch.mock.calls[0][0], "http://x");
    expect(url.pathname).toBe("/api/v1/security/acknowledgements");
    expect(url.searchParams.get("include_inactive")).toBe("true");
    expect(url.searchParams.get("advisory")).toBe("CVE-2024-1");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("20");
    expect(out.total).toBe(1);
    expect(out.items[0].repository_id).toBe("r1");
  });

  it("keeps a decision for every repository as a null repository", async () => {
    mockApiFetch.mockResolvedValue({
      items: [{ ...DECISION, repository_id: null }],
      total: 1,
    });
    const { acknowledgementsApi } = await import("../acknowledgements");
    const out = await acknowledgementsApi.list();
    expect(out.items[0].repository_id).toBeNull();
  });

  it("refuses a response that dropped the list", async () => {
    mockApiFetch.mockResolvedValue({ total: 0 });
    const { acknowledgementsApi } = await import("../acknowledgements");
    await expect(acknowledgementsApi.list()).rejects.toThrow();
  });

  it("revokes by id and answers what it revoked and left", async () => {
    mockApiFetch.mockResolvedValue({ revoked: 1, left_effective: 2 });
    const { acknowledgementsApi } = await import("../acknowledgements");
    const out = await acknowledgementsApi.revoke("d/1");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/security/acknowledgements/d%2F1",
      { method: "DELETE" },
    );
    expect(out).toEqual({ revoked: 1, left_effective: 2 });
  });
});
