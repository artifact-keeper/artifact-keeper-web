import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { loadMessages } from "@/i18n/load-messages";

export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await loadMessages(locale, ["core", "app", "guides", "setup"]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
