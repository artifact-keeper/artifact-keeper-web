import { useQuery } from "@tanstack/react-query";
import { repositoriesApi } from "@/lib/api/repositories";

export function useRpmRepodataCapabilities(enabled: boolean) {
  return useQuery({
    queryKey: ["rpm-repodata-capabilities"],
    queryFn: () => repositoriesApi.repodataSupport(),
    enabled,
    retry: false,
  });
}
