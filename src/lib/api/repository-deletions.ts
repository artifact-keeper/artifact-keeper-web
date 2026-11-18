import { z } from "zod";
import { apiFetch } from "@/lib/api/fetch";

/**
 * Repository delete jobs (backend artifact-keeper#4311, 1.12.0).
 *
 * From 1.12.0, `DELETE /api/v1/repositories/{key}` answers `202 Accepted` with
 * a job: the repository is renamed out of the way at once and a background
 * worker removes its rows and objects. `GET /api/v1/repository-deletions/{id}`
 * reports the job in the shape of a migration job. A repeated DELETE of the
 * same key while the job runs returns the same job; after a failed job it
 * starts a new one. Older backends answer 200 or 204 with no job (#1048).
 */
const repositoryDeleteJobSchema = z.object({
  id: z.string(),
  /** `pending`, `running`, `completed` or `failed`. */
  status: z.string(),
  phase: z.string().nullish(),
  /** The key the repository had when its delete was requested. */
  repository_key: z.string(),
  progress_percent: z.number().nullish(),
  error_summary: z.string().nullish(),
  status_url: z.string().nullish(),
});

export type RepositoryDeleteJob = z.infer<typeof repositoryDeleteJobSchema>;

/** A job in one of these states will not change any more. */
export function isTerminalDeleteJob(job: RepositoryDeleteJob): boolean {
  return job.status === "completed" || job.status === "failed";
}

/**
 * The job a repository DELETE answered with, or `null` when the body is not
 * one: a 1.11.x backend deletes synchronously and answers 200/204 with no
 * job, so `null` means the repository is already gone.
 */
export function parseRepositoryDeleteJob(body: unknown): RepositoryDeleteJob | null {
  const parsed = repositoryDeleteJobSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export const repositoryDeletionsApi = {
  get: async (id: string, signal?: AbortSignal): Promise<RepositoryDeleteJob> => {
    const body = await apiFetch<unknown>(
      `/api/v1/repository-deletions/${encodeURIComponent(id)}`,
      signal ? { signal } : undefined,
    );
    const job = parseRepositoryDeleteJob(body);
    if (!job) throw new Error("Unexpected repository delete job response");
    return job;
  },
};

export interface WaitForDeletionOptions {
  /** Read the job; defaults to `repositoryDeletionsApi.get`. */
  fetchJob?: (id: string, signal?: AbortSignal) => Promise<RepositoryDeleteJob>;
  /** Defaults to a `setTimeout` promise that `signal` cuts short; injectable for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /**
   * Stops the poller (#1190): once aborted, no further read is made and the
   * wait rejects with the signal's reason. The page aborts it when it
   * unmounts or the user signs out.
   */
  signal?: AbortSignal;
  /** First poll delay; doubles up to `maxIntervalMs`. */
  intervalMs?: number;
  maxIntervalMs?: number;
  /** Give up (resolve with the last job seen) after this long. */
  timeoutMs?: number;
  /** Consecutive failed reads tolerated before the error is thrown. */
  maxReadErrors?: number;
  now?: () => number;
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Poll a delete job until it completes or fails. Resolves with the terminal
 * job, or with the last job seen (still `pending`/`running`) once `timeoutMs`
 * passes. Throws when the job cannot be read `maxReadErrors` times in a row,
 * and with the signal's reason once `signal` aborts.
 */
export async function waitForRepositoryDeletion(
  job: RepositoryDeleteJob,
  {
    fetchJob = repositoryDeletionsApi.get,
    sleep = abortableSleep,
    intervalMs = 1000,
    maxIntervalMs = 10_000,
    timeoutMs = 30 * 60_000,
    maxReadErrors = 3,
    now = Date.now,
    signal,
  }: WaitForDeletionOptions = {},
): Promise<RepositoryDeleteJob> {
  const deadline = now() + timeoutMs;
  let current = job;
  let delay = intervalMs;
  let readErrors = 0;
  while (!isTerminalDeleteJob(current) && now() < deadline) {
    signal?.throwIfAborted();
    await sleep(delay, signal);
    signal?.throwIfAborted();
    delay = Math.min(delay * 2, maxIntervalMs);
    try {
      current = await fetchJob(current.id, signal);
      readErrors = 0;
    } catch (error) {
      signal?.throwIfAborted();
      readErrors += 1;
      if (readErrors >= maxReadErrors) throw error;
    }
  }
  return current;
}
