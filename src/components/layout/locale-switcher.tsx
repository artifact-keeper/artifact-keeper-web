"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { LOCALE_COOKIE, locales } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Each locale shown in its own language (endonym), independent of messages. */
const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  zh: "中文",
};

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("localeSwitcher");
  const [pendingLocale, setPendingLocale] = useState<string | null>(null);

  // Persist the choice and reload. The cookie write + reload live in an
  // effect (a legitimate side-effect location) rather than the click handler,
  // satisfying the react-hooks/immutability rule.
  useEffect(() => {
    if (!pendingLocale || pendingLocale === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${pendingLocale}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  }, [pendingLocale, locale]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("label")}>
          <Languages className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((code) => (
          <DropdownMenuItem
            key={code}
            disabled={code === locale}
            onClick={() => setPendingLocale(code)}
          >
            {LOCALE_LABELS[code] ?? code}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
