"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { getKeysForEvent, invalidateGroup } from "@/lib/query-keys";

/**
 * Connects to the backend SSE event stream and invalidates TanStack Query
 * caches when domain events arrive. Automatically connects when authenticated
 * and disconnects on logout or unmount.
 */
export function useEventStream() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!user) return;

    const es = new EventSource("/api/v1/events/stream", {
      withCredentials: true,
    });
    esRef.current = es;

    es.addEventListener("entity.changed", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { type: string };
        const keys = getKeysForEvent(data.type);
        for (const key of keys) {
          queryClient.invalidateQueries({ queryKey: [...key] });
        }
        // Dashboard stats can be affected by any entity change
        invalidateGroup(queryClient, "dashboard");
      } catch {
        // Malformed event data - ignore
      }
    });

    es.addEventListener("lagged", () => {
      // Subscriber fell behind - invalidate everything for a full refresh
      queryClient.invalidateQueries();
    });

    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do here
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [user, queryClient]);
}
