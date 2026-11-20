/**
 * Small guards for the sign-in pages (#1153).
 */

/** The one message a rejected password sign-in shows, whatever the cause. */
export const INVALID_CREDENTIALS_MESSAGE = "Invalid username or password";

/**
 * Resolve an SSO provider's `login_url` against the current origin and return
 * it only when it stays on that origin over http(s). Protocol-relative values
 * (`//host`, `/\host`), absolute URLs to another host and `javascript:` URLs
 * return null, so a tampered provider entry cannot turn the login page into
 * an open redirect.
 */
export function sameOriginLoginUrl(
  loginUrl: unknown,
  origin: string = window.location.origin
): string | null {
  if (typeof loginUrl !== "string" || loginUrl.length === 0) return null;
  let url: URL;
  try {
    url = new URL(loginUrl, origin);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.origin !== origin) return null;
  return url.pathname + url.search + url.hash;
}

/**
 * True when a password sign-in failed because the backend refused the
 * credentials: an HTTP 401, which the backend sends as
 * `{ code: "AUTH_ERROR", message }`. Other failures (network, 5xx,
 * validation) keep their own message.
 */
export function isCredentialRejection(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const e = err as { code?: unknown; status?: unknown; body?: unknown };
  if (e.code === "AUTH_ERROR" || e.status === 401) return true;
  if (e.body !== null && typeof e.body === "object") {
    return (e.body as { code?: unknown }).code === "AUTH_ERROR";
  }
  return false;
}

/**
 * Fixed hint shown after repeated rejected sign-ins in this tab (#1239). The
 * backend answers a locked account with the same 401 as a wrong password, so
 * the page cannot know why a sign-in failed and this copy must not guess.
 */
export const REPEATED_FAILURE_HINT =
  "Still can't sign in? Check your username and password, or ask an administrator to reset your password.";

/** Rejected sign-ins in one tab before `REPEATED_FAILURE_HINT` appears. */
export const REPEATED_FAILURE_THRESHOLD = 3;

/**
 * Parse a `Retry-After` value: delta-seconds, or an HTTP-date converted to
 * whole seconds from `now`. Returns undefined when absent or unusable.
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: number = Date.now()
): number | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

/**
 * Like `unwrap`, for the password sign-in calls (local and LDAP). The SDK
 * throws only the response body, and the login rate limiter's 429 body is
 * plain text, so the HTTP status and `Retry-After` header are copied onto the
 * thrown value as `status` and `retryAfter` for the login page to read.
 */
export async function unwrapSignIn<T>(
  result: Promise<
    | { data: T; error: undefined; response?: Response }
    | { data: undefined; error: unknown; response?: Response }
  >
): Promise<T> {
  const { data, error, response } = await result;
  if (!error) return data as T;
  const base: Record<string, unknown> =
    error !== null && typeof error === "object" && !Array.isArray(error)
      ? { ...(error as Record<string, unknown>) }
      : typeof error === "string" && error.length > 0
        ? { message: error }
        : {};
  if (response) {
    base.status = response.status;
    const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
    if (retryAfter !== undefined) base.retryAfter = retryAfter;
  }
  throw base;
}

/**
 * The message for a sign-in refused by the login rate limiter (HTTP 429), or
 * null when the error is something else.
 */
export function rateLimitMessage(err: unknown): string | null {
  if (err === null || typeof err !== "object") return null;
  const e = err as { status?: unknown; retryAfter?: unknown };
  if (e.status !== 429) return null;
  if (typeof e.retryAfter === "number" && e.retryAfter > 0) {
    const n = e.retryAfter;
    return `Too many sign-in attempts. Try again in ${n} second${n === 1 ? "" : "s"}.`;
  }
  return "Too many sign-in attempts. Try again in a moment.";
}
