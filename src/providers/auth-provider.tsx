"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
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

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mustChangePassword: boolean;
  setupRequired: boolean;
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
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpToken, setTotpToken] = useState<string | null>(null);

  const isAuthenticated = !!user;

  const refreshUser = useCallback(async () => {
    try {
      const { data, error } = await sdkGetCurrentUser();
      if (error) throw error;
      setUser(data as unknown as User);
    } catch {
      setUser(null);
      clearTokens();
    }
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<boolean | "totp"> => {
      const body: LoginRequest = { username, password };
      const { data, error } = await sdkLogin({ body });
      if (error) throw error;
      const loginData = data as unknown as SdkLoginResponse;

      if (loginData.totp_required && loginData.totp_token) {
        setTotpRequired(true);
        setTotpToken(loginData.totp_token);
        return "totp"; // Don't redirect yet
      }

      storeTokens(loginData as unknown as LoginResponse);
      await refreshUser();

      if (loginData.must_change_password) {
        setMustChangePassword(true);
        return true;
      }
      return false;
    },
    [refreshUser]
  );

  const verifyTotp = useCallback(
    async (code: string) => {
      if (!totpToken) throw new Error("No TOTP token");
      const body: TotpVerifyRequest = { totp_token: totpToken, code };
      const { data, error } = await sdkVerifyTotp({ body });
      if (error) throw error;
      const tokenData = data as unknown as SdkLoginResponse;
      storeTokens(tokenData as unknown as LoginResponse);
      setTotpRequired(false);
      setTotpToken(null);
      await refreshUser();
      if (tokenData.must_change_password) {
        setMustChangePassword(true);
      }
    },
    [totpToken, refreshUser]
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
    }
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!user) throw new Error("Not authenticated");

      const body: ChangePasswordRequest = { current_password: currentPassword, new_password: newPassword };
      const { error } = await sdkChangePassword({ path: { id: user.id }, body });
      if (error) throw error;

      setMustChangePassword(false);
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
        const status = setupData as unknown as SetupStatusResponse | undefined;
        if (status?.setup_required) {
          setSetupRequired(true);
        }
      } catch {
        // Setup endpoint not available, continue normally
      }

      // Try to authenticate via httpOnly cookies (sent automatically by browser).
      // refreshUser will set user state if a valid session cookie exists.
      try {
        const { data, error } = await sdkGetCurrentUser();
        if (!error && data) {
          setUser(data as unknown as User);
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
        setupRequired,
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
