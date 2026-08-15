import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { CORE_ROOTS, loadMessages } from "@/i18n/load-messages";

export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await loadMessages(locale, [
    ...CORE_ROOTS,
    "(app)",
    "(app)/setup",
  ]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
