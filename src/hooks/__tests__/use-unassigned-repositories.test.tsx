// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockList = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: { list: (...args: unknown[]) => mockList(...args) },
}));

import { useUnassignedRepositories } from "../use-repositories";

const repo = (key: string, projectId?: string) => ({ id: key, key, project_id: projectId });

/** A backend that serves `all` 100 to a page, like the real one. */
function serve(all: ReturnType<typeof repo>[]) {
  mockList.mockImplementation(async ({ page = 1, per_page = 100 }: { page?: number; per_page?: number }) => {
    const size = Math.min(per_page, 100);
    const totalPages = Math.max(1, Math.ceil(all.length / size));
    return {
      items: all.slice((page - 1) * size, page * size),
      pagination: { page, per_page: size, total: all.length, total_pages: totalPages },
    };
  });
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockList.mockReset();
});

describe("useUnassignedRepositories", () => {
  it("keeps only repositories without a project", async () => {
    serve([repo("a"), repo("b", "p1"), repo("c"), repo("d", "p2")]);
    const { result } = renderHook(() => useUnassignedRepositories({}, 1, 50), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.items.map((r) => r.key)).toEqual(["a", "c"]);
    expect(result.current.data!.pagination.total).toBe(2);
  });

  it("finds unassigned repositories beyond the backend's 100-per-page clamp", async () => {
    // 250 repositories: the last 5 are the only unassigned ones, on page 3.
    const all = Array.from({ length: 250 }, (_, i) => repo(`r${i}`, i >= 245 ? undefined : "p1"));
    serve(all);
    const { result } = renderHook(() => useUnassignedRepositories({}, 1, 50), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.items.map((r) => r.key)).toEqual(["r245", "r246", "r247", "r248", "r249"]);
    expect(mockList.mock.calls.map(([p]) => p.page)).toEqual([1, 2, 3]);
    expect(mockList.mock.calls.every(([p]) => p.per_page === 100)).toBe(true);
    expect(result.current.truncated).toBe(false);
  });

  it("pages the result locally", async () => {
    serve(Array.from({ length: 7 }, (_, i) => repo(`r${i}`)));
    const { result } = renderHook(() => useUnassignedRepositories({}, 2, 3), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.items.map((r) => r.key)).toEqual(["r3", "r4", "r5"]);
    expect(result.current.data!.pagination).toEqual({ page: 2, per_page: 3, total: 7, total_pages: 3 });
  });

  it("passes the other filters through to every request", async () => {
    serve([repo("a")]);
    const { result } = renderHook(
      () => useUnassignedRepositories({ format: "npm", repo_type: "local", q: "lib" }, 1, 50),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockList).toHaveBeenCalledWith({ format: "npm", repo_type: "local", q: "lib", page: 1, per_page: 100 });
  });

  it("says so when the scan stopped before the end, instead of passing off a partial list", async () => {
    // 2500 repositories is 25 pages; the scan stops at 20.
    serve(Array.from({ length: 2500 }, (_, i) => repo(`r${i}`)));
    const { result } = renderHook(() => useUnassignedRepositories({}, 1, 50), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.truncated).toBe(true);
    expect(result.current.scanned).toBe(2000);
    expect(result.current.total).toBe(2500);
    expect(mockList).toHaveBeenCalledTimes(20);
  });

  it("does nothing while disabled", () => {
    serve([repo("a")]);
    renderHook(() => useUnassignedRepositories({}, 1, 50, { enabled: false }), { wrapper: wrapper() });
    expect(mockList).not.toHaveBeenCalled();
  });
});
