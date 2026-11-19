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
