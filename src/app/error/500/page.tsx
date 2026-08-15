"use client";

import { useDocumentTitle } from "@/hooks/use-document-title";
import { useTranslations } from "next-intl";

import { ErrorPage } from "@/components/common/error-page";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ServerErrorPage() {
  const t = useTranslations("errorPages");
  useDocumentTitle(t("serverError"));
  return (
    <ErrorPage
      icon={AlertTriangle}
      iconContainerClassName="bg-amber-100 dark:bg-amber-950/30"
      iconClassName="text-amber-500 dark:text-amber-400"
      code="500"
      title={t("somethingWentWrong")}
      description={t("serverErrorDescription")}
      actionLabel={t("refresh")}
      actionIcon={RefreshCw}
      onAction={() => {
        if (typeof window !== "undefined") window.location.reload();
      }}
    />
  );
}
