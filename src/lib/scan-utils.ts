/**
 * Shared scan status utilities used by both the scan list and scan detail pages.
 */

/**
 * Whether a scan status means findings data should not be trusted.
 *
 * Returns true for failed, error, pending, and running scans. Also returns
 * true for any unknown status value to avoid falsely reporting "Clean" when
 * the status is something the frontend does not recognize.
 */
export function isScanIncomplete(status: string): boolean {
  return status !== "completed";
}

/**
 * Whether the scan ended in an error or failure state (as opposed to still
 * being in progress).
 */
export function isScanFailed(status: string): boolean {
  return status === "failed" || status === "error";
}

/**
 * Whether the scan completed successfully with zero findings, which is the
 * only condition under which we can confidently show "Clean".
 */
export function isScanClean(status: string, findingsCount: number): boolean {
  return status === "completed" && findingsCount === 0;
}
