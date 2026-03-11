"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AuthError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    console.error("Auth route error:", error);
  }, [error]);

  return (
    <Card className="w-full">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10 mb-4">
          <AlertTriangle className="size-7 text-destructive" />
        </div>
        <CardTitle className="text-lg">Authentication Error</CardTitle>
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <p className="text-sm text-muted-foreground">
          Something went wrong during authentication. Please try again.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <Button onClick={reset} variant="default" size="sm" className="w-full">
          <RefreshCw className="mr-2 size-4" />
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
