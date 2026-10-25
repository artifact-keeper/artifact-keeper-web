import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();

vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const RUNTIME_SETTINGS = {
  guest_access_enabled: true,
  guest_access_source: "default",
  guest_access_stored: null,
  guest_access_editable: true,
  hidden_nav_items: ["/peers"],
};

describe("navigationSettingsApi (#968)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the hidden list from the runtime settings endpoint", async () => {
    mockApiFetch.mockResolvedValue(RUNTIME_SETTINGS);
    const mod = await import("../navigation-settings");

    const result = await mod.navigationSettingsApi.get();

    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/admin/settings/system");
    expect(result).toEqual({ hiddenNavItems: ["/peers"], supported: true });
  });

  it("reports an older backend without the field as unsupported", async () => {
    const { hidden_nav_items: _omit, ...older } = RUNTIME_SETTINGS;
    void _omit;
    mockApiFetch.mockResolvedValue(older);
    const mod = await import("../navigation-settings");

    const result = await mod.navigationSettingsApi.get();

    expect(result).toEqual({ hiddenNavItems: [], supported: false });
  });

  it("PATCHes only hidden_nav_items, leaving guest access alone", async () => {
    mockApiFetch.mockResolvedValue({
      ...RUNTIME_SETTINGS,
      hidden_nav_items: ["/peers", "/webhooks"],
    });
    const mod = await import("../navigation-settings");

    const result = await mod.navigationSettingsApi.update(["/peers", "/webhooks"]);

    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/admin/settings/system", {
      method: "PATCH",
      body: JSON.stringify({ hidden_nav_items: ["/peers", "/webhooks"] }),
    });
    expect(result.hiddenNavItems).toEqual(["/peers", "/webhooks"]);
  });

  it("rejects a response whose list is not strings", async () => {
    mockApiFetch.mockResolvedValue({ hidden_nav_items: [1, 2] });
    const mod = await import("../navigation-settings");

    await expect(mod.navigationSettingsApi.get()).rejects.toThrow();
  });
});
