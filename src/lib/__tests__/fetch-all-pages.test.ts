import { describe, it, expect, vi } from "vitest";
import { fetchAllPages, BACKEND_MAX_PAGE_SIZE } from "../fetch-all-pages";

const page = (n: number, items: number[], totalPages: number, total: number) => ({
  items,
  pagination: { page: n, per_page: 2, total, total_pages: totalPages },
});

describe("fetchAllPages", () => {
  it("returns a single page as is", async () => {
    const fetchPage = vi.fn().mockResolvedValue(page(1, [1, 2], 1, 2));
    const r = await fetchAllPages(fetchPage);
    expect(r).toEqual({ items: [1, 2], total: 2, truncated: false });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("walks every page in order", async () => {
    const pages: Record<number, ReturnType<typeof page>> = {
      1: page(1, [1, 2], 3, 5),
      2: page(2, [3, 4], 3, 5),
      3: page(3, [5], 3, 5),
    };
    const fetchPage = vi.fn(async (n: number) => pages[n]);
    const r = await fetchAllPages(fetchPage);
    expect(r.items).toEqual([1, 2, 3, 4, 5]);
    expect(r.truncated).toBe(false);
    expect(fetchPage.mock.calls.map(([n]) => n)).toEqual([1, 2, 3]);
  });

  it("stops at maxPages and says it was cut short, with the real total", async () => {
    const fetchPage = vi.fn(async (n: number) => page(n, [n], 50, 100));
    const r = await fetchAllPages(fetchPage, { maxPages: 3 });
    expect(r.items).toEqual([1, 2, 3]);
    expect(r.total).toBe(100);
    expect(r.truncated).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("does not report truncation when the last page is exactly the cap", async () => {
    const fetchPage = vi.fn(async (n: number) => page(n, [n], 3, 3));
    expect((await fetchAllPages(fetchPage, { maxPages: 3 })).truncated).toBe(false);
  });

  it("stops early on an empty page instead of looping", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(1, [1], 5, 9))
      .mockResolvedValueOnce(page(2, [], 5, 9));
    const r = await fetchAllPages(fetchPage);
    expect(r.items).toEqual([1]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("propagates a failure on any page", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(1, [1], 2, 2))
      .mockRejectedValueOnce(new Error("boom"));
    await expect(fetchAllPages(fetchPage)).rejects.toThrow("boom");
  });

  it("exposes the backend's page size clamp", () => {
    expect(BACKEND_MAX_PAGE_SIZE).toBe(100);
  });
});
