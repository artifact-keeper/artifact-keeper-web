import { describe, it, expect, vi } from "vitest";
import { refreshReplicationDashboard } from "./refresh";

describe("refreshReplicationDashboard (#841)", () => {
  it("re-reads peers, subscriptions and connections", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    await refreshReplicationDashboard({ invalidateQueries });
    const keys = invalidateQueries.mock.calls.map(([o]) => o.queryKey);
    expect(keys).toEqual([["peers"], ["peer-repos"], ["peer-connections"]]);
  });
});
