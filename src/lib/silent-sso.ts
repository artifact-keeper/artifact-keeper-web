/**
 * Silent SSO auto-login (OIDC `prompt=none` check-sso).
 *
 * On app load, when nobody is signed in, an OIDC provider is enabled, the
 * operator has not disabled the feature (backend `OIDC_SILENT_SSO=false`,
 * surfaced as `auth.silent_sso_enabled`), and no prior attempt is recorded
 * for this browser session, the app probes the IdP once for an existing SSO
 * session:
 *
 *   1. PREFLIGHT (the fail-open gate): a short-timeout same-origin fetch of
 *      the provider's login URL with `prompt=none`, redirects NOT followed.
 *      The backend answers 307 only after its own server-side fetch of the
 *      IdP discovery document succeeded, so a down or unreachable IdP fails
 *      this cheap probe and NOTHING further happens — the visitor keeps
 *      browsing anonymously, never stranded on a browser error page.
 *   2. Top-level redirect to the same URL. `prompt=none` (OIDC Core 3.1.2.1)
 *      forbids the IdP from rendering any UI: a live IdP session completes
 *      the code flow invisibly (the callback signs the user in and returns
 *      them to the page they were on); no session comes back as
 *      `login_required`, which the backend relays as
 *      `/callback?silent_denied=1` — the callback page records the attempt
 *      and quietly returns the still-anonymous visitor to where they were.
 *      Either way the visitor NEVER sees an IdP login page they did not ask
 *      for — that is what separates check-sso from a naive sole-provider
 *      auto-redirect.
 *
 * A top-level navigation (rather than a hidden iframe) is deliberate: IdP
 * session cookies are frequently `SameSite=Lax` (Keycloak issues Lax unless
 * it is certain the deployment is HTTPS-proxied), and Lax cookies are never
 * sent on a cross-site iframe navigation — an iframe probe would silently
 * report "no session" for users who have one. Top-level navigations carry
 * Lax cookies, so this works on both Lax and None IdPs.
 *
 * Exactly one attempt is made per browser session (sessionStorage guard,
 * written BEFORE the redirect so an interrupted round trip can never loop);
 * the guard is cleared on explicit sign-in and sign-out so the next session
 * starts fresh.
 */

/** sessionStorage key recording that this browser session already probed. */
export const SILENT_SSO_ATTEMPTED_KEY = "ak.silent-sso.attempted";

/** sessionStorage key holding the path to return to after the round trip. */
export const SILENT_SSO_RETURN_KEY = "ak.silent-sso.return-to";

/**
 * How long the preflight may take before the attempt is abandoned. The
 * preflight covers the backend AND (transitively, via the backend's
 * server-side discovery fetch) the IdP, so this bound is what keeps a dead
 * IdP from costing the visitor anything visible.
 */
export const SILENT_SSO_PREFLIGHT_TIMEOUT_MS = 4000;

/**
 * sessionStorage access is wrapped: it throws in some privacy modes, and a
 * feature whose failure mode must be "stay anonymous, quietly" cannot let a
 * storage exception surface. When storage is unavailable the guard reads as
 * "already attempted", so a browser we cannot record the attempt in never
 * loops.
 */
export function hasAttemptedSilentSso(): boolean {
  try {
    return sessionStorage.getItem(SILENT_SSO_ATTEMPTED_KEY) !== null;
  } catch {
    return true;
  }
}

/** Record the (single) silent attempt for this browser session. */
export function markSilentSsoAttempted(): void {
  try {
    sessionStorage.setItem(SILENT_SSO_ATTEMPTED_KEY, "1");
  } catch {
    // Nothing to do: hasAttemptedSilentSso already fails closed.
  }
}

/**
 * Forget the recorded attempt. Called on explicit sign-in and sign-out so a
 * later anonymous page load (e.g. after signing out of Artifact Keeper while
 * the IdP session lives on) probes again — that re-login-after-sign-out is
 * the standard check-sso semantic, matching Keycloak's own JS adapter.
 */
export function clearSilentSsoAttempt(): void {
  try {
    sessionStorage.removeItem(SILENT_SSO_ATTEMPTED_KEY);
  } catch {
    // Ignore: nothing recorded means nothing to clear.
  }
}

