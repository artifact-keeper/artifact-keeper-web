import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

const mockGetAllSettings = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/settings", () => ({
  settingsApi: {
    getAllSettings: () => mockGetAllSettings(),
  },
}));

import {
  ADMIN_SETTINGS_QUERY_KEY,
  useAdminSettings,
} from "../use-admin-settings";

describe("useAdminSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({ data: undefined });
  });

  it("calls useQuery with the shared admin-settings key", () => {
    useAdminSettings();
    expect(mockUseQuery).toHaveBeenCalledTimes(1);
    const opts = mockUseQuery.mock.calls[0][0];
    expect(opts.queryKey).toEqual(["admin-settings"]);
  });

  it("uses settingsApi.getAllSettings as the queryFn", () => {
    useAdminSettings();
    const opts = mockUseQuery.mock.calls[0][0];
    opts.queryFn();
    expect(mockGetAllSettings).toHaveBeenCalledTimes(1);
  });

  it("sets a 5-minute staleTime and disables retry", () => {
    useAdminSettings();
    const opts = mockUseQuery.mock.calls[0][0];
    expect(opts.staleTime).toBe(5 * 60 * 1000);
    expect(opts.retry).toBe(false);
  });

  it("returns the useQuery result unchanged", () => {
    const result = { data: { passwordPolicy: {} }, isLoading: false };
    mockUseQuery.mockReturnValue(result);
    expect(useAdminSettings()).toBe(result);
  });

  it("exports a query key matching the hook's queryKey", () => {
    expect(ADMIN_SETTINGS_QUERY_KEY).toEqual(["admin-settings"]);
    useAdminSettings();
    const opts = mockUseQuery.mock.calls[0][0];
    expect(opts.queryKey).toEqual([...ADMIN_SETTINGS_QUERY_KEY]);
  });
});
