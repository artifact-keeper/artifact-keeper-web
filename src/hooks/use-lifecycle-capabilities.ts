import { useQuery } from "@tanstack/react-query";
import { lifecycleApi } from "@/lib/api/lifecycle";

export function useLifecycleCapabilities(enabled: boolean) {
  return useQuery({
    queryKey: ["lifecycle-capabilities"],
    queryFn: () => lifecycleApi.assignmentSupport(),
    enabled,
    retry: false,
  });
}
