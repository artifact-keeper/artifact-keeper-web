import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { DemoBanner } from "@/components/layout/demo-banner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex flex-1 flex-col">
        <DemoBanner />
        <AppHeader />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </SidebarProvider>
  );
}
