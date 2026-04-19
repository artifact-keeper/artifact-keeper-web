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

/** Return the value if it is a non-empty string, otherwise undefined. */
function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Check whether a value is a non-null object (not an array). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Detect whether an error indicates an account lockout.
 *
 * The backend returns `AppError::Authentication` with the message
 * "Account temporarily locked due to too many failed login attempts"
 * for locked accounts (HTTP 401, code "AUTH_ERROR"). This function
 * checks every error shape that `toUserMessage` handles for the
 * word "locked", which is present in all lockout-related messages
 * but absent from normal credential failures.
 */
export function isAccountLocked(error: unknown): boolean {
  const LOCKOUT_PATTERN = 'locked';

  function containsLockout(value: unknown): boolean {
    return typeof value === 'string' && value.toLowerCase().includes(LOCKOUT_PATTERN);
  }

  if (containsLockout(error)) return true;

  if (error instanceof Error) {
    return containsLockout(error.message);
  }

  if (!isPlainObject(error)) return false;

  if (containsLockout(error.error)) return true;
  if (containsLockout(error.message)) return true;
  if (containsLockout(error.code)) return true;

  if (isPlainObject(error.body)) {
    if (containsLockout(error.body.message)) return true;
    if (containsLockout(error.body.error)) return true;
    if (containsLockout(error.body.code)) return true;
  }

  return false;
}

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

  if (!isPlainObject(error)) {
    return fallback;
  }

  // SDK errors often carry { error: "some message" }
  const errorField = nonEmptyString(error.error);
  if (errorField) return errorField;

  // Some SDK responses use { message: "..." }
  const messageField = nonEmptyString(error.message);
  if (messageField) return messageField;

  // Wrapped HTTP errors: { body: { message: "..." } } or { body: { error: "..." } }
  if (isPlainObject(error.body)) {
    const bodyMessage = nonEmptyString(error.body.message);
    if (bodyMessage) return bodyMessage;

    const bodyError = nonEmptyString(error.body.error);
    if (bodyError) return bodyError;
  }

  return fallback;
}
