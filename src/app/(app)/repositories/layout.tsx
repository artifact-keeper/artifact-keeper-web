import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { loadMessages } from "@/i18n/load-messages";

/**
 * Repositories area (list + [format]/[key] detail) provides its own message
 * groups so the repositories/package-format namespaces are only sent to
 * clients that actually render them.
 */
export default async function RepositoriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await loadMessages(locale, [
    "core",
    "app",
    "guides",
    "repositories",
  ]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
