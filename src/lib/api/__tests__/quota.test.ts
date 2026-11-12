import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/fetch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/fetch")>("@/lib/api/fetch");
  return { ...actual, apiFetch: (...a: unknown[]) => mockApiFetch(...a) };
});
vi.mock("@/lib/sdk-client", () => ({
  getActiveInstanceBaseUrl: () => "",
  CSRF_HEADER_NAME: "X-Requested-With",
  CSRF_HEADER_VALUE: "XMLHttpRequest",
}));

import { ApiError } from "@/lib/api/fetch";
import { quotaApi, quotaKeys } from "../quota";

describe("quotaApi.get", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads GET /api/v1/system/quota", async () => {
    mockApiFetch.mockResolvedValue({
      storage_quota: { enabled: true, quota_bytes: 100, used_bytes: 10, percent: 10, warn_percent: 80, state: "ok" },
      transfer_quota: { enabled: false },
      max_upload_bytes: 42,
      quota_help_url: null,
    });
    const q = await quotaApi.get();
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/system/quota");
    expect(q?.storage?.state).toBe("ok");
    expect(q?.maxUploadBytes).toBe(42);
  });

  it.each([401, 403, 404, 405, 501])("is null when the backend answers %i", async (status) => {
    mockApiFetch.mockRejectedValue(new ApiError(status, ""));
    await expect(quotaApi.get()).resolves.toBeNull();
  });

  it("rethrows other failures", async () => {
    mockApiFetch.mockRejectedValue(new ApiError(500, "boom"));
    await expect(quotaApi.get()).rejects.toThrow("API error 500");
  });

  it("exposes a stable query key", () => {
    expect(quotaKeys.system).toEqual(["system-quota"]);
  });
});
