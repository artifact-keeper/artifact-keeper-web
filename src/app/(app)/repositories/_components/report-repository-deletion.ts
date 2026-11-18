import { toast } from "sonner";
import {
  waitForRepositoryDeletion,
  type RepositoryDeleteJob,
  type WaitForDeletionOptions,
} from "@/lib/api/repository-deletions";

export interface ReportRepositoryDeletionOptions {
  /** Called once the job completes, to refresh the repository queries. */
  onCompleted?: () => void;
  /** Delete the repository again; a DELETE after a failed job starts a new one. */
  onRetry?: (key: string) => void;
  /** Passed through to the poller (tests). */
  wait?: WaitForDeletionOptions;
  /**
   * Stops polling (#1190). Abort with `"logout"` when the user signs out (the
   * toast is dismissed); any other reason, such as leaving the page, leaves a
   * note that the deletion keeps running in the background.
   */
  signal?: AbortSignal;
}

/** The abort reason that drops the toast instead of leaving a note (#1190). */
export const DELETION_REPORT_LOGOUT = "logout";

function reportFailure(
  key: string,
  job: RepositoryDeleteJob,
  toastId: string,
  onRetry?: (key: string) => void,
) {
  toast.error(`Deleting repository "${key}" failed`, {
    id: toastId,
    description:
      job.error_summary || "The background deletion job failed. Delete the repository again to retry.",
    // The only place a failed job shows: the backend hides the renamed
    // repository and lists no jobs, so keep it until the user dismisses it.
    duration: Infinity,
    action: onRetry ? { label: "Retry", onClick: () => onRetry(key) } : undefined,
  });
}

/**
 * Tell the user how a repository delete went (#1048).
 *
 * A 1.11.x backend deletes synchronously (no job). A 1.12.0+ backend answers
 * 202 with a background job: show that the deletion has started, poll the
 * job, and replace the toast with the outcome. The toast id is the job id, so
 * a repeated DELETE that the backend answers with the same running job
 * updates the same toast instead of stacking a second one.
 */
export async function reportRepositoryDeletion(
  key: string,
  job: RepositoryDeleteJob | null,
  { onCompleted, onRetry, wait, signal }: ReportRepositoryDeletionOptions = {},
): Promise<void> {
  if (!job || job.status === "completed") {
    toast.success("Repository deleted");
    return;
  }
  // The key the repository had when the delete was first requested; the
  // backend resolves a repeated DELETE of it to this job.
  const repoKey = job.repository_key || key;
  const toastId = `repository-delete-${job.id}`;
  if (job.status === "failed") {
    reportFailure(repoKey, job, toastId, onRetry);
    return;
  }

  toast.loading(`Deleting repository "${repoKey}"...`, {
    id: toastId,
    description: "The deletion has started and runs in the background.",
  });

  let final: RepositoryDeleteJob;
  try {
    final = await waitForRepositoryDeletion(job, { ...wait, signal });
  } catch {
    if (signal?.aborted) {
      if (signal.reason === DELETION_REPORT_LOGOUT) {
        toast.dismiss(toastId);
      } else {
        toast.info(`Repository "${repoKey}" is still being deleted`, {
          id: toastId,
          description: "The deletion keeps running in the background.",
        });
      }
      return;
    }
    toast.info(`Deletion of repository "${repoKey}" has started`, {
      id: toastId,
      description: "Its progress could not be read. It keeps running in the background.",
    });
    return;
  }

  if (final.status === "completed") {
    onCompleted?.();
    toast.success(`Repository "${repoKey}" deleted`, { id: toastId, description: undefined });
  } else if (final.status === "failed") {
    reportFailure(repoKey, final, toastId, onRetry);
  } else {
    toast.info(`Repository "${repoKey}" is still being deleted`, {
      id: toastId,
      description: "The deletion keeps running in the background.",
    });
  }
}
