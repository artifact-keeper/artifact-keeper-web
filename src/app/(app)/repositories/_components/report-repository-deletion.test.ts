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
import { ApiError } from "@/lib/api/fetch";
import { dismissSessionToasts } from "@/lib/session-toasts";
import type { RepositoryDeleteJob } from "@/lib/api/repository-deletions";

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

  it("stops polling when aborted and notes the deletion keeps running (#1190)", async () => {
    const controller = new AbortController();
    const fetchJob = vi.fn().mockImplementation(async () => {
      controller.abort("unmount");
      return job("running");
    });
    await reportRepositoryDeletion("maven-local", job("running"), {
      signal: controller.signal,
      wait: { fetchJob, sleep: noSleep },
    });
    expect(fetchJob).toHaveBeenCalledTimes(1);
    expect(mockToast.info).toHaveBeenCalledWith(
      'Repository "maven-local" is still being deleted',
      expect.objectContaining({ id: "repository-delete-job-1" }),
    );
    expect(mockToast.dismiss).not.toHaveBeenCalled();
  });

  it("drops the toast without reading again when the user signs out (#1190)", async () => {
    const controller = new AbortController();
    controller.abort("logout");
    const fetchJob = vi.fn();
    await reportRepositoryDeletion("maven-local", job("running"), {
      signal: controller.signal,
      wait: { fetchJob, sleep: noSleep },
    });
    expect(fetchJob).not.toHaveBeenCalled();
    expect(mockToast.dismiss).toHaveBeenCalledWith("repository-delete-job-1");
    expect(mockToast.info).not.toHaveBeenCalled();
  });

  it("says the deletion is already running under someone else when its status is hidden (#1191)", async () => {
    const fetchJob = vi.fn().mockRejectedValue(new ApiError(404, "Repository delete job not found"));
    await reportRepositoryDeletion("maven-local", job("running"), { wait: { fetchJob, sleep: noSleep } });
    expect(fetchJob).toHaveBeenCalledTimes(1);
    expect(mockToast.info).toHaveBeenCalledWith(
      'Repository "maven-local" is already being deleted',
      expect.objectContaining({
        id: "repository-delete-job-1",
        description: expect.stringMatching(/someone else started/i),
      }),
    );
    expect(mockToast.info).not.toHaveBeenCalledWith(
      expect.stringMatching(/has started/),
      expect.anything(),
    );
  });

  it.each(["unmount", "logout"])(
    "reports no outcome when stopped (%s) just after the last read finished (#1228)",
    async (reason) => {
      const onCompleted = vi.fn();
      for (const status of ["completed", "failed"]) {
        vi.clearAllMocks();
        const controller = new AbortController();
        const fetchJob = vi.fn().mockImplementation(async () => {
          controller.abort(reason);
          return job(status);
        });
        await reportRepositoryDeletion("maven-local", job("running"), {
          onCompleted,
          signal: controller.signal,
          wait: { fetchJob, sleep: noSleep },
        });
        expect(mockToast.success).not.toHaveBeenCalled();
        expect(mockToast.error).not.toHaveBeenCalled();
        expect(onCompleted).not.toHaveBeenCalled();
        if (reason === "logout") expect(mockToast.dismiss).toHaveBeenCalledWith("repository-delete-job-1");
        else expect(mockToast.info).toHaveBeenCalledWith(
          'Repository "maven-local" is still being deleted',
          expect.objectContaining({ id: "repository-delete-job-1" }),
        );
      }
    },
  );

  it("drops the failed-job toast on sign-out (#1228)", async () => {
    await reportRepositoryDeletion("maven-local", job("failed"), { onRetry: vi.fn() });
    expect(mockToast.error).toHaveBeenCalledWith(
      'Deleting repository "maven-local" failed',
      expect.objectContaining({ id: "repository-delete-job-1" }),
    );
    dismissSessionToasts();
    expect(mockToast.dismiss).toHaveBeenCalledWith("repository-delete-job-1");
    mockToast.dismiss.mockClear();
    dismissSessionToasts();
    expect(mockToast.dismiss).not.toHaveBeenCalled();
  });

  it.each([null, "completed", "failed"])(
    "shows no outcome when the DELETE returns (%s) after sign-out (#1231)",
    async (status) => {
      const controller = new AbortController();
      controller.abort("logout");
      const onRetry = vi.fn();
      await reportRepositoryDeletion("maven-local", status ? job(status) : null, {
        onRetry,
        signal: controller.signal,
      });
      expect(mockToast.success).not.toHaveBeenCalled();
      expect(mockToast.error).not.toHaveBeenCalled();
      expect(mockToast.loading).not.toHaveBeenCalled();
      dismissSessionToasts();
      expect(onRetry).not.toHaveBeenCalled();
    },
  );

  it("stops tracking a failed-job toast the user dismissed (#1228)", async () => {
    await reportRepositoryDeletion("maven-local", job("failed", { id: "job-2" }));
    const { onDismiss } = mockToast.error.mock.calls[0][1] as { onDismiss: () => void };
    onDismiss();
    dismissSessionToasts();
    expect(mockToast.dismiss).not.toHaveBeenCalled();
  });
});
