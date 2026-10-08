import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { DemoBanner } from "@/components/layout/demo-banner";
import { PasswordExpiryBanner } from "@/components/layout/password-expiry-banner";
import { EventStreamProvider } from "@/components/layout/event-stream-provider";
import { SkipNavLink } from "@/components/layout/skip-nav-link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <SkipNavLink />
      <EventStreamProvider />
      <AppSidebar />
      {/* min-w-0: a flex item defaults to min-width:auto, so one wide child
          (the repositories split view, a long table) widened the whole
          column past the viewport instead of being bounded by it. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <DemoBanner />
        <PasswordExpiryBanner />
        <AppHeader />
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 p-6">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
