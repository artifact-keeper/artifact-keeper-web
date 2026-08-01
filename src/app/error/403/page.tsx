"use client";

import { useDocumentTitle } from "@/hooks/use-document-title";

import { ErrorPage } from "@/components/common/error-page";
import { ShieldX, ArrowLeft } from "lucide-react";

export default function ForbiddenPage() {
  useDocumentTitle("Access Denied");
  return (
    <ErrorPage
      icon={ShieldX}
      iconContainerClassName="bg-red-100 dark:bg-red-950/30"
      iconClassName="text-red-500 dark:text-red-400"
      code="403"
      title="Access Denied"
      description="You don't have permission to access this resource. If you believe this is an error, contact your administrator."
      actionLabel="Go Back"
      actionIcon={ArrowLeft}
      onAction={() => {
        if (typeof window !== "undefined") window.history.back();
      }}
    />
  );
}
