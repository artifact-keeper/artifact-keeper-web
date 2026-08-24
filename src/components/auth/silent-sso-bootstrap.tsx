"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { useSystemConfig } from "@/providers/system-config-provider";
import { ssoApi } from "@/lib/api/sso";
import {
  hasAttemptedSilentSso,
  isInIframe,
  isSilentSsoExcludedPath,
  markSilentSsoAttempted,
  runSilentSso,
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
 *    change-password) and this window is not itself a probe iframe.
 *
 * The probe runs in a hidden iframe and NEVER navigates this page (see
 * src/lib/silent-sso.ts): a live IdP session signs the user in invisibly,
 * anything else — no session, IdP down, IdP slow — leaves the visitor
 * browsing anonymously with no error UI and no visible IdP login page.
 * Anonymous browsing is a first-class state for a registry; that is what
 * separates check-sso from a naive sole-provider auto-redirect.
 */
export function SilentSsoBootstrap() {
  const { user, isLoading, setupRequired, refreshUser } = useAuth();
  const { config, isLoading: configLoading } = useSystemConfig();
  const queryClient = useQueryClient();
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
    if (isInIframe(window)) return;
    if (hasAttemptedSilentSso()) return;

    startedRef.current = true;
    // Record the attempt BEFORE anything async: a crash or reload mid-probe
    // must never produce a second attempt (or a loop) in this session.
    markSilentSsoAttempted();

    (async () => {
      try {
        const providers = await ssoApi.listProviders();
        const oidc = providers.find(
          (p) => p.provider_type === "oidc" && p.login_url.startsWith("/"),
        );
        if (!oidc) return;

        const outcome = await runSilentSso(oidc.login_url);
        if (outcome === "success") {
          // The probe iframe completed the code exchange; the httpOnly auth
          // cookies are set. Adopt the identity and refetch auth-scoped
          // queries (same post-login invalidation as the explicit flows,
          // #487).
          await refreshUser();
          await queryClient.invalidateQueries();
        }
        // "denied" / "error" / "timeout": stay anonymous, quietly. The
        // explicit "Sign in with …" button on /login is unaffected.
      } catch {
        // Fail open: a providers-list failure or any unexpected error leaves
        // the visitor anonymous and the app fully usable.
      }
    })();
  }, [
    user,
    isLoading,
    configLoading,
    setupRequired,
    silentSsoEnabled,
    refreshUser,
    queryClient,
  ]);

  return null;
}
