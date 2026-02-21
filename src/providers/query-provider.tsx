"use client";

import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      mutationCache: new MutationCache({
        onSuccess: () => {
          // Dashboard stats are aggregate counts affected by any data mutation.
          // The cost of one extra background GET is negligible vs stale numbers.
          client.invalidateQueries({ queryKey: ["admin-stats"] });
          client.invalidateQueries({ queryKey: ["recent-repositories"] });
        },
      }),
      defaultOptions: {
        queries: {
          staleTime: 30_000,
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
