"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  Package,
  Boxes,
  Hammer,
  Globe,
  RefreshCw,
  Puzzle,
  Webhook,
  ArrowRightLeft,
  BookOpen,
  Shield,
  Search,
  FileCheck,
  Lock,
  Users,
  UsersRound,
  HardDrive,
  Settings,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const overviewItems: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
];

const artifactItems: NavItem[] = [
  { title: "Repositories", href: "/repositories", icon: Database },
  { title: "Artifacts", href: "/artifacts", icon: Package },
  { title: "Packages", href: "/packages", icon: Boxes },
  { title: "Builds", href: "/builds", icon: Hammer },
];

const integrationItems: NavItem[] = [
  { title: "Edge Nodes", href: "/edge-nodes", icon: Globe },
  { title: "Replication", href: "/replication", icon: RefreshCw },
  { title: "Plugins", href: "/plugins", icon: Puzzle },
  { title: "Webhooks", href: "/webhooks", icon: Webhook },
  { title: "Migration", href: "/migration", icon: ArrowRightLeft },
  { title: "Set Me Up", href: "/setup", icon: BookOpen },
];

const securityItems: NavItem[] = [
  { title: "Dashboard", href: "/security", icon: Shield },
  { title: "Scan Results", href: "/security/scans", icon: Search },
  { title: "Policies", href: "/security/policies", icon: FileCheck },
  { title: "Permissions", href: "/permissions", icon: Lock },
];

const adminItems: NavItem[] = [
  { title: "Users", href: "/users", icon: Users },
  { title: "Groups", href: "/groups", icon: UsersRound },
  { title: "Backups", href: "/backups", icon: HardDrive },
  { title: "Settings", href: "/settings", icon: Settings },
];

function NavGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={pathname === item.href}
              tooltip={item.title}
            >
              <Link href={item.href}>
                <item.icon className="size-4" />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { isAuthenticated, user } = useAuth();
  const isAdmin = user?.is_admin ?? false;

  // For integration items, non-admin authenticated users don't see Migration
  const visibleIntegrationItems = isAdmin
    ? integrationItems
    : integrationItems.filter((item) => item.href !== "/migration");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md text-sm font-bold">
                  AK
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Artifact Keeper</span>
                  <span className="text-xs text-muted-foreground">v1.0.0</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavGroup label="Overview" items={overviewItems} pathname={pathname} />
        <NavGroup label="Artifacts" items={artifactItems} pathname={pathname} />
        {isAuthenticated && (
          <NavGroup
            label="Integration"
            items={visibleIntegrationItems}
            pathname={pathname}
          />
        )}
        {isAdmin && (
          <>
            <NavGroup
              label="Security"
              items={securityItems}
              pathname={pathname}
            />
            <NavGroup
              label="Administration"
              items={adminItems}
              pathname={pathname}
            />
          </>
        )}
      </SidebarContent>
      <SidebarFooter />
      <SidebarRail />
    </Sidebar>
  );
}
