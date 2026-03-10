/**
 * Centralized error-to-user-message conversion.
 *
 * The generated SDK throws opaque error objects (not Error instances) when a
 * request fails. Page components that test `err instanceof Error` miss these,
 * and string interpolation produces "[object Object]" in toast messages.
 *
 * This utility handles every shape we encounter:
 *  1. Standard Error instances (from apiFetch and manual throws)
 *  2. SDK error objects with an `.error` string property
 *  3. SDK error objects with a `.message` string property
 *  4. Objects with a `.body.message` or `.body.error` string (wrapped HTTP errors)
 *  5. Plain strings
 *  6. Anything else falls back to the provided default message
 */

/**
 * Extract a human-readable message from an unknown thrown value.
 *
 * @param error  - The caught value (could be anything)
 * @param fallback - Fallback message when the error shape is unrecognized
 * @returns A string suitable for display in a toast or error banner
 */
export function toUserMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;

    // SDK errors often carry { error: "some message" }
    if (typeof obj.error === 'string' && obj.error.length > 0) {
      return obj.error;
    }

    // Some SDK responses use { message: "..." }
    if (typeof obj.message === 'string' && obj.message.length > 0) {
      return obj.message;
    }

    // Wrapped HTTP errors: { body: { message: "..." } } or { body: { error: "..." } }
    if (obj.body && typeof obj.body === 'object') {
      const body = obj.body as Record<string, unknown>;
      if (typeof body.message === 'string' && body.message.length > 0) {
        return body.message;
      }
      if (typeof body.error === 'string' && body.error.length > 0) {
        return body.error;
      }
    }
  }

  return fallback;
}
