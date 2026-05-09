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
 *  4. FastAPI-style errors with a `.detail` string property
 *  5. Objects with `.body.message`, `.body.error`, or `.body.detail` (wrapped HTTP errors)
 *  6. Plain strings
 *  7. Anything else falls back to the provided default message
 */

import { toast } from "sonner";

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
 * phrase "account locked" or "account_locked", which is specific to
 * lockout messages and avoids false positives from unrelated errors
 * like "Repository is locked for maintenance".
 */
export function isAccountLocked(error: unknown): boolean {
  const LOCKOUT_PATTERN = /account[\s_]+(temporarily\s+)?locked/i;

  function containsLockout(value: unknown): boolean {
    return typeof value === 'string' && LOCKOUT_PATTERN.test(value);
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

  // FastAPI's default error shape is { detail: "..." }. The plugins install
  // path on the backend uses this; without explicit handling the toast falls
  // through to the fallback even when the backend supplied a useful message.
  const detailField = nonEmptyString(error.detail);
  if (detailField) return detailField;

  // Wrapped HTTP errors: { body: { message | error | detail: "..." } }
  if (isPlainObject(error.body)) {
    const bodyMessage = nonEmptyString(error.body.message);
    if (bodyMessage) return bodyMessage;

    const bodyError = nonEmptyString(error.body.error);
    if (bodyError) return bodyError;

    const bodyDetail = nonEmptyString(error.body.detail);
    if (bodyDetail) return bodyDetail;
  }

  return fallback;
}

/**
 * Patterns the backend uses when rejecting a password that was recently used.
 * Kept as a single source of truth so both the change-password page and
 * the profile security tab can detect this specific error.
 */
const PASSWORD_REUSE_PATTERNS = [
  'password history',
  'previously used',
  'recently used',
  'password reuse',
  'password was used',
  'already been used',
];

/**
 * User-facing message shown when the backend rejects a password due to
 * password history rules.
 */
export const PASSWORD_REUSE_MESSAGE =
  'This password was used recently. Please choose a different password.';

/**
 * Check whether an error from the backend indicates the submitted password
 * was rejected because it matches a recently used password.
 *
 * Works with any error shape accepted by `toUserMessage`: Error instances,
 * SDK error objects, wrapped HTTP errors, and plain strings.
 */
export function isPasswordReuseError(error: unknown): boolean {
  const msg = toUserMessage(error, '').toLowerCase();
  return PASSWORD_REUSE_PATTERNS.some((pattern) => msg.includes(pattern));
}

/**
 * Returns a TanStack Query `onError` handler that toasts the backend error
 * via toUserMessage with the given fallback label. Shorthand for the
 * pattern that appears in ~125 mutation callsites.
 *
 * @example
 *   onError: mutationErrorToast("Failed to delete repository"),
 */
export const mutationErrorToast = (label: string) =>
  (err: unknown) => {
    toast.error(toUserMessage(err, label));
  };
