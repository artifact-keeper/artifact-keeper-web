import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { CORE_ROOTS, loadMessages } from "@/i18n/load-messages";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await loadMessages(locale, [...CORE_ROOTS, "(auth)"]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="relative flex min-h-svh items-center justify-center bg-gradient-to-br from-muted/50 to-muted p-4">
        {/* Language switcher stays reachable on unauthenticated screens too */}
        <div className="absolute right-4 top-4">
          <LocaleSwitcher />
        </div>
        <div className="w-full max-w-md">{children}</div>
      </div>
    </NextIntlClientProvider>
  );
}
