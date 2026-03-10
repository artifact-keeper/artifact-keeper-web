"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    console.error("App route error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 mb-6">
          <AlertTriangle className="size-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          An unexpected error occurred while loading this page. You can try
          again, or go back to the dashboard.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-muted-foreground font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="mt-6 flex items-center gap-3">
          <Button onClick={reset} variant="default" size="sm">
            <RefreshCw className="mr-2 size-4" />
            Try again
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/">
              <Home className="mr-2 size-4" />
              Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
