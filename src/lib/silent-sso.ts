/**
 * Silent SSO auto-login (OIDC `prompt=none` check-sso).
 *
 * On app load, when nobody is signed in, an OIDC provider is enabled, the
 * operator has not disabled the feature (backend `OIDC_SILENT_SSO=false`,
 * surfaced as `auth.silent_sso_enabled`), and no prior attempt is recorded
 * for this browser session, the app probes the IdP once for an existing SSO
 * session — invisibly, inside a hidden same-origin iframe:
 *
 *   iframe → GET /api/v1/auth/sso/oidc/{id}/login?prompt=none
 *          → 307 to the IdP authorize endpoint with `prompt=none`
 *          → live IdP session:  302 back with a code → backend callback sets
 *            the auth cookies and 307s to `/callback?code=…` (inside the
 *            iframe), whose page posts a "success" message to this window;
 *          → no IdP session:    302 back with `error=login_required` → the
 *            backend 307s to `/callback?silent_denied=1`, whose page posts a
 *            "denied" message. No error UI, the visitor stays anonymous.
 *
 * The iframe is the FAIL-OPEN mechanism: the top-level page never navigates
 * away, so an unreachable or slow IdP can never strand an anonymous visitor
 * on a browser error page or a Keycloak login screen they did not ask for.
 * If no result message arrives within the timeout the attempt is abandoned
 * and browsing continues anonymously. Exactly one attempt is made per browser
 * session (sessionStorage guard); the guard is cleared on explicit sign-in
 * and sign-out so the next session starts fresh.
 */

/** sessionStorage key recording that this browser session already probed. */
export const SILENT_SSO_ATTEMPTED_KEY = "ak.silent-sso.attempted";

/**
 * How long the hidden-iframe probe may take before it is abandoned. The
 * whole round trip is two redirects plus the callback page bootstrap; 5s is
 * generous for a healthy IdP while short enough that a downed IdP costs an
 * anonymous visitor nothing visible.
 */
export const SILENT_SSO_TIMEOUT_MS = 5000;

/** `type` field of the postMessage the callback page sends from the iframe. */
export const SILENT_SSO_MESSAGE_TYPE = "ak-silent-sso-result";

/** What the silent probe concluded. */
export type SilentSsoOutcome = "success" | "denied" | "error" | "timeout";

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

/** Whether this document is running inside the silent-SSO probe iframe. */
export function isInIframe(win: Pick<Window, "self" | "top">): boolean {
  try {
    return win.self !== win.top;
  } catch {
    // Cross-origin `top` access throws — by definition we are framed.
    return true;
  }
}

/**
 * Message payload the callback page posts to the top window when it is
 * loaded inside the probe iframe.
 */
export interface SilentSsoMessage {
  type: typeof SILENT_SSO_MESSAGE_TYPE;
  outcome: Extract<SilentSsoOutcome, "success" | "denied" | "error">;
}

/** Narrow an untrusted postMessage payload to a SilentSsoMessage. */
export function isSilentSsoMessage(data: unknown): data is SilentSsoMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === SILENT_SSO_MESSAGE_TYPE &&
    ["success", "denied", "error"].includes(
      (data as { outcome?: unknown }).outcome as string,
    )
  );
}

/**
 * Run one silent check-sso probe in a hidden iframe and resolve with its
 * outcome. Never rejects and never navigates the top-level page:
 *
 *  - "success": the callback page completed the code exchange in the iframe;
 *    the auth cookies are now set and the caller should refresh the user.
 *  - "denied": the IdP answered `login_required` (no session) — stay
 *    anonymous.
 *  - "error": the callback page hit a real error (failed exchange, IdP
 *    error) — stay anonymous; the explicit login button remains available.
 *  - "timeout": no message arrived in time (IdP down/unreachable, an IdP
 *    that renders UI despite `prompt=none` and is blocked by frame-ancestors,
 *    …) — stay anonymous. This is the fail-open path.
 *
 * The caller is responsible for the sessionStorage guard (mark BEFORE
 * calling, so a crash mid-probe can never loop).
 */
export function runSilentSso(
  loginUrl: string,
  timeoutMs: number = SILENT_SSO_TIMEOUT_MS,
): Promise<SilentSsoOutcome> {
  return new Promise<SilentSsoOutcome>((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("tabindex", "-1");
    // The probe needs scripts (the callback page posts the result) and
    // same-origin (the backend must see and set cookies) but nothing else.
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");

    let settled = false;

    // `timer` is initialized below, after the listener registration; settle
    // only ever runs from the listener or the timer itself, both strictly
    // after that line, so the closure never observes it uninitialized.
    const settle = (outcome: SilentSsoOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      // Remove on the next tick: removing an iframe from inside its own
      // message dispatch is legal, but deferring keeps the teardown out of
      // the child's call stack entirely.
      setTimeout(() => iframe.remove(), 0);
      resolve(outcome);
    };

    const onMessage = (event: MessageEvent) => {
      // Only trust our own origin AND our own probe iframe: any window can
      // postMessage to us, and a same-origin message from elsewhere (another
      // tab scripting us, a second iframe) must not settle the probe.
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframe.contentWindow) return;
      if (!isSilentSsoMessage(event.data)) return;
      settle(event.data.outcome);
    };

    window.addEventListener("message", onMessage);
    const timer = setTimeout(() => settle("timeout"), timeoutMs);

    iframe.src = buildSilentLoginUrl(loginUrl);
    document.body.appendChild(iframe);
  });
}

/**
 * Post a probe result from the callback page (inside the iframe) to the top
 * window. Same-origin only: the top window is this app itself.
 */
export function postSilentSsoResult(
  outcome: SilentSsoMessage["outcome"],
): void {
  try {
    window.parent.postMessage(
      { type: SILENT_SSO_MESSAGE_TYPE, outcome } satisfies SilentSsoMessage,
      window.location.origin,
    );
  } catch {
    // A failed post means the parent times out and stays anonymous — the
    // fail-open default.
  }
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
