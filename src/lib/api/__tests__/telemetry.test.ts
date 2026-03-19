import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockGetSettings = vi.fn();
const mockUpdateSettings = vi.fn();
const mockListCrashes = vi.fn();
const mockListPending = vi.fn();
const mockGetCrash = vi.fn();
const mockSubmitCrashes = vi.fn();
const mockDeleteCrash = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  getTelemetrySettings: (...args: unknown[]) => mockGetSettings(...args),
  updateTelemetrySettings: (...args: unknown[]) => mockUpdateSettings(...args),
  listCrashes: (...args: unknown[]) => mockListCrashes(...args),
  listPendingCrashes: (...args: unknown[]) => mockListPending(...args),
  getCrash: (...args: unknown[]) => mockGetCrash(...args),
  submitCrashes: (...args: unknown[]) => mockSubmitCrashes(...args),
  deleteCrash: (...args: unknown[]) => mockDeleteCrash(...args),
}));

describe("telemetryApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getSettings returns settings", async () => {
    const settings = { enabled: true };
    mockGetSettings.mockResolvedValue({ data: settings, error: undefined });
    const mod = await import("../telemetry");
    expect(await mod.default.getSettings()).toEqual(settings);
  });

  it("getSettings throws on error", async () => {
    mockGetSettings.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../telemetry");
    await expect(mod.default.getSettings()).rejects.toBe("fail");
  });

  it("updateSettings returns updated settings", async () => {
    const settings = { enabled: false };
    mockUpdateSettings.mockResolvedValue({ data: settings, error: undefined });
    const mod = await import("../telemetry");
    expect(await mod.default.updateSettings(settings as any)).toEqual(settings);
  });

  it("updateSettings throws on error", async () => {
    mockUpdateSettings.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../telemetry");
    await expect(mod.default.updateSettings({} as any)).rejects.toBe("fail");
  });

  it("listCrashes returns crash list", async () => {
    const data = { items: [{ id: "c1" }], total: 1 };
    mockListCrashes.mockResolvedValue({ data, error: undefined });
    const mod = await import("../telemetry");
    expect(await mod.default.listCrashes()).toEqual(data);
  });

  it("listCrashes throws on error", async () => {
    mockListCrashes.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../telemetry");
    await expect(mod.default.listCrashes()).rejects.toBe("fail");
  });

  it("listPending returns pending crashes", async () => {
    const crashes = [{ id: "c1" }];
    mockListPending.mockResolvedValue({ data: crashes, error: undefined });
    const mod = await import("../telemetry");
    expect(await mod.default.listPending()).toEqual(crashes);
  });

  it("listPending throws on error", async () => {
    mockListPending.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../telemetry");
    await expect(mod.default.listPending()).rejects.toBe("fail");
  });

  it("getCrash returns a single crash", async () => {
    const crash = { id: "c1", message: "oops" };
    mockGetCrash.mockResolvedValue({ data: crash, error: undefined });
    const mod = await import("../telemetry");
    expect(await mod.default.getCrash("c1")).toEqual(crash);
  });

  it("getCrash throws on error", async () => {
    mockGetCrash.mockResolvedValue({ data: undefined, error: "not found" });
    const mod = await import("../telemetry");
    await expect(mod.default.getCrash("c1")).rejects.toBe("not found");
  });

  it("submitCrashes returns response", async () => {
    const resp = { submitted: 2 };
    mockSubmitCrashes.mockResolvedValue({ data: resp, error: undefined });
    const mod = await import("../telemetry");
    expect(await mod.default.submitCrashes(["c1", "c2"])).toEqual(resp);
  });

  it("submitCrashes throws on error", async () => {
    mockSubmitCrashes.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../telemetry");
    await expect(mod.default.submitCrashes(["c1"])).rejects.toBe("fail");
  });

  it("deleteCrash calls SDK", async () => {
    mockDeleteCrash.mockResolvedValue({ error: undefined });
    const mod = await import("../telemetry");
    await mod.default.deleteCrash("c1");
    expect(mockDeleteCrash).toHaveBeenCalled();
  });

  it("deleteCrash throws on error", async () => {
    mockDeleteCrash.mockResolvedValue({ error: "fail" });
    const mod = await import("../telemetry");
    await expect(mod.default.deleteCrash("c1")).rejects.toBe("fail");
  });
});
