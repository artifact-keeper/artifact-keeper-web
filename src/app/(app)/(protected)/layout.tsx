import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { RequireAuth } from "@/components/auth/require-auth";
import { CORE_ROOTS, loadMessages } from "@/i18n/load-messages";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await loadMessages(locale, [
    ...CORE_ROOTS,
    "(app)",
    "(app)/(protected)",
  ]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <RequireAuth>{children}</RequireAuth>
    </NextIntlClientProvider>
  );
}
