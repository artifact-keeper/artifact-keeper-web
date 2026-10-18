"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import '@/lib/sdk-client';
import {
  login as sdkLogin,
  logout as sdkLogout,
  getCurrentUser as sdkGetCurrentUser,
  verifyTotp as sdkVerifyTotp,
  changePassword as sdkChangePassword,
  setupStatus as sdkSetupStatus,
} from '@artifact-keeper/sdk';
import type {
  LoginRequest,
  LoginResponse as SdkLoginResponse,
  TotpVerifyRequest,
  ChangePasswordRequest,
  SetupStatusResponse2 as SetupStatusResponse,
} from '@artifact-keeper/sdk';
import type { User, LoginResponse } from "@/types";
import { unwrap } from "@/lib/sdk-utils";
import { clearSilentSsoAttempt } from "@/lib/silent-sso";
import { SYSTEM_CONFIG_QUERY_KEY } from "./system-config-provider";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mustChangePassword: boolean;
  passwordExpiresAt: string | null;
  setupRequired: boolean;
  setupPasswordHint: string | null;
  totpRequired: boolean;
  totpToken: string | null;
  login: (username: string, password: string) => Promise<boolean | "totp">;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  clearMustChangePassword: () => void;
  verifyTotp: (code: string) => Promise<void>;
  clearTotpRequired: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function storeTokens(_response: LoginResponse): void {
  // Tokens are now stored as httpOnly cookies by the backend.
  // No localStorage needed for the local instance.
}

