"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import { backendAtLeast, EXCEPTIONS_MIN } from "@/lib/backend-version";

/**
 * Whether the connected backend has the package exception queue
 * (`EXCEPTIONS_MIN`). Reads the shared, cached `/health` query, and fails
 * closed: an unknown, unparseable or pre-release version is unsupported.
 * `isLoading` is true until `/health` has answered, so a page can wait
 * rather than flash the "needs a newer backend" state.
 */
export function useExceptionsSupported(): {
  supported: boolean;
  isLoading: boolean;
} {
  const { data: health, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: () => adminApi.getHealth(),
    staleTime: 5 * 60 * 1000,
  });
  return {
    supported: backendAtLeast(health?.version, EXCEPTIONS_MIN),
    isLoading,
  };
}
