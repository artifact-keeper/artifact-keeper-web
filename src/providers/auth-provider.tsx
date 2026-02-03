"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import apiClient from "@/lib/api-client";
import type { User, LoginResponse } from "@/types";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mustChangePassword: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  clearMustChangePassword: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  const isAuthenticated = !!user;

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await apiClient.get<User>("/api/v1/auth/me");
      setUser(data);
    } catch {
      setUser(null);
      clearTokens();
    }
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<boolean> => {
      const { data } = await apiClient.post<LoginResponse>("/api/v1/auth/login", {
        username,
        password,
      });
      storeTokens(data);
      await refreshUser();

      if (data.must_change_password) {
        setMustChangePassword(true);
        return true;
      }
      return false;
    },
    [refreshUser]
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.post("/api/v1/auth/logout");
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

      await apiClient.post(`/api/v1/users/${user.id}/password`, {
        current_password: currentPassword,
        new_password: newPassword,
      });

      setMustChangePassword(false);
    },
    [user]
  );

  const clearMustChangePassword = useCallback(() => {
    setMustChangePassword(false);
  }, []);

  // Check for existing token on mount, auto-login in demo mode
  useEffect(() => {
    async function initAuth(): Promise<void> {
      // Try to authenticate via httpOnly cookies (sent automatically by browser).
      // refreshUser will set user state if a valid session cookie exists.
      try {
        const { data } = await apiClient.get<User>("/api/v1/auth/me");
        if (data) {
          setUser(data);
          setIsLoading(false);
          return;
        }
      } catch {
        // Not authenticated via cookie, continue
      }

      // Also check for legacy localStorage tokens (migration path)
      const legacyToken = localStorage.getItem("access_token");
      if (legacyToken) {
        await refreshUser();
        // Clean up legacy tokens since cookies are now used
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        setIsLoading(false);
        return;
      }

      // In demo mode, auto-login as admin so visitors see the full UI
      await attemptDemoAutoLogin();
      setIsLoading(false);
    }

    async function attemptDemoAutoLogin(): Promise<void> {
      try {
        const healthRes = await fetch("/health");
        const health = await healthRes.json();
        if (health.demo_mode !== true) return;

        const { data } = await apiClient.post<LoginResponse>("/api/v1/auth/login", {
          username: "admin",
          password: "demo",
        });
        storeTokens(data);
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
        login,
        logout,
        refreshUser,
        changePassword,
        clearMustChangePassword,
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
