/**
 * Tab-unfreeze mitigations for cookie-based auth (#558).
 *
 * Chromium can fire the first request(s) after a frozen tab reactivates
 * BEFORE the cookie store reattaches. The request then goes out without a
 * Cookie header and fails with a 401 even though the session cookies are
 * still present. Two defenses live here:
 *
 * - `recentlyBecameVisible()` lets the 401 interceptor in sdk-client.ts
 *   distinguish "session really expired" from "tab just unfroze" and retry
 *   the token refresh once before redirecting to /login.
 * - `initTabUnfreezeGuards()` fires a disposable warm-up request when the
 *   tab becomes visible so the cookieless first request is absorbed by
 *   /auth/me instead of a real data query (e.g. TanStack Query's
 *   refetchOnWindowFocus).
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/** How long after a visibilitychange→visible a failed refresh is suspect. */
export const UNFREEZE_WINDOW_MS = 5_000;
/** Delay before the retried refresh, giving the cookie store time to reattach. */
export const UNFREEZE_REFRESH_RETRY_DELAY_MS = 500;
/** Delay before the warm-up request after the tab becomes visible. */
export const UNFREEZE_WARMUP_DELAY_MS = 150;

let lastVisibleAt = 0;
let initialized = false;

/**
 * True when the document became visible within the last UNFREEZE_WINDOW_MS.
 * Used by the 401 interceptor to decide whether a failed token refresh is
 * worth retrying once (#558).
 */
export function recentlyBecameVisible(): boolean {
  return lastVisibleAt > 0 && Date.now() - lastVisibleAt < UNFREEZE_WINDOW_MS;
}

/**
 * Register the visibilitychange tracking + warm-up request. Idempotent and
 * a no-op on the server. Called once from the app root providers.
 */
export function initTabUnfreezeGuards(): void {
  if (initialized) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  initialized = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    lastVisibleAt = Date.now();

    // Fire a disposable warm-up request so the cookieless first request
    // after an unfreeze hits /auth/me (whose 401 the interceptor ignores)
    // instead of a data query (#558). A failure here is fine — the real
    // queries that follow carry the actual auth handling.
    setTimeout(() => {
      fetch(`${API_BASE_URL}/api/v1/auth/me`, {
        method: 'GET',
        credentials: 'include',
      }).catch(() => {
        // Disposable by design; swallow network errors and 401s.
      });
    }, UNFREEZE_WARMUP_DELAY_MS);
  });
}
