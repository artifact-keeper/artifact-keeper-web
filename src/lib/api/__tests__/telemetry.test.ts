import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  CrashReport as SdkCrashReport,
  TelemetrySettings as SdkTelemetrySettings,
} from "@artifact-keeper/sdk";

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

const SDK_SETTINGS: SdkTelemetrySettings = {
  enabled: true,
  include_logs: false,
  review_before_send: true,
  scrub_level: "default",
};

const SDK_CRASH: SdkCrashReport = {
  id: "c1",
  app_version: "1.1.3",
  component: "ui",
  context: { user_id: "u1" },
  created_at: "2026-05-01T00:00:00Z",
  error_message: "oops",
  error_signature: "sig-1",
  error_type: "TypeError",
  first_seen_at: "2026-05-01T00:00:00Z",
  last_seen_at: "2026-05-01T00:00:00Z",
  occurrence_count: 1,
  os_info: "linux",
  severity: "high",
  stack_trace: "at foo()",
  submission_error: null,
  submitted: false,
  submitted_at: null,
  uptime_seconds: 42,
};

describe("telemetryApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getSettings returns settings", async () => {
    mockGetSettings.mockResolvedValue({ data: SDK_SETTINGS, error: undefined });
    const mod = await import("../telemetry");
    expect(await mod.default.getSettings()).toEqual({
      enabled: true,
      review_before_send: true,
      scrub_level: "default",
      include_logs: false,
    });
  });

  it("getSettings throws Empty response body when SDK returns no data (#359)", async () => {
    mockGetSettings.mockResolvedValue({ data: undefined, error: undefined });
    const mod = await import("../telemetry");
    await expect(mod.default.getSettings()).rejects.toThrow(/Empty response body/);
  });

  it("getSettings throws on error", async () => {
    mockGetSettings.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../telemetry");
    await expect(mod.default.getSettings()).rejects.toBe("fail");
  });

  it("updateSettings returns updated settings", async () => {
    mockUpdateSettings.mockResolvedValue({ data: SDK_SETTINGS, error: undefined });
    const mod = await import("../telemetry");
    expect(
      await mod.default.updateSettings({
        enabled: true,
        review_before_send: true,
        scrub_level: "default",
        include_logs: false,
      }),
    ).toEqual({
      enabled: true,
      review_before_send: true,
      scrub_level: "default",
      include_logs: false,
    });
  });

  it("updateSettings throws on error", async () => {
    mockUpdateSettings.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../telemetry");
    await expect(
      mod.default.updateSettings({
        enabled: false,
        review_before_send: false,
        scrub_level: "default",
        include_logs: false,
      }),
    ).rejects.toBe("fail");
  });

  it("listCrashes returns crash list", async () => {
    mockListCrashes.mockResolvedValue({
      data: { items: [SDK_CRASH], total: 1 },
      error: undefined,
    });
    const mod = await import("../telemetry");
    const out = await mod.default.listCrashes();
    expect(out.total).toBe(1);
    expect(out.items[0].id).toBe("c1");
    expect(out.items[0].error_type).toBe("TypeError");
  });

  it("listCrashes normalizes optional+nullable fields to null (#359)", async () => {
    mockListCrashes.mockResolvedValue({
      data: {
        items: [
          {
            ...SDK_CRASH,
            stack_trace: undefined,
            os_info: undefined,
            uptime_seconds: undefined,
            submitted_at: undefined,
            submission_error: undefined,
          },
        ],
        total: 1,
      },
      error: undefined,
    });
    const mod = await import("../telemetry");
    const out = await mod.default.listCrashes();
    const c = out.items[0];
    expect(c.stack_trace).toBeNull();
    expect(c.os_info).toBeNull();
    expect(c.uptime_seconds).toBeNull();
    expect(c.submitted_at).toBeNull();
    expect(c.submission_error).toBeNull();
  });

  it("listCrashes throws on error", async () => {
    mockListCrashes.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../telemetry");
    await expect(mod.default.listCrashes()).rejects.toBe("fail");
  });

  it("listPending returns pending crashes", async () => {
    mockListPending.mockResolvedValue({ data: [SDK_CRASH], error: undefined });
    const mod = await import("../telemetry");
    const out = await mod.default.listPending();
    expect(out[0].id).toBe("c1");
  });

  it("listPending throws on error", async () => {
    mockListPending.mockResolvedValue({ data: undefined, error: "fail" });
    const mod = await import("../telemetry");
    await expect(mod.default.listPending()).rejects.toBe("fail");
  });

  it("getCrash returns a single crash", async () => {
    mockGetCrash.mockResolvedValue({ data: SDK_CRASH, error: undefined });
    const mod = await import("../telemetry");
    const out = await mod.default.getCrash("c1");
    expect(out.id).toBe("c1");
    expect(out.error_message).toBe("oops");
  });

  it("getCrash throws on error", async () => {
    mockGetCrash.mockResolvedValue({ data: undefined, error: "not found" });
    const mod = await import("../telemetry");
    await expect(mod.default.getCrash("c1")).rejects.toBe("not found");
  });

  it("submitCrashes returns response", async () => {
    mockSubmitCrashes.mockResolvedValue({
      data: { marked_submitted: 2 },
      error: undefined,
    });
    const mod = await import("../telemetry");
    expect(await mod.default.submitCrashes(["c1", "c2"])).toEqual({
      marked_submitted: 2,
    });
    expect(mockSubmitCrashes).toHaveBeenCalledWith({
      body: { ids: ["c1", "c2"] },
    });
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
