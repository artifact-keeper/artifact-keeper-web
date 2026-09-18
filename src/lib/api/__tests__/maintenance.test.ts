import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockApiFetch = vi.fn();

vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const LEDGER_ROW = {
  repository_id: "11111111-1111-1111-1111-111111111111",
  repository_key: "maven-local",
  before_total_bytes: 1024,
  after_total_bytes: 4096,
  after_hosted_bytes: 3072,
  after_proxy_bytes: 512,
  after_oci_bytes: 512,
  drift_bytes: 3072,
};

const LEDGER_RESPONSE = {
  repositories_checked: 1,
  repositories_repaired: 1,
  repositories_skipped: 0,
  total_drift_bytes: 3072,
  before_total_storage_bytes: 1024,
  after_total_storage_bytes: 4096,
  repositories: [LEDGER_ROW],
};

const PACKAGES_RESPONSE = {
  message: "Package catalog backfill completed",
  artifacts_scanned: 120,
  packages_registered: 100,
  artifacts_skipped: 18,
  artifacts_failed: 2,
};

describe("maintenanceApi (#859)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs the storage-ledger backfill and parses the drift report", async () => {
    mockApiFetch.mockResolvedValue(LEDGER_RESPONSE);
    const mod = await import("../maintenance");

    const result = await mod.maintenanceApi.backfillStorageLedger();

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/admin/storage/ledger/backfill",
      { method: "POST" },
    );
    expect(result.repositories_repaired).toBe(1);
    expect(result.total_drift_bytes).toBe(3072);
    expect(result.repositories[0].repository_key).toBe("maven-local");
    expect(result.repositories[0].drift_bytes).toBe(3072);
  });

  it("normalizes a missing ledger row (null before_total_bytes) to null", async () => {
    mockApiFetch.mockResolvedValue({
      ...LEDGER_RESPONSE,
      repositories: [{ ...LEDGER_ROW, before_total_bytes: null }],
    });
    const mod = await import("../maintenance");

    const result = await mod.maintenanceApi.backfillStorageLedger();

    expect(result.repositories[0].before_total_bytes).toBeNull();
  });

  it("defaults a missing repositories array to an empty list", async () => {
    const { repositories: _omitted, ...withoutRows } = LEDGER_RESPONSE;
    mockApiFetch.mockResolvedValue(withoutRows);
    const mod = await import("../maintenance");

    const result = await mod.maintenanceApi.backfillStorageLedger();

    expect(result.repositories).toEqual([]);
  });

  it("rejects a malformed ledger response at the trust boundary", async () => {
    mockApiFetch.mockResolvedValue({ repositories_checked: "lots" });
    const mod = await import("../maintenance");

    await expect(mod.maintenanceApi.backfillStorageLedger()).rejects.toThrow();
  });

  it("POSTs the package backfill without a query when unscoped", async () => {
    mockApiFetch.mockResolvedValue(PACKAGES_RESPONSE);
    const mod = await import("../maintenance");

    const result = await mod.maintenanceApi.backfillPackages();

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/admin/packages/backfill",
      { method: "POST" },
    );
    expect(result.packages_registered).toBe(100);
    expect(result.artifacts_failed).toBe(2);
    expect(result.message).toBe("Package catalog backfill completed");
  });

  it("URL-encodes the repository scope and trims whitespace", async () => {
    mockApiFetch.mockResolvedValue(PACKAGES_RESPONSE);
    const mod = await import("../maintenance");

    await mod.maintenanceApi.backfillPackages("  docker/prod repo  ");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/admin/packages/backfill?repository_key=docker%2Fprod%20repo",
      { method: "POST" },
    );
  });

  it("treats a blank repository scope as unscoped", async () => {
    mockApiFetch.mockResolvedValue(PACKAGES_RESPONSE);
    const mod = await import("../maintenance");

    await mod.maintenanceApi.backfillPackages("   ");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/admin/packages/backfill",
      { method: "POST" },
    );
  });

  it("rejects a malformed packages response at the trust boundary", async () => {
    mockApiFetch.mockResolvedValue({ ...PACKAGES_RESPONSE, artifacts_scanned: null });
    const mod = await import("../maintenance");

    await expect(mod.maintenanceApi.backfillPackages()).rejects.toThrow();
  });

  it("propagates an ApiError from apiFetch unchanged", async () => {
    mockApiFetch.mockRejectedValue(new Error("API error 401: Admin privileges required"));
    const mod = await import("../maintenance");

    await expect(mod.maintenanceApi.backfillStorageLedger()).rejects.toThrow(
      /Admin privileges required/,
    );
  });
});
