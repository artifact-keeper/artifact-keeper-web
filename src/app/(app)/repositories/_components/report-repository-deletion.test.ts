import { describe, it, expect, vi, beforeEach } from "vitest";

const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  loading: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: mockToast }));

import { reportRepositoryDeletion } from "./report-repository-deletion";
import type { RepositoryDeleteJob } from "@/lib/api/repository-deletions";
import { endSession } from "@/lib/session-signal";

const job = (status: string, extra: Partial<RepositoryDeleteJob> = {}): RepositoryDeleteJob => ({
  id: "job-1",
  status,
  repository_key: "maven-local",
  ...extra,
});
const noSleep = () => Promise.resolve();

describe("reportRepositoryDeletion (#1048)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says deleted for a 1.11.x backend that deletes synchronously", async () => {
    await reportRepositoryDeletion("maven-local", null);
    expect(mockToast.success).toHaveBeenCalledWith("Repository deleted");
    expect(mockToast.loading).not.toHaveBeenCalled();
  });

  it("says the deletion has started for a 202 job, then reports completion", async () => {
    const onCompleted = vi.fn();
    const fetchJob = vi.fn().mockResolvedValue(job("completed"));
    await reportRepositoryDeletion("maven-local", job("pending"), {
      onCompleted,
      wait: { fetchJob, sleep: noSleep },
    });
    expect(mockToast.loading).toHaveBeenCalledWith(
      'Deleting repository "maven-local"...',
      expect.objectContaining({
        id: "repository-delete-job-1",
        description: expect.stringMatching(/has started/),
      }),
    );
    expect(mockToast.success).toHaveBeenCalledWith(
      'Repository "maven-local" deleted',
      expect.objectContaining({ id: "repository-delete-job-1" }),
    );
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("reports a failed job with its error and a retry that deletes again", async () => {
    const onRetry = vi.fn();
    const fetchJob = vi.fn().mockResolvedValue(job("failed", { error_summary: "storage offline" }));
    await reportRepositoryDeletion("maven-local", job("running"), {
      onRetry,
      wait: { fetchJob, sleep: noSleep },
    });
    expect(mockToast.success).not.toHaveBeenCalled();
    const [title, opts] = mockToast.error.mock.calls[0];
    expect(title).toBe('Deleting repository "maven-local" failed');
    expect(opts).toMatchObject({
      id: "repository-delete-job-1",
      description: "storage offline",
      duration: Infinity,
    });
    opts.action.onClick();
    expect(onRetry).toHaveBeenCalledWith("maven-local");
  });

  it("retries under the key the delete was first requested with", async () => {
    const onRetry = vi.fn();
    await reportRepositoryDeletion("renamed", job("failed", { repository_key: "maven-local" }), { onRetry });
    mockToast.error.mock.calls[0][1].action.onClick();
    expect(onRetry).toHaveBeenCalledWith("maven-local");
  });

  it("reuses the job's toast when a repeated DELETE returns the running job", async () => {
    const fetchJob = vi.fn().mockResolvedValue(job("completed"));
    await reportRepositoryDeletion("maven-local", job("running"), { wait: { fetchJob, sleep: noSleep } });
    await reportRepositoryDeletion("maven-local", job("running"), { wait: { fetchJob, sleep: noSleep } });
    const ids = mockToast.loading.mock.calls.map(([, o]) => o.id);
    expect(new Set(ids)).toEqual(new Set(["repository-delete-job-1"]));
  });

  it("says the deletion has started when its progress cannot be read", async () => {
    const fetchJob = vi.fn().mockRejectedValue(new Error("404"));
    await reportRepositoryDeletion("maven-local", job("running"), { wait: { fetchJob, sleep: noSleep } });
    expect(mockToast.info).toHaveBeenCalledWith(
      'Deletion of repository "maven-local" has started',
      expect.objectContaining({ id: "repository-delete-job-1" }),
    );
    expect(mockToast.error).not.toHaveBeenCalled();
  });
});

describe("reportRepositoryDeletion after sign-out (#1190)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stops polling and drops the toast when the session ends", async () => {
    const fetchJob = vi.fn().mockImplementation(async () => {
      endSession();
      return job("running");
    });
    await reportRepositoryDeletion("maven-local", job("pending"), { wait: { fetchJob, sleep: noSleep } });
    expect(fetchJob).toHaveBeenCalledTimes(1);
    expect(mockToast.dismiss).toHaveBeenCalledWith("repository-delete-job-1");
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(mockToast.info).not.toHaveBeenCalled();
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("does not report a read failure caused by the sign-out", async () => {
    const fetchJob = vi.fn().mockImplementation(async () => {
      endSession();
      throw new Error("401");
    });
    await reportRepositoryDeletion("maven-local", job("running"), {
      wait: { fetchJob, sleep: noSleep, maxReadErrors: 1 },
    });
    expect(mockToast.dismiss).toHaveBeenCalledWith("repository-delete-job-1");
    expect(mockToast.info).not.toHaveBeenCalled();
  });

  it("keeps polling for the next session after an earlier sign-out", async () => {
    endSession();
    const fetchJob = vi.fn().mockResolvedValue(job("completed"));
    await reportRepositoryDeletion("maven-local", job("running"), { wait: { fetchJob, sleep: noSleep } });
    expect(mockToast.success).toHaveBeenCalledWith(
      'Repository "maven-local" deleted',
      expect.objectContaining({ id: "repository-delete-job-1" }),
    );
    expect(mockToast.dismiss).not.toHaveBeenCalled();
  });

  it("stops when the caller's own signal aborts", async () => {
    const controller = new AbortController();
    const fetchJob = vi.fn().mockImplementation(async () => {
      controller.abort();
      return job("running");
    });
    await reportRepositoryDeletion("maven-local", job("pending"), {
      signal: controller.signal,
      wait: { fetchJob, sleep: noSleep },
    });
    expect(fetchJob).toHaveBeenCalledTimes(1);
    expect(mockToast.dismiss).toHaveBeenCalledWith("repository-delete-job-1");
  });
});
