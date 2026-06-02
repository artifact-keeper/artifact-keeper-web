"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  systemConfigApi,
  anyScannerEnabled,
  DEFAULT_SYSTEM_CONFIG,
  type SystemConfig,
} from "@/lib/api/system-config";

/**
 * Provides the backend's public runtime configuration
 * (`GET /api/v1/system/config`) to the whole app and derives the feature flags
 * the UI uses to show or hide gated surfaces (#271).
 *
 * The query runs once and is cached for the session; config rarely changes at
 * runtime and is cheap to re-fetch on a hard reload. While loading or on error
 * the context exposes `DEFAULT_SYSTEM_CONFIG` so consumers always read a
 * concrete object and never have to null-check.
 */

export interface FeatureFlags {
  /** Any vulnerability or compliance scanner is configured. */
  scanningEnabled: boolean;
  trivyEnabled: boolean;
  openscapEnabled: boolean;
  /** Dependency-Track integration is wired up and reachable. */
  dependencyTrackEnabled: boolean;
  /** An SSO/OIDC provider is available for login. */
  ssoEnabled: boolean;
  oidcEnabled: boolean;
  ldapEnabled: boolean;
  /** Anonymous browsing/download is permitted (#850). */
  guestAccessEnabled: boolean;
  /** Instance is read-only (writes blocked). */
  demoMode: boolean;
}

interface SystemConfigContextValue {
  config: SystemConfig;
  flags: FeatureFlags;
  isLoading: boolean;
  isError: boolean;
}

function deriveFlags(config: SystemConfig): FeatureFlags {
  return {
    scanningEnabled: anyScannerEnabled(config),
    trivyEnabled: config.scanners.trivy_enabled,
    openscapEnabled: config.scanners.openscap_enabled,
    dependencyTrackEnabled: config.scanners.dependency_track_enabled,
    ssoEnabled: config.auth.sso_enabled || config.auth.oidc_enabled,
    oidcEnabled: config.auth.oidc_enabled,
    ldapEnabled: config.auth.ldap_enabled,
    guestAccessEnabled: config.guest_access_enabled,
    demoMode: config.demo_mode,
  };
}

const SystemConfigContext = createContext<SystemConfigContextValue | null>(null);

export const SYSTEM_CONFIG_QUERY_KEY = ["system-config"] as const;

export function SystemConfigProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: SYSTEM_CONFIG_QUERY_KEY,
    queryFn: () => systemConfigApi.getConfig(),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const config = data ?? DEFAULT_SYSTEM_CONFIG;

  return (
    <SystemConfigContext.Provider
      value={{ config, flags: deriveFlags(config), isLoading, isError }}
    >
      {children}
    </SystemConfigContext.Provider>
  );
}

/** Full system config plus loading/error state. */
export function useSystemConfig(): SystemConfigContextValue {
  const ctx = useContext(SystemConfigContext);
  if (!ctx) {
    throw new Error(
      "useSystemConfig must be used within a SystemConfigProvider"
    );
  }
  return ctx;
}

/** Just the derived feature flags, the common case for gating UI. */
export function useFeatureFlags(): FeatureFlags {
  return useSystemConfig().flags;
}
