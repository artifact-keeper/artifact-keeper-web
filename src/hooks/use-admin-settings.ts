import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { settingsApi, type AdminSettings } from "@/lib/api/settings";

/**
 * Shared query for the bundled `/api/v1/admin/settings` response.
 *
 * The admin Settings page and its SmtpSettingsTab both need this data. They
 * used to declare two `useQuery` calls with hand-matched options; react-query
 * deduplicates by serialized `queryKey`, so any drift between the two call
 * sites silently doubled the network traffic. Routing both through this hook
 * makes the dedup invariant impossible to violate. See #349.
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
