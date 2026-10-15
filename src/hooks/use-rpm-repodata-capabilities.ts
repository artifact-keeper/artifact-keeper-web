import { useQuery } from "@tanstack/react-query";
import { repositoriesApi } from "@/lib/api/repositories";
import { QUERY_KEYS } from "@/lib/query-keys";

export function useRpmRepodataCapabilities(enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.RPM_REPODATA_CAPABILITIES,
    queryFn: () => repositoriesApi.repodataSupport(),
    enabled,
    retry: false,
  });
}
