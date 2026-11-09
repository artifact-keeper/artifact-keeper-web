export interface BulkResult<T> {
  item: T;
  ok: boolean;
  error?: unknown;
}

/**
 * Run `run` for each item one after another, never stopping on a failure and
 * never rolling back the ones that succeeded. Sequential on purpose: the
 * backend has no batch endpoint, and a burst of parallel grants would only
 * make per-item errors harder to attribute.
 */
export async function runSequentially<T>(
  items: readonly T[],
  run: (item: T) => Promise<unknown>,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkResult<T>[]> {
  const results: BulkResult<T>[] = [];
  for (const item of items) {
    try {
      await run(item);
      results.push({ item, ok: true });
    } catch (error) {
      results.push({ item, ok: false, error });
    }
    onProgress?.(results.length, items.length);
  }
  return results;
}
