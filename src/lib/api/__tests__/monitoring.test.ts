import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  ServiceHealthEntry,
  AlertState,
} from "@/types/monitoring";

vi.mock("@/lib/sdk-client", () => ({}));

const mockGetHealthLog = vi.fn();
const mockGetAlertStates = vi.fn();
const mockSuppressAlert = vi.fn();
const mockRunHealthCheck = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  getHealthLog: (...args: unknown[]) => mockGetHealthLog(...args),
  getAlertStates: (...args: unknown[]) => mockGetAlertStates(...args),
  suppressAlert: (...args: unknown[]) => mockSuppressAlert(...args),
  runHealthCheck: (...args: unknown[]) => mockRunHealthCheck(...args),
}));

const SDK_HEALTH_ENTRY = {
  service_name: "db",
  status: "ok",
  previous_status: "degraded",
  message: "all good",
  response_time_ms: 12,
  checked_at: "2026-05-01T00:00:00Z",
};

const EXPECTED_HEALTH_ENTRY: ServiceHealthEntry = {
  service_name: "db",
  status: "ok",
  previous_status: "degraded",
  message: "all good",
  response_time_ms: 12,
  checked_at: "2026-05-01T00:00:00Z",
};

const SDK_ALERT_STATE = {
  service_name: "db",
  current_status: "down",
  consecutive_failures: 3,
  last_alert_sent_at: "2026-05-01T00:00:00Z",
  suppressed_until: "2026-05-02T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

const EXPECTED_ALERT_STATE: AlertState = {
  service_name: "db",
  current_status: "down",
  consecutive_failures: 3,
  last_alert_sent_at: "2026-05-01T00:00:00Z",
  suppressed_until: "2026-05-02T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

describe("monitoringApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getHealthLog returns entries", async () => {
    mockGetHealthLog.mockResolvedValue({
      data: [SDK_HEALTH_ENTRY],
      error: undefined,
    });
    const mod = await import("../monitoring");
    expect(await mod.default.getHealthLog()).toEqual([EXPECTED_HEALTH_ENTRY]);
  });

  it("getHealthLog normalizes optional+nullable fields to null (#359)", async () => {
    mockGetHealthLog.mockResolvedValue({
      data: [
        {
          ...SDK_HEALTH_ENTRY,
          previous_status: undefined,
          message: undefined,
          response_time_ms: undefined,
        },
      ],
      error: undefined,
    });
    const mod = await import("../monitoring");
    const [out] = await mod.default.getHealthLog();
    expect(out.previous_status).toBeNull();
    expect(out.message).toBeNull();
    expect(out.response_time_ms).toBeNull();
  });

  it("getHealthLog throws on error", async () => {
    mockGetHealthLog.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../monitoring");
    await expect(mod.default.getHealthLog()).rejects.toBe("fail");
  });

  it("getAlerts returns alert states", async () => {
    mockGetAlertStates.mockResolvedValue({
      data: [SDK_ALERT_STATE],
      error: undefined,
    });
    const mod = await import("../monitoring");
    expect(await mod.default.getAlerts()).toEqual([EXPECTED_ALERT_STATE]);
  });

  it("getAlerts normalizes optional+nullable fields to null (#359)", async () => {
    mockGetAlertStates.mockResolvedValue({
      data: [
        {
          ...SDK_ALERT_STATE,
          last_alert_sent_at: undefined,
          suppressed_until: undefined,
        },
      ],
      error: undefined,
    });
    const mod = await import("../monitoring");
    const [out] = await mod.default.getAlerts();
    expect(out.last_alert_sent_at).toBeNull();
    expect(out.suppressed_until).toBeNull();
  });

  it("getAlerts throws on error", async () => {
    mockGetAlertStates.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../monitoring");
    await expect(mod.default.getAlerts()).rejects.toBe("fail");
  });

  it("suppressAlert calls SDK with adapted body", async () => {
    mockSuppressAlert.mockResolvedValue({ error: undefined });
    const mod = await import("../monitoring");
    await mod.default.suppressAlert({
      service_name: "db",
      until: "2026-05-02T00:00:00Z",
    });
    expect(mockSuppressAlert).toHaveBeenCalledWith({
      body: { service_name: "db", until: "2026-05-02T00:00:00Z" },
    });
  });

  it("suppressAlert throws on error", async () => {
    mockSuppressAlert.mockResolvedValue({ error: "fail" });
    const mod = await import("../monitoring");
    await expect(
      mod.default.suppressAlert({ service_name: "db", until: "x" })
    ).rejects.toBe("fail");
  });

  it("triggerCheck returns entries", async () => {
    mockRunHealthCheck.mockResolvedValue({
      data: [SDK_HEALTH_ENTRY],
      error: undefined,
    });
    const mod = await import("../monitoring");
    expect(await mod.default.triggerCheck()).toEqual([EXPECTED_HEALTH_ENTRY]);
  });

  it("triggerCheck throws on error", async () => {
    mockRunHealthCheck.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../monitoring");
    await expect(mod.default.triggerCheck()).rejects.toBe("fail");
  });
});
