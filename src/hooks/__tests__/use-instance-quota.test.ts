import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockGetStats = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/admin", () => ({
  adminApi: { getStats: () => mockGetStats() },
}));

const mockQuotaGet = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/quota", () => ({
  quotaApi: { get: () => mockQuotaGet() },
  quotaKeys: { system: ["system-quota"] },
}));

import { useInstanceQuota } from "../use-instance-quota";

const QUOTA = { storage: null, transfer: null, maxUploadBytes: 10, helpUrl: null };

function answer(byKey: Record<string, unknown>) {
  mockUseQuery.mockImplementation((opts: { queryKey: string[] }) => ({ data: byKey[opts.queryKey[0]] }));
}

function optsFor(key: string) {
  return mockUseQuery.mock.calls.map((c) => c[0]).find((o) => o.queryKey[0] === key);
}

describe("useInstanceQuota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads administrators' quotas from the shared admin-stats query", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: { is_admin: true } });
    answer({ "admin-stats": { quota: QUOTA }, "system-quota": { ...QUOTA, maxUploadBytes: 99 } });
    expect(useInstanceQuota()).toBe(QUOTA);
    expect(optsFor("admin-stats").enabled).toBe(true);
    expect(optsFor("system-quota").enabled).toBe(false);
    optsFor("admin-stats").queryFn();
    expect(mockGetStats).toHaveBeenCalled();
  });

  it("reads everyone else's quotas from /system/quota", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: { is_admin: false } });
    answer({ "system-quota": QUOTA });
    expect(useInstanceQuota()).toBe(QUOTA);
    expect(optsFor("admin-stats").enabled).toBe(false);
    expect(optsFor("system-quota")).toMatchObject({ enabled: true, retry: false });
    optsFor("system-quota").queryFn();
    expect(mockQuotaGet).toHaveBeenCalled();
  });

  it("is null for an older backend and for anonymous visitors", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: { is_admin: true } });
    answer({ "admin-stats": { total_users: 1 } });
    expect(useInstanceQuota()).toBeNull();

    mockUseAuth.mockReturnValue({ isAuthenticated: false, user: null });
    answer({ "system-quota": QUOTA });
    expect(useInstanceQuota()).toBeNull();
  });
});
