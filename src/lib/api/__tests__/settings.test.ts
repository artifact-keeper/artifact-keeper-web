import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockGetSettings = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
}));

describe("settingsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getPasswordPolicy returns defaults when server has no policy fields", async () => {
    mockGetSettings.mockResolvedValue({
      data: { storage_backend: "fs", storage_path: "/data" },
      error: undefined,
    });
    const mod = await import("../settings");
    const policy = await mod.settingsApi.getPasswordPolicy();
    expect(policy).toEqual(mod.settingsApi.DEFAULT_PASSWORD_POLICY);
  });

  it("getPasswordPolicy extracts nested password_policy object", async () => {
    mockGetSettings.mockResolvedValue({
      data: {
        password_policy: {
          min_length: 12,
          require_uppercase: false,
          require_lowercase: true,
          require_digit: true,
          require_special: true,
          history_count: 10,
        },
      },
      error: undefined,
    });
    const mod = await import("../settings");
    const policy = await mod.settingsApi.getPasswordPolicy();
    expect(policy.min_length).toBe(12);
    expect(policy.require_uppercase).toBe(false);
    expect(policy.require_special).toBe(true);
    expect(policy.history_count).toBe(10);
  });

  it("getPasswordPolicy reads flat password_min_length field", async () => {
    mockGetSettings.mockResolvedValue({
      data: { password_min_length: 16 },
      error: undefined,
    });
    const mod = await import("../settings");
    const policy = await mod.settingsApi.getPasswordPolicy();
    expect(policy.min_length).toBe(16);
  });

  it("getPasswordPolicy reads flat password_history_count field", async () => {
    mockGetSettings.mockResolvedValue({
      data: { password_history_count: 3 },
      error: undefined,
    });
    const mod = await import("../settings");
    const policy = await mod.settingsApi.getPasswordPolicy();
    expect(policy.history_count).toBe(3);
  });

  it("getPasswordPolicy returns defaults on SDK error", async () => {
    mockGetSettings.mockResolvedValue({
      data: undefined,
      error: "unauthorized",
    });
    const mod = await import("../settings");
    const policy = await mod.settingsApi.getPasswordPolicy();
    expect(policy).toEqual(mod.settingsApi.DEFAULT_PASSWORD_POLICY);
  });

  it("getPasswordPolicy returns defaults when SDK throws", async () => {
    mockGetSettings.mockRejectedValue(new Error("network error"));
    const mod = await import("../settings");
    const policy = await mod.settingsApi.getPasswordPolicy();
    expect(policy).toEqual(mod.settingsApi.DEFAULT_PASSWORD_POLICY);
  });

  it("nested password_policy takes precedence over flat fields", async () => {
    mockGetSettings.mockResolvedValue({
      data: {
        password_min_length: 6,
        password_policy: { min_length: 20 },
      },
      error: undefined,
    });
    const mod = await import("../settings");
    const policy = await mod.settingsApi.getPasswordPolicy();
    expect(policy.min_length).toBe(20);
  });
});
