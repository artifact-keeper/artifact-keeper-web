"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetch";
import { useAuth } from "@/providers/auth-provider";

/** Shared by every caller, so the sidebar and the dashboards ask once. */
export const CAN_LIST_FINDINGS_QUERY_KEY = [
  "security",
  "findings",
  "can-list",
] as const;

/**
 * Whether the signed-in user may open the vulnerability drill-down
 * (`GET /api/v1/admin/security/findings`, artifact-keeper#5865).
 *
 * The endpoint answers only an instance administrator with an unscoped
 * credential; a repository-scoped admin token gets 403, and an older backend
 * without the route answers 404. The client cannot tell a scoped credential
 * from an unscoped one, so, like the "Every repository" acknowledgement
 * option on the scan page, a 200 from a one-row request is what earns the
 * links. Non-admins are never asked.
 */
export function useCanListFindings(): boolean {
  const { user } = useAuth();
  const isAdmin = !!user?.is_admin;
  const { isSuccess } = useQuery({
    queryKey: CAN_LIST_FINDINGS_QUERY_KEY,
    queryFn: () =>
      apiFetch<unknown>("/api/v1/admin/security/findings?per_page=1", {
        method: "GET",
      }),
    enabled: isAdmin,
    retry: false,
    staleTime: 60_000,
  });
  return isAdmin && isSuccess;
}
