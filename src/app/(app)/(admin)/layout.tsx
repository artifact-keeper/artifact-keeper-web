import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { RequireAdmin } from "@/components/auth/require-admin";
import { loadMessages } from "@/i18n/load-messages";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await loadMessages(locale, ["core", "app", "admin"]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <RequireAdmin>{children}</RequireAdmin>
    </NextIntlClientProvider>
  );
}
