"use client";

import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

export default function ServerErrorPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="flex size-20 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950/30 mb-6">
          <AlertTriangle className="size-10 text-amber-500 dark:text-amber-400" />
        </div>
        <h1 className="text-7xl font-bold tracking-tighter text-foreground">
          500
        </h1>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">
          Something Went Wrong
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          An unexpected server error occurred. Try refreshing the page or come
          back later. If the problem persists, contact support.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Home className="size-4" />
            Go to Dashboard
          </Link>
          <button
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <RefreshCw className="size-4" />
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
