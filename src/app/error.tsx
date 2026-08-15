"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export default function RootError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  const t = useTranslations("error");

  useEffect(() => {
    console.error("Root error:", error);
  }, [error]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 mb-6">
          <AlertTriangle className="size-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">
          {t("somethingWentWrong")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {t("rootDescription")}
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-muted-foreground font-mono">
            {t("errorId", { digest: error.digest })}
          </p>
        )}
        <div className="mt-6 flex items-center gap-3">
          <Button onClick={reset} variant="default" size="sm">
            <RefreshCw className="mr-2 size-4" />
            {t("tryAgain")}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/">
              <Home className="mr-2 size-4" />
              {t("goToDashboard")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
