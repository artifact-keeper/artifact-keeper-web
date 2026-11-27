"use client";

import { KeyRound } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useInstance } from "@/providers/instance-provider";

/**
 * Shown when the active remote instance refused its stored API key while the
 * local session is valid (#1227). Without it the shell just looked signed out.
 */
export function RemoteKeyRejectedBanner() {
  const { remoteKeyRejected } = useAuth();
  const { activeInstance, switchInstance } = useInstance();

  if (!remoteKeyRejected || activeInstance.id === "local") return null;

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <KeyRound className="size-4 shrink-0" aria-hidden="true" />
      <span>
        The remote instance <strong>{activeInstance.name}</strong> rejected its
        API key. Remove it and add it again with a valid key, or{" "}
        <button
          type="button"
          onClick={() => switchInstance("local")}
          className="font-semibold underline underline-offset-2"
        >
          switch back to Local
        </button>
        .
      </span>
    </div>
  );
}
