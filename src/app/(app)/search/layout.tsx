import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { loadMessages } from "@/i18n/load-messages";

export default async function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await loadMessages(locale, ["core", "app", "search"]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
