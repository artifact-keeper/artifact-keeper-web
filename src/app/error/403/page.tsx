"use client";

import { useDocumentTitle } from "@/hooks/use-document-title";
import { useTranslations } from "next-intl";

import { ErrorPage } from "@/components/common/error-page";
import { ShieldX, ArrowLeft } from "lucide-react";

export default function ForbiddenPage() {
  const t = useTranslations("error/403");
  useDocumentTitle(t("accessDenied"));
  return (
    <ErrorPage
      icon={ShieldX}
      iconContainerClassName="bg-red-100 dark:bg-red-950/30"
      iconClassName="text-red-500 dark:text-red-400"
      code="403"
      title={t("accessDenied")}
      description={t("accessDeniedDescription")}
      actionLabel={t("goBack")}
      actionIcon={ArrowLeft}
      onAction={() => {
        if (typeof window !== "undefined") window.history.back();
      }}
    />
  );
}
