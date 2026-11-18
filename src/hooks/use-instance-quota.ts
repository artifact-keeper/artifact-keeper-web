"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { adminApi } from "@/lib/api/admin";
import { quotaApi, quotaKeys } from "@/lib/api/quota";
import type { InstanceQuota } from "@/lib/quota";

/** Quota usage moves slowly; refresh it every few minutes while the app is open. */
const QUOTA_STALE_MS = 60_000;
const QUOTA_REFRESH_MS = 5 * 60_000;

/**
 * The instance-wide quotas for the signed-in user, or null when none are
 * configured, the backend predates them, or nobody is signed in.
 *
 * Administrators read them from `GET /api/v1/admin/stats`, which the
 * dashboard already loads under the same query key, so the two share one
 * request. Everyone else reads `GET /api/v1/system/quota`.
 */
export function useInstanceQuota(): InstanceQuota | null {
  const { user, isAuthenticated } = useAuth();
  const isAdmin = !!user?.is_admin;

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminApi.getStats(),
    enabled: isAuthenticated && isAdmin,
    staleTime: QUOTA_STALE_MS,
    refetchInterval: QUOTA_REFRESH_MS,
  });

  const { data: systemQuota } = useQuery({
    queryKey: quotaKeys.system,
    queryFn: () => quotaApi.get(),
    enabled: isAuthenticated && !isAdmin,
    staleTime: QUOTA_STALE_MS,
    refetchInterval: QUOTA_REFRESH_MS,
    retry: false,
  });

  if (!isAuthenticated) return null;
  return (isAdmin ? stats?.quota : systemQuota) ?? null;
}
