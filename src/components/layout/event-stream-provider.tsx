"use client";

import { useEventStream } from "@/hooks/use-event-stream";

/** Client component that activates the SSE event stream for live data updates. */
export function EventStreamProvider() {
  useEventStream();
  return null;
}
