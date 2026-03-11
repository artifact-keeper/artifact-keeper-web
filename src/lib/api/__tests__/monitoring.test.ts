import { describe, it, expect, vi, beforeEach } from "vitest";

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

describe("monitoringApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getHealthLog returns entries", async () => {
    const entries = [{ service: "db", status: "ok" }];
    mockGetHealthLog.mockResolvedValue({ data: entries, error: undefined });
    const mod = await import("../monitoring");
    expect(await mod.default.getHealthLog()).toEqual(entries);
  });

  it("getHealthLog throws on error", async () => {
    mockGetHealthLog.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../monitoring");
    await expect(mod.default.getHealthLog()).rejects.toBe("fail");
  });

  it("getAlerts returns alert states", async () => {
    const alerts = [{ id: "a1", severity: "high" }];
    mockGetAlertStates.mockResolvedValue({ data: alerts, error: undefined });
    const mod = await import("../monitoring");
    expect(await mod.default.getAlerts()).toEqual(alerts);
  });

  it("getAlerts throws on error", async () => {
    mockGetAlertStates.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../monitoring");
    await expect(mod.default.getAlerts()).rejects.toBe("fail");
  });

  it("suppressAlert calls SDK", async () => {
    mockSuppressAlert.mockResolvedValue({ error: undefined });
    const mod = await import("../monitoring");
    await mod.default.suppressAlert({ alert_id: "a1" } as any);
    expect(mockSuppressAlert).toHaveBeenCalled();
  });

  it("suppressAlert throws on error", async () => {
    mockSuppressAlert.mockResolvedValue({ error: "fail" });
    const mod = await import("../monitoring");
    await expect(mod.default.suppressAlert({} as any)).rejects.toBe("fail");
  });

  it("triggerCheck returns entries", async () => {
    const entries = [{ service: "db" }];
    mockRunHealthCheck.mockResolvedValue({ data: entries, error: undefined });
    const mod = await import("../monitoring");
    expect(await mod.default.triggerCheck()).toEqual(entries);
  });

  it("triggerCheck throws on error", async () => {
    mockRunHealthCheck.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../monitoring");
    await expect(mod.default.triggerCheck()).rejects.toBe("fail");
  });
});
