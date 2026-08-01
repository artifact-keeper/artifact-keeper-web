import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { settingsApi, type AdminSettings } from "@/lib/api/settings";

/**
 * Shared query for the bundled `/api/v1/admin/settings` response.
 *
 * The admin Settings page fetches all settings slices (password policy,
 * storage, SMTP, environment) through this one query. Always go through this
 * hook rather than declaring a separate `useQuery` with hand-matched options:
 * react-query deduplicates by serialized `queryKey`, so any drift between
 * call sites silently doubles the network traffic. See #349.
 */
export function useAdminSettings(): UseQueryResult<AdminSettings, Error> {
  return useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => settingsApi.getAllSettings(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export const ADMIN_SETTINGS_QUERY_KEY = ["admin-settings"] as const;