/**
 * Append `prompt=none` to a provider's login URL. The explicit "Sign in
 * with …" button uses the URL verbatim (no prompt), so only the silent probe
 * flows through here.
 */
export function buildSilentLoginUrl(loginUrl: string): string {
  return loginUrl.includes("?")
    ? `${loginUrl}&prompt=none`
    : `${loginUrl}?prompt=none`;
}

/** Remember where the visitor was so the callback can put them back. */
export function storeSilentSsoReturnTo(path: string): void {
  try {
    sessionStorage.setItem(SILENT_SSO_RETURN_KEY, path);
  } catch {
    // Losing the return path degrades to landing on "/" — acceptable.
  }
}

/**
 * Read-and-clear the stored return path. Only same-app absolute paths are
 * honoured (must start with a single "/"): anything else — absolute URLs,
 * protocol-relative "//host" — is discarded so a tampered sessionStorage
 * value can never turn the callback into an open redirect.
 */
export function consumeSilentSsoReturnTo(): string | null {
  try {
    const v = sessionStorage.getItem(SILENT_SSO_RETURN_KEY);
    sessionStorage.removeItem(SILENT_SSO_RETURN_KEY);
    if (v && v.startsWith("/") && !v.startsWith("//")) return v;
    return null;
  } catch {
    return null;
  }
}

/**
 * The fail-open gate: verify — cheaply, with a hard timeout, and without
 * navigating anywhere — that the silent login round trip has somewhere to
 * go. Fetches the provider's `prompt=none` login URL with redirects
 * disabled; the backend only answers with a redirect after ITS server-side
 * fetch of the IdP discovery document succeeded, so this one same-origin
 * request vouches for both the backend and the IdP. Any failure (timeout,
 * network error, 4xx/5xx) means "do not navigate": the visitor stays
 * anonymous and undisturbed.
 */
export async function preflightSilentLogin(
  loginUrl: string,
  timeoutMs: number = SILENT_SSO_PREFLIGHT_TIMEOUT_MS,
): Promise<boolean> {
  try {
    const res = await fetch(buildSilentLoginUrl(loginUrl), {
      method: "GET",
      redirect: "manual",
      // The probe needs no cookies and must not consume any state; it only
      // asks "would a redirect happen".
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    // With redirect:"manual" a redirect surfaces as an opaqueredirect
    // response (status 0). A non-redirect answer (backend error, IdP
    // discovery failure) is a real Response with an error status.
    return res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400);
  } catch {
    return false;
  }
}

/**
 * Run the silent sign-in attempt: preflight, remember where the visitor is,
 * and start the top-level `prompt=none` round trip. Resolves `true` when the
 * navigation was started, `false` when the preflight failed (fail open —
 * nothing happened). The caller owns the once-per-session guard and must
 * mark it BEFORE calling.
 *
 * `navigate` is injectable for tests; the default performs the real
 * top-level navigation.
 */
export async function startSilentSignIn(
  loginUrl: string,
  options?: {
    timeoutMs?: number;
    navigate?: (url: string) => void;
  },
): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? SILENT_SSO_PREFLIGHT_TIMEOUT_MS;
  const navigate =
    options?.navigate ?? ((url: string) => window.location.assign(url));

  if (!(await preflightSilentLogin(loginUrl, timeoutMs))) {
    return false;
  }

  storeSilentSsoReturnTo(
    window.location.pathname + window.location.search + window.location.hash,
  );
  navigate(buildSilentLoginUrl(loginUrl));
  return true;
}

/**
 * Paths on which the app must never start a silent probe:
 *  - the callback pages are the probe's own landing zone (and mid-flow for
 *    explicit logins);
 *  - the login page is an explicit user choice — auto-signing someone in who
 *    just chose "sign out" and landed on /login would override their intent
 *    (`?fallback=local` doubly so);
 *  - change-password is a forced-action page mid-authentication.
 */
export function isSilentSsoExcludedPath(pathname: string): boolean {
  const excluded = ["/callback", "/auth/callback", "/login", "/change-password"];
  return excluded.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
