import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockApiFetch = vi.fn();

vi.mock("@/lib/api/fetch", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { ApiError } from "@/lib/api/fetch";
import { scanQueueApi } from "@/lib/api/scan-queue";

const JOB = {
  id: "3c9d0f11-3333-4f2b-9f7d-1c2d3e4f5a6b",
  kind: "proxy_file",
  state: "pending",
  priority: 5,
  attempts: 0,
  max_attempts: 3,
  repository_id: "1f7a12b4-2222-4f2b-9f7d-1c2d3e4f5a6b",
  target: "alpine/main/x86_64/musl-1.2.5-r0.apk",
  digest: null,
  artifact_id: null,
  last_error: null,
  claimed_by: null,
  created_at: "2026-07-09T10:00:00Z",
  next_attempt_at: "2026-07-09T10:00:00Z",
  claim_expires_at: null,
};

function url(): string {
  return mockApiFetch.mock.calls[0][0] as string;
}

describe("scanQueueApi.list", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({ items: [JOB], depth: [], total: 1 });
  });

  it("passes state and kind through", async () => {
    await scanQueueApi.list({ state: "failed", kind: "hosted_artifact" });
    const q = new URLSearchParams(url().split("?")[1]);
    expect(q.get("state")).toBe("failed");
    expect(q.get("kind")).toBe("hosted_artifact");
  });

  it("parses jobs and depth", async () => {
    mockApiFetch.mockResolvedValue({
      items: [JOB],
      depth: [
        { kind: "proxy_file", state: "pending", jobs: 4, oldest_pending_secs: 12.5 },
      ],
      total: 1,
    });
    const res = await scanQueueApi.list();
    expect(res!.items[0].target).toContain("musl");
    expect(res!.depth[0].oldest_pending_secs).toBe(12.5);
  });

  it("reads a 404 as a backend without the queue, not an error", async () => {
    mockApiFetch.mockRejectedValue(new ApiError(404, ""));
    await expect(scanQueueApi.list()).resolves.toBeNull();
  });

  it("still throws any other failure", async () => {
    mockApiFetch.mockRejectedValue(new ApiError(403, "forbidden"));
    await expect(scanQueueApi.list()).rejects.toThrow("API error 403");
  });

  it("keeps the enabled flag, and tolerates its absence", async () => {
    mockApiFetch.mockResolvedValue({ enabled: false, items: [], depth: [], total: 0 });
    expect((await scanQueueApi.list())?.enabled).toBe(false);
    mockApiFetch.mockResolvedValue({ items: [], depth: [], total: 0 });
    expect((await scanQueueApi.list())?.enabled).toBeUndefined();
  });

  it("accepts a depth row with no pending age", async () => {
    mockApiFetch.mockResolvedValue({
      items: [],
      depth: [{ kind: "proxy_file", state: "running", jobs: 1 }],
      total: 0,
    });
    const res = await scanQueueApi.list();
    expect(res!.depth[0].oldest_pending_secs).toBeUndefined();
  });
});
