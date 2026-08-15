"use client";

import Link from "next/link";
import { FileQuestion, ArrowLeft, Home } from "lucide-react";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("not-found");
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="flex size-20 items-center justify-center rounded-2xl bg-muted mb-6">
          <FileQuestion className="size-10 text-muted-foreground" />
        </div>
        <h1 className="text-7xl font-bold tracking-tighter text-foreground">
          404
        </h1>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">
          {t("title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {t("description")}
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Home className="size-4" />
            {t("goToDashboard")}
          </Link>
          <button
            onClick={() => {
              if (typeof window !== "undefined") window.history.back();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            {t("goBack")}
          </button>
        </div>
      </div>
    </div>
  );
}
