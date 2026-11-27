"use client";

import type { ReactNode } from "react";
import { Loader2, ServerOff } from "lucide-react";

import { useExceptionsSupported } from "@/hooks/use-exceptions-supported";
import { EXCEPTIONS_MIN } from "@/lib/backend-version";

/**
 * Renders `children` only on a backend with the exception queue. Otherwise
 * it says which backend release is needed, and the children (and the
 * queries they would fire) are never mounted.
 */
export function RequireExceptionsBackend({ children }: { children: ReactNode }) {
  const { supported, isLoading } = useExceptionsSupported();
  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!supported) {
    return (
      <div
        role="status"
        className="mx-auto mt-10 flex max-w-md flex-col items-center gap-2 text-center"
      >
        <ServerOff className="size-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Package exceptions are not available</h1>
        <p className="text-sm text-muted-foreground">
          The exception queue requires backend {EXCEPTIONS_MIN} or later. Ask an
          administrator to upgrade the server.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
