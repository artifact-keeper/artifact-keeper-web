import { describe, it, expect, vi } from "vitest";
import { runSequentially } from "../bulk-grant";

describe("runSequentially", () => {
  it("runs items one at a time, in order", async () => {
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    await runSequentially(["a", "b", "c"], async (item) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      order.push(item);
      active--;
    });
    expect(order).toEqual(["a", "b", "c"]);
    expect(maxActive).toBe(1);
  });

  it("keeps going after a failure and reports each result", async () => {
    const boom = new Error("boom");
    const results = await runSequentially([1, 2, 3], async (n) => {
      if (n === 2) throw boom;
    });
    expect(results).toEqual([
      { item: 1, ok: true },
      { item: 2, ok: false, error: boom },
      { item: 3, ok: true },
    ]);
  });

  it("reports progress after every item", async () => {
    const onProgress = vi.fn();
    await runSequentially(["a", "b"], async () => {}, onProgress);
    expect(onProgress.mock.calls).toEqual([[1, 2], [2, 2]]);
  });

  it("returns nothing for no items", async () => {
    expect(await runSequentially([], async () => {})).toEqual([]);
  });
});
