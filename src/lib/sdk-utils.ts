/**
 * Helpers for working with the generated `@artifact-keeper/sdk` call results.
 *
 * SDK functions (responseStyle: 'fields', throwOnError: false) resolve to a
 * discriminated union of `{ data: T; error: undefined }` on success and
 * `{ data: undefined; error: E }` on failure. `unwrap` collapses that union
 * into a plain promise: it throws the SDK error object on failure and returns
 * the data on success, replacing the hand-rolled destructure-and-throw
 * pattern that was repeated hundreds of times across `lib/api` and pages
 * (#678).
 *
 * The thrown value is the raw SDK error object (not an `Error` instance) —
 * same as the pattern this replaces. Use `toUserMessage` from
 * `@/lib/error-utils` to render it.
 */
export async function unwrap<T>(
  result: Promise<{ data: T; error: undefined } | { data: undefined; error: unknown }>,
): Promise<T> {
  const { data, error } = await result;
  if (error) throw error;
  // `error` is typed `unknown`, so the falsy check can't narrow the union for
  // us; when it is falsy the SDK guarantees the success member.
  return data as T;
}
