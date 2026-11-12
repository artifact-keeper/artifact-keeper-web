import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

const mockApiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const authState = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => authState,
}));

import {
  CAN_LIST_FINDINGS_QUERY_KEY,
  useCanListFindings,
} from "../use-can-list-findings";

function opts() {
  return mockUseQuery.mock.calls.at(-1)![0];
}

describe("useCanListFindings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { is_admin: true };
    mockUseQuery.mockReturnValue({ isSuccess: false });
  });

  it("probes the drill-down endpoint for one row, once per minute, without retrying", async () => {
    useCanListFindings();
    expect(opts().queryKey).toEqual(CAN_LIST_FINDINGS_QUERY_KEY);
    expect(opts().retry).toBe(false);
    expect(opts().staleTime).toBe(60_000);
    await opts().queryFn();
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/admin/security/findings?per_page=1",
      { method: "GET" },
    );
  });

  it("is true for an admin the endpoint answers", () => {
    mockUseQuery.mockReturnValue({ isSuccess: true });
    expect(useCanListFindings()).toBe(true);
  });

  it("is false for a repository-scoped admin the endpoint refuses (403)", () => {
    // retry: false and no data: the query is in error, not success
    mockUseQuery.mockReturnValue({ isSuccess: false, isError: true });
    expect(useCanListFindings()).toBe(false);
  });

  it("never asks for a non-admin, and is false", () => {
    authState.user = { is_admin: false };
    expect(useCanListFindings()).toBe(false);
    expect(opts().enabled).toBe(false);
  });

  it("is false while signed out", () => {
    authState.user = null;
    mockUseQuery.mockReturnValue({ isSuccess: true });
    expect(useCanListFindings()).toBe(false);
    expect(opts().enabled).toBe(false);
  });
});
