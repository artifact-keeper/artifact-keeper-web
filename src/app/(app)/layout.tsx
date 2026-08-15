import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { DemoBanner } from "@/components/layout/demo-banner";
import { PasswordExpiryBanner } from "@/components/layout/password-expiry-banner";
import { EventStreamProvider } from "@/components/layout/event-stream-provider";
import { SkipNavLink } from "@/components/layout/skip-nav-link";
import { loadMessages } from "@/i18n/load-messages";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await loadMessages(locale, ["core", "app"]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SidebarProvider>
        <SkipNavLink />
        <EventStreamProvider />
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <DemoBanner />
          <PasswordExpiryBanner />
          <AppHeader />
          <main id="main-content" tabIndex={-1} className="flex-1 p-6">
            {children}
          </main>
        </div>
      </SidebarProvider>
    </NextIntlClientProvider>
  );
}
