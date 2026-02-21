"use client";

import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { invalidateGroup } from "@/lib/query-keys";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      mutationCache: new MutationCache({
        onSuccess: () => {
          // Dashboard stats are aggregate counts affected by any data mutation.
          invalidateGroup(client, "dashboard");
        },
      }),
      defaultOptions: {
        queries: {
          staleTime: 2 * 60 * 1000, // 2 minutes (SSE pushes invalidation for real-time updates)
          retry: 1,
          refetchOnWindowFocus: true,
          refetchOnReconnect: true,
        },
      },
    });
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
