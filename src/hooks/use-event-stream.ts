"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { getKeysForEvent, invalidateGroup } from "@/lib/query-keys";

const RETRY_DELAY_MS = 30_000;

/**
 * Connects to the backend SSE event stream and invalidates TanStack Query
 * caches when domain events arrive. Automatically connects when authenticated
 * and disconnects on logout or unmount. If the endpoint is unavailable the
 * hook closes the connection and retries after a delay instead of allowing
 * EventSource's aggressive built-in reconnect.
 */
export function useEventStream() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      if (cancelled) return;

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
          invalidateGroup(queryClient, "dashboard");
        } catch {
          // Malformed event data - ignore
        }
      });

      es.addEventListener("lagged", () => {
        queryClient.invalidateQueries();
      });

      es.onerror = () => {
        // Close immediately to prevent aggressive built-in reconnect.
        // Retry after a delay so we don't spam a non-existent endpoint.
        es.close();
        esRef.current = null;
        if (!cancelled) {
          retryTimer = setTimeout(connect, RETRY_DELAY_MS);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [user, queryClient]);
}
