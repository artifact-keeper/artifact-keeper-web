"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

export function DemoBanner() {
  const t = useTranslations("components/layout/demo-banner");
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    fetch("/health")
      .then((res) => res.json())
      .then((data) => setDemoMode(data.demo_mode === true))
      .catch(() => {});
  }, []);

  if (!demoMode) return null;

  return (
    <div className="sticky top-0 z-50 border-b border-yellow-300 bg-yellow-50 px-4 py-2 text-center text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200">
      {t("message")}{" "}
      <a
        href="https://artifactkeeper.com"
        className="font-semibold underline underline-offset-2"
      >
        {t("deploy")}
      </a>
    </div>
  );
}
