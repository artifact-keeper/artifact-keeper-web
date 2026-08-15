import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { CORE_ROOTS, loadMessages } from "@/i18n/load-messages";

/**
 * Repositories area (list + [key] detail) loads its own message directory so
 * the repositories messages are only sent to clients that actually render
 * them.
 */
export default async function RepositoriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await loadMessages(locale, [
    ...CORE_ROOTS,
    "(app)",
    "(app)/repositories",
  ]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