function clearTokens(): void {
  // Cookies are cleared by the backend's logout endpoint.
  // Clean up any legacy localStorage tokens.
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [passwordExpiresAt, setPasswordExpiresAt] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [setupPasswordHint, setSetupPasswordHint] = useState<string | null>(null);
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpToken, setTotpToken] = useState<string | null>(null);

  const isAuthenticated = !!user;

  // The principal the cached queries were fetched under: a user id, or null
  // for anonymous. Starts as anonymous, which is what the app fetches as
  // before anyone signs in; initAuth records a cookie session it restores.
  const principalRef = useRef<string | null>(null);

  /**
   * Bring the query cache in line with a new principal (#844, #487).
   *
   * `GET /api/v1/system/config` answers anonymous callers with its public tier
   * and admins with extra fields, and the SystemConfigProvider fetches it once
   * at app start with a 10-minute staleTime. Signing in (password, TOTP, LDAP,
   * SSO callback, demo auto-login) or out without a reload must refetch it, or
   * the session keeps the payload of whoever was there before.
   *
   * Signing in invalidates every query, the #487 rule for auth-scoped data,
   * which refetches system-config with the rest while keeping the old payload
   * on screen until the new one lands. Becoming anonymous resets system-config
   * instead, so admin-tier fields are dropped at once rather than shown until
   * the anonymous refetch completes. `force` re-invalidates even when the id
   * is unchanged, for the explicit login paths that always did so.
   */
  const syncPrincipal = useCallback(
    async (next: string | null, force = false) => {
      const changed = principalRef.current !== next;
      principalRef.current = next;
      if (!changed && !force) return;
      if (next === null) {
        await queryClient.resetQueries({ queryKey: SYSTEM_CONFIG_QUERY_KEY, exact: true });
      } else {
        await queryClient.invalidateQueries();
      }
    },
    [queryClient]
  );

  /** Load the current user into state; returns its id, or null when signed out. */
  const loadUser = useCallback(async (): Promise<string | null> => {
    try {
      const data = await unwrap(sdkGetCurrentUser());
      const userData = data as unknown as User;
      setUser(userData);
      setPasswordExpiresAt(userData.password_expires_at ?? null);
      setMustChangePassword(!!userData.must_change_password);
      // Signed in (any path: local, LDAP, TOTP, SSO exchange): reset the
      // silent-SSO once-per-session guard so a later anonymous session can
      // probe afresh.
      clearSilentSsoAttempt();
      return userData.id;
    } catch {
      setUser(null);
      setPasswordExpiresAt(null);
      clearTokens();
      return null;
    }
  }, []);

  // Public: used by the SSO callback, LDAP login and the profile page. Only a
  // change of principal touches the query cache, so a profile refresh does not
  // refetch everything.
  const refreshUser = useCallback(async () => {
    await syncPrincipal(await loadUser());
  }, [loadUser, syncPrincipal]);

  const login = useCallback(
    async (username: string, password: string): Promise<boolean | "totp"> => {
      const body: LoginRequest = { username, password };
      const data = await unwrap(sdkLogin({ body }));
      const loginData = data as unknown as SdkLoginResponse;

      if (loginData.totp_required && loginData.totp_token) {
        setTotpRequired(true);
        setTotpToken(loginData.totp_token);
        return "totp"; // Don't redirect yet
      }

      storeTokens(loginData as unknown as LoginResponse);
      // #487: the anonymous session may have cached auth-scoped queries
      // (e.g. the repositories list returns only public repos when
      // unauthenticated), and system-config its public tier (#844).
      // Invalidate so they refetch under the new identity instead of showing
      // stale/empty data until a manual refresh.
      await syncPrincipal(await loadUser(), true);

      if (loginData.must_change_password) {
        setMustChangePassword(true);
        return true;
      }
      return false;
    },
    [loadUser, syncPrincipal]
  );

  const verifyTotp = useCallback(
    async (code: string) => {
      if (!totpToken) throw new Error("No TOTP token");
      const body: TotpVerifyRequest = { totp_token: totpToken, code };
      const data = await unwrap(sdkVerifyTotp({ body }));
      const tokenData = data as unknown as SdkLoginResponse;
      storeTokens(tokenData as unknown as LoginResponse);
      setTotpRequired(false);
      setTotpToken(null);
      // #487 / #844: refetch auth-scoped queries and system-config under the
      // now-authenticated identity.
      await syncPrincipal(await loadUser(), true);
      if (tokenData.must_change_password) {
        setMustChangePassword(true);
      }
    },
    [totpToken, loadUser, syncPrincipal]
  );

  const clearTotpRequired = useCallback(() => {
    setTotpRequired(false);
    setTotpToken(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await sdkLogout();
    } catch {
      // Ignore logout errors
    } finally {
      clearTokens();
      setUser(null);
      setMustChangePassword(false);
      setPasswordExpiresAt(null);
      // Explicit sign-out resets the silent-SSO guard: if the IdP session is
      // still alive, the next page load may sign the user straight back in —
      // the standard check-sso semantic (Artifact Keeper sign-out is not IdP
      // sign-out).
      clearSilentSsoAttempt();
      // #487 / security: drop every cached query so the next (anonymous or
      // next-user) session never sees the previous identity's private data.
      // system-config is reset rather than removed (#844): its observer lives
      // in SystemConfigProvider, which sits above this provider and does not
      // re-render on sign-out, so a removed query would leave it holding the
      // admin payload with nothing in the cache to refetch, now or after the
      // next login.
      queryClient.removeQueries({
        predicate: (q) => q.queryKey[0] !== SYSTEM_CONFIG_QUERY_KEY[0],
      });
      queryClient.getMutationCache().clear();
      // The reset drops the admin payload synchronously; the anonymous
      // refetch it starts is not awaited, so sign-out does not wait on it.
      void syncPrincipal(null, true);
    }
  }, [queryClient, syncPrincipal]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!user) throw new Error("Not authenticated");

      const body: ChangePasswordRequest = { current_password: currentPassword, new_password: newPassword };
      await unwrap(sdkChangePassword({ path: { id: user.id }, body }));

      setMustChangePassword(false);
      setPasswordExpiresAt(null);
      setSetupRequired(false);
    },
    [user]
  );

  const clearMustChangePassword = useCallback(() => {
    setMustChangePassword(false);
  }, []);

  // Check for existing token on mount, auto-login in demo mode
  useEffect(() => {
    async function initAuth(): Promise<void> {
      // Check if first-boot setup is required
      try {
        const { data: setupData } = await sdkSetupStatus();
        // The backend ships an optional `setup_password_hint` via
        // artifact-keeper#2802, but the generated SDK type doesn't carry it
        // until the SDK regenerates from the upgraded OpenAPI spec. Read it off
        // the runtime object via a narrowed cast so the deployment-aware hint
        // plumbs through as soon as the backend rolls out. Once the SDK is
        // regenerated with the field, this extra type can collapse away.
        const status = setupData as unknown as
          | (SetupStatusResponse & { setup_password_hint?: string | null })
          | undefined;
        if (status?.setup_required) {
          setSetupRequired(true);
        }
        const hint = status?.setup_password_hint?.trim();
        setSetupPasswordHint(hint ? hint : null);
      } catch {
        // Setup endpoint not available, continue normally
      }

      // Try to authenticate via httpOnly cookies (sent automatically by browser).
      // refreshUser will set user state if a valid session cookie exists.
      try {
        const { data, error } = await sdkGetCurrentUser();
        if (!error && data) {
          const userData = data as unknown as User;
          // The session cookie went out with the initial system-config
          // request too, so the cache already matches this principal.
          principalRef.current = userData.id;
          setUser(userData);
          setPasswordExpiresAt(userData.password_expires_at ?? null);
          setMustChangePassword(!!userData.must_change_password);
          setIsLoading(false);
          return;
        }
      } catch {
        // Not authenticated via cookie, continue
      }

      // Clean up any legacy localStorage tokens from older versions
      clearTokens();

      // In demo mode, auto-login as admin so visitors see the full UI
      await attemptDemoAutoLogin();
      setIsLoading(false);
    }

    async function attemptDemoAutoLogin(): Promise<void> {
      try {
        const healthRes = await fetch("/health");
        const health = await healthRes.json();
        if (health.demo_mode !== true) return;

        // Well-known demo instance credentials (not a secret; the backend
        // generates this deterministic account when running in demo mode).
        const body: LoginRequest = {
          username: "admin",
          password: process.env.NEXT_PUBLIC_DEMO_CREDENTIAL ?? "demo", // NOSONAR
        };
        const { data, error } = await sdkLogin({ body });
        if (error) return;
        storeTokens(data as unknown as LoginResponse);
        await refreshUser();
      } catch {
        // Health check or demo auto-login failed, continue as anonymous
      }
    }

    initAuth();
  }, [refreshUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        mustChangePassword,
        passwordExpiresAt,
        setupRequired,
        setupPasswordHint,
        totpRequired,
        totpToken,
        login,
        logout,
        refreshUser,
        changePassword,
        clearMustChangePassword,
        verifyTotp,
        clearTotpRequired,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
