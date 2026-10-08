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
export function isScanClean(
  status: string,
  findingsCount: number,
  completeness?: string | null,
): boolean {
  return (
    status === "completed" &&
    findingsCount === 0 &&
    !isScanNotCataloged(status, completeness)
  );
}

/**
 * Whether a completed scan cataloged nothing although the format expects a
 * catalog (backend artifact-keeper#4154, `scan_completeness:
 * "not_cataloged"`). Its zero findings mean "nothing was assessed", never
 * "clean". Older backends send no completeness and read as false.
 */
export function isScanNotCataloged(
  status: string,
  completeness?: string | null,
): boolean {
  return status === "completed" && completeness === "not_cataloged";
}

/** Short user-facing explanation for a not-cataloged scan. */
export const NOT_CATALOGED_EXPLANATION =
  "The scanner could not catalog this package's contents, so nothing was assessed. Zero findings here is not a clean result.";
