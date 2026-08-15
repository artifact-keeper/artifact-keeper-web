"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ShieldAlert, RefreshCw, Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  const t = useTranslations("app/admin/error");
  useEffect(() => {
    console.error("Admin route error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 mb-6">
          <ShieldAlert className="size-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">
          {t("title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {t("description")}
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-muted-foreground font-mono">
            {t("errorId")}: {error.digest}
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
              {t("dashboard")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
