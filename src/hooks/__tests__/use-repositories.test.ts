import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

const mockList = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: {
    list: (...args: unknown[]) => mockList(...args),
  },
}));

import { repositoryListKey, useRepositories } from "../use-repositories";
import { QUERY_KEYS } from "@/lib/query-keys";

describe("repositoryListKey", () => {
  it("scopes the key under the canonical repositories prefix", () => {
    expect(repositoryListKey({ per_page: 100 })).toEqual([
      "repositories",
      { per_page: 100 },
    ]);
  });

  it("defaults to an empty params object", () => {
    expect(repositoryListKey()).toEqual(["repositories", {}]);
  });

  it("shares the QUERY_KEYS.REPOSITORIES prefix so prefix invalidation matches (#669)", () => {
    const key = repositoryListKey({ per_page: 1000 });
    expect(key[0]).toBe(QUERY_KEYS.REPOSITORIES[0]);
  });
});

describe("useRepositories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({ data: undefined });
  });

  it("calls useQuery with the param-scoped key", () => {
    useRepositories({ per_page: 1000 });
    expect(mockUseQuery).toHaveBeenCalledTimes(1);
    const opts = mockUseQuery.mock.calls[0][0];
    expect(opts.queryKey).toEqual(["repositories", { per_page: 1000 }]);
  });

  it("passes the params through to repositoriesApi.list", () => {
    const params = { per_page: 200, repo_type: "local", format: "maven" };
    useRepositories(params);
    const opts = mockUseQuery.mock.calls[0][0];
    opts.queryFn();
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockList).toHaveBeenCalledWith(params);
  });

  it("defaults params to an empty object", () => {
    useRepositories();
    const opts = mockUseQuery.mock.calls[0][0];
    expect(opts.queryKey).toEqual(["repositories", {}]);
    opts.queryFn();
    expect(mockList).toHaveBeenCalledWith({});
  });

  it("forwards the enabled option and leaves it undefined otherwise", () => {
    useRepositories({ per_page: 100 }, { enabled: false });
    expect(mockUseQuery.mock.calls[0][0].enabled).toBe(false);

    useRepositories({ per_page: 100 });
    expect(mockUseQuery.mock.calls[1][0].enabled).toBeUndefined();
  });

  it("returns the useQuery result unchanged", () => {
    const result = { data: { items: [], pagination: {} }, isLoading: false };
    mockUseQuery.mockReturnValue(result);
    expect(useRepositories({ per_page: 5 })).toBe(result);
  });
});
