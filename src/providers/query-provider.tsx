"use client";

import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { invalidateGroup } from "@/lib/query-keys";
import { initTabUnfreezeGuards } from "@/lib/tab-unfreeze";

export function QueryProvider({ children }: { children: ReactNode }) {
  // #558: absorb Chromium's cookieless first request after a frozen tab
  // reactivates with a disposable warm-up call, and arm the refresh retry.
  useEffect(() => {
    initTabUnfreezeGuards();
  }, []);

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
