"use client";

import { useDocumentTitle } from "@/hooks/use-document-title";

import { ErrorPage } from "@/components/common/error-page";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ServerErrorPage() {
  useDocumentTitle("Server Error");
  return (
    <ErrorPage
      icon={AlertTriangle}
      iconContainerClassName="bg-amber-100 dark:bg-amber-950/30"
      iconClassName="text-amber-500 dark:text-amber-400"
      code="500"
      title="Something Went Wrong"
      description="An unexpected server error occurred. Try refreshing the page or come back later. If the problem persists, contact support."
      actionLabel="Refresh"
      actionIcon={RefreshCw}
      onAction={() => {
        if (typeof window !== "undefined") window.location.reload();
      }}
    />
  );
}
