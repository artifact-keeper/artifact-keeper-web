"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useSystemConfig } from "@/providers/system-config-provider";
import { ssoApi } from "@/lib/api/sso";
import {
  hasAttemptedSilentSso,
  isSilentSsoExcludedPath,
  markSilentSsoAttempted,
  startSilentSignIn,
} from "@/lib/silent-sso";

/**
 * Runs the silent SSO auto-login probe (OIDC `prompt=none` check-sso) once
 * per browser session. Mounted app-wide (inside `AuthProvider`), renders
 * nothing.
 *
 * The probe starts only when ALL of these hold:
 *  - the auth bootstrap finished and nobody is signed in (cookie session,
 *    demo auto-login and first-boot setup all take precedence);
 *  - the operator has not disabled the feature (backend
 *    `OIDC_SILENT_SSO=false`, surfaced as `auth.silent_sso_enabled`);
 *  - at least one OIDC provider is enabled;
 *  - no prior attempt is recorded for this browser session;
 *  - the current page is not an auth flow page (login/callback/
 *    change-password).
 *
 * The attempt itself (see src/lib/silent-sso.ts) is a preflight-gated
 * top-level `prompt=none` round trip: a dead or unreachable IdP fails the
 * short-timeout preflight and nothing happens (fail open); a live IdP
 * session signs the user in invisibly and returns them to this page; no
 * session returns them here still anonymous, with no error UI and no
 * visible IdP login page. Anonymous browsing is a first-class state for a
 * registry — that is what separates check-sso from a naive sole-provider
 * auto-redirect.
 */
export function SilentSsoBootstrap() {
  const { user, isLoading, setupRequired } = useAuth();
  const { config, isLoading: configLoading } = useSystemConfig();
  // Per-mount re-entry latch. The sessionStorage guard is the real
  // once-per-session gate; this only stops effect re-runs racing within a
  // single mount before storage is written.
  const startedRef = useRef(false);
  const silentSsoEnabled = config.auth.silent_sso_enabled;

  useEffect(() => {
    if (startedRef.current) return;
    if (isLoading || configLoading) return;
    if (user) return;
    if (setupRequired) return;
    if (!silentSsoEnabled) return;
    if (isSilentSsoExcludedPath(window.location.pathname)) return;
    if (hasAttemptedSilentSso()) return;

    startedRef.current = true;
    // Record the attempt BEFORE anything async: an interrupted round trip
    // must never produce a second attempt (or a loop) in this session.
    markSilentSsoAttempted();

    (async () => {
      try {
        const providers = await ssoApi.listProviders();
        const oidc = providers.find(
          (p) => p.provider_type === "oidc" && p.login_url.startsWith("/"),
        );
        if (!oidc) return;

        // Preflight + top-level redirect; false means the preflight failed
        // and nothing happened — the visitor stays anonymous, quietly. The
        // explicit "Sign in with …" button on /login is unaffected either
        // way.
        await startSilentSignIn(oidc.login_url);
      } catch {
        // Fail open: a providers-list failure or any unexpected error leaves
        // the visitor anonymous and the app fully usable.
      }
    })();
  }, [user, isLoading, configLoading, setupRequired, silentSsoEnabled]);

  return null;
}
