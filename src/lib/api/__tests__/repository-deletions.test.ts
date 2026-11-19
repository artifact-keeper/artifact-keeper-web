import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();
vi.mock("../fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../fetch")>()),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { ApiError } from "../fetch";

import {
  parseRepositoryDeleteJob,
  repositoryDeletionsApi,
  waitForRepositoryDeletion,
  type RepositoryDeleteJob,
} from "../repository-deletions";

const job = (status: string, extra: Partial<RepositoryDeleteJob> = {}): RepositoryDeleteJob => ({
  id: "job-1",
  status,
  phase: "delete_rows",
  repository_key: "maven-local",
  progress_percent: 10,
  error_summary: null,
  status_url: "/api/v1/repository-deletions/job-1",
  ...extra,
});

const noSleep = () => Promise.resolve();

describe("parseRepositoryDeleteJob (#1048)", () => {
  it("reads the 202 job body from backend 1.12.0", () => {
    expect(parseRepositoryDeleteJob({ ...job("pending"), job_type: "repository_delete" })).toMatchObject({
      id: "job-1",
      status: "pending",
      repository_key: "maven-local",
    });
  });

  it("is null for the empty 200/204 body of a 1.11.x backend", () => {
    expect(parseRepositoryDeleteJob(undefined)).toBeNull();
    expect(parseRepositoryDeleteJob("")).toBeNull();
    expect(parseRepositoryDeleteJob({})).toBeNull();
  });
});

describe("repositoryDeletionsApi.get", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the job status endpoint", async () => {
    mockApiFetch.mockResolvedValue(job("running"));
    await expect(repositoryDeletionsApi.get("job-1")).resolves.toMatchObject({ status: "running" });
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/repository-deletions/job-1", undefined);
  });

  it("passes an abort signal to the request (#1190)", async () => {
    mockApiFetch.mockResolvedValue(job("running"));
    const { signal } = new AbortController();
    await repositoryDeletionsApi.get("job-1", signal);
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/repository-deletions/job-1", { signal });
  });

  it("throws on a body that is not a job", async () => {
    mockApiFetch.mockResolvedValue({ unexpected: true });
    await expect(repositoryDeletionsApi.get("job-1")).rejects.toThrow();
  });
});

describe("waitForRepositoryDeletion (#1048)", () => {
  it("polls until the job completes", async () => {
    const fetchJob = vi
      .fn()
      .mockResolvedValueOnce(job("running"))
      .mockResolvedValueOnce(job("completed"));
    const final = await waitForRepositoryDeletion(job("pending"), { fetchJob, sleep: noSleep });
    expect(final.status).toBe("completed");
    expect(fetchJob).toHaveBeenCalledTimes(2);
    expect(fetchJob).toHaveBeenCalledWith("job-1", undefined);
  });

  it("returns a failed job", async () => {
    const fetchJob = vi.fn().mockResolvedValue(job("failed", { error_summary: "storage offline" }));
    const final = await waitForRepositoryDeletion(job("running"), { fetchJob, sleep: noSleep });
    expect(final).toMatchObject({ status: "failed", error_summary: "storage offline" });
  });

  it("does not poll a job that is already terminal", async () => {
    const fetchJob = vi.fn();
    await waitForRepositoryDeletion(job("completed"), { fetchJob, sleep: noSleep });
    expect(fetchJob).not.toHaveBeenCalled();
  });

  it("tolerates a transient read error, then throws after repeated ones", async () => {
    const flaky = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(job("completed"));
    await expect(
      waitForRepositoryDeletion(job("running"), { fetchJob: flaky, sleep: noSleep }),
    ).resolves.toMatchObject({ status: "completed" });

    const broken = vi.fn().mockRejectedValue(new Error("gone"));
    await expect(
      waitForRepositoryDeletion(job("running"), { fetchJob: broken, sleep: noSleep, maxReadErrors: 3 }),
    ).rejects.toThrow("gone");
    expect(broken).toHaveBeenCalledTimes(3);
  });

  it("gives up with the last job seen after the timeout, backing off between polls", async () => {
    let clock = 0;
    const delays: number[] = [];
    const sleep = (ms: number) => {
      delays.push(ms);
      clock += ms;
      return Promise.resolve();
    };
    const fetchJob = vi.fn().mockResolvedValue(job("running"));
    const final = await waitForRepositoryDeletion(job("running"), {
      fetchJob,
      sleep,
      now: () => clock,
      intervalMs: 1000,
      maxIntervalMs: 4000,
      timeoutMs: 15_000,
    });
    expect(final.status).toBe("running");
    expect(delays).toEqual([1000, 2000, 4000, 4000, 4000]);
  });

  it("stops polling once the signal aborts (#1190)", async () => {
    const controller = new AbortController();
    const fetchJob = vi.fn().mockImplementation(async () => {
      controller.abort("logout");
      return job("running");
    });
    await expect(
      waitForRepositoryDeletion(job("running"), { fetchJob, sleep: noSleep, signal: controller.signal }),
    ).rejects.toBe("logout");
    expect(fetchJob).toHaveBeenCalledTimes(1);
  });

  it("cuts the default sleep short when the signal aborts (#1190)", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const fetchJob = vi.fn();
      const wait = waitForRepositoryDeletion(job("running"), {
        fetchJob,
        intervalMs: 60_000,
        signal: controller.signal,
      });
      controller.abort("unmount");
      await expect(wait).rejects.toBe("unmount");
      expect(fetchJob).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws at once when the job is not visible to the caller (#1191)", async () => {
    const hidden = vi.fn().mockRejectedValue(new ApiError(404, "Repository delete job not found"));
    await expect(
      waitForRepositoryDeletion(job("running"), { fetchJob: hidden, sleep: noSleep, maxReadErrors: 3 }),
    ).rejects.toMatchObject({ status: 404 });
    expect(hidden).toHaveBeenCalledTimes(1);
  });
});
