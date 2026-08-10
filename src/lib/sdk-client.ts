/**
 * SDK client configuration for the Artifact Keeper web frontend.
 *
 * Configures the generated SDK's fetch-based client with:
 * - Cookie-based auth (httpOnly cookies sent via credentials: 'include')
 * - CSRF defense-in-depth custom header (X-Requested-With) on all requests
 * - Automatic 401 token refresh with mutex to prevent race conditions
 * - Dynamic baseUrl for remote instance proxy
 * - 403 SETUP_REQUIRED redirect to login
 *
 * Import this module (side-effect) before using any SDK functions:
 *   import '@/lib/sdk-client';
 */

import { client } from '@artifact-keeper/sdk/client';
import {
  recentlyBecameVisible,
  UNFREEZE_REFRESH_RETRY_DELAY_MS,
} from './tab-unfreeze';

// ---------------------------------------------------------------------------
// CSRF defense-in-depth
// ---------------------------------------------------------------------------

/**
 * Custom header sent on every API request. Cross-site HTML forms cannot set
 * custom headers, so a request carrying this header could only have come from
 * our own JavaScript — the backend can require it on cookie-authenticated
 * mutating requests as a CSRF check (the header forces a CORS preflight that
 * cross-origin forms cannot satisfy). See the "CSRF protection" section of
 * the README for the full contract.
 */
export const CSRF_HEADER_NAME = 'X-Requested-With';
export const CSRF_HEADER_VALUE = 'XMLHttpRequest';

// ---------------------------------------------------------------------------
// Remote instance helpers
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

function getActiveInstanceBaseUrl(): string {
  if (typeof window === 'undefined') return API_BASE_URL;
  try {
    const activeId = localStorage.getItem('ak_active_instance') || 'local';
    if (activeId === 'local') return API_BASE_URL;
    return `${API_BASE_URL}/api/v1/instances/${encodeURIComponent(activeId)}/proxy`;
  } catch {
    return API_BASE_URL;
  }
}

function isRemoteInstance(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const activeId = localStorage.getItem('ak_active_instance') || 'local';
    return activeId !== 'local';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Configure the global SDK client
// ---------------------------------------------------------------------------

client.setConfig({
  baseUrl: getActiveInstanceBaseUrl(),
  credentials: 'include',
});

// ---------------------------------------------------------------------------
// Request interceptor: dynamic baseUrl for remote instances
// ---------------------------------------------------------------------------

client.interceptors.request.use((request) => {
  // CSRF defense-in-depth: attach the custom header to every request so the
  // backend can require it on cookie-authenticated mutations. The header is
  // copied onto the request before any further rewriting so retried requests
  // (401 refresh) inherit it via request.headers.
  const headers = new Headers(request.headers);
  headers.set(CSRF_HEADER_NAME, CSRF_HEADER_VALUE);
  const withCsrfHeader = new Request(request, { headers });

  if (typeof window === 'undefined') return withCsrfHeader;
  if (!isRemoteInstance()) return withCsrfHeader;

  const base = getActiveInstanceBaseUrl();
  if (!base) return withCsrfHeader;

  // For remote instances, prepend the proxy path prefix to the existing URL.
  // Only modify the pathname; never rewrite protocol or host to prevent
  // open redirect attacks via localStorage instance poisoning.
  const url = new URL(withCsrfHeader.url);
  const target = new URL(base, window.location.origin);
  url.pathname = target.pathname + url.pathname;

  return new Request(url.toString(), withCsrfHeader);
});

// ---------------------------------------------------------------------------
// Token refresh mutex
// ---------------------------------------------------------------------------

let isRefreshing = false;
let refreshSubscribers: Array<() => void> = [];

function onTokenRefreshed() {
  refreshSubscribers.forEach((cb) => cb());
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: () => void) {
  refreshSubscribers.push(cb);
}

async function attemptRefresh(): Promise<boolean> {
  try {
    const refreshResponse = await fetch(
      `${getActiveInstanceBaseUrl()}/api/v1/auth/refresh`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
        },
        body: '{}',
        credentials: 'include',
      }
    );
    return refreshResponse.ok;
  } catch {
    return false;
  }
}

function retryOriginalRequest(request: Request): Promise<Response> {
  return fetch(new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.bodyUsed ? undefined : request.body,
    credentials: 'include',
  }));
}

// ---------------------------------------------------------------------------
// Response interceptor: 401 refresh + 403 SETUP_REQUIRED
// ---------------------------------------------------------------------------

client.interceptors.response.use(async (response, request) => {
  // --- 403 SETUP_REQUIRED redirect ---
  if (
    response.status === 403 &&
    typeof window !== 'undefined' &&
    !window.location.pathname.startsWith('/login') &&
    !window.location.pathname.startsWith('/change-password')
  ) {
    try {
      const cloned = response.clone();
      const body = await cloned.json();
      if (body?.error === 'SETUP_REQUIRED') {
        window.location.href = '/login';
        return response;
      }
    } catch {
      // Not JSON, ignore
    }
  }

  // --- 401 token refresh ---
  if (response.status !== 401 || typeof window === 'undefined') return response;
  if (isRemoteInstance()) return response;

  const url = request.url;
  const isAuthEndpoint =
    url.includes('/auth/me') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/login');
  if (isAuthEndpoint) return response;

  if (isRefreshing) {
    // Another request is already refreshing -- wait for it, then retry
    return new Promise<Response>((resolve) => {
      addRefreshSubscriber(async () => {
        resolve(await retryOriginalRequest(request));
      });
    });
  }

  isRefreshing = true;

  let refreshed = await attemptRefresh();

  // #558: Chromium can fire the first request(s) after a frozen tab
  // reactivates before the cookie store reattaches, so the request -- and
  // the refresh it triggers -- goes out without cookies and fails
  // spuriously. When the tab only just became visible, wait a beat and try
  // the refresh once more before concluding the session is really gone.
  if (!refreshed && recentlyBecameVisible()) {
    await new Promise((resolve) =>
      setTimeout(resolve, UNFREEZE_REFRESH_RETRY_DELAY_MS)
    );
    refreshed = await attemptRefresh();
  }

  if (!refreshed) {
    isRefreshing = false;
    refreshSubscribers = [];
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    return response;
  }

  isRefreshing = false;
  onTokenRefreshed();

  // Retry the original request -- cookies are updated by the refresh response
  return retryOriginalRequest(request);
});

export { client };
export { getActiveInstanceBaseUrl };
