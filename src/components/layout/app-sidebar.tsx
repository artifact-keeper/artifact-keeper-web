"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import {
  useFeatureFlags,
  useHiddenNavItems,
} from "@/providers/system-config-provider";
import { adminApi } from "@/lib/api/admin";
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
import { currentWebBuildLabel } from "@/lib/build-version";
import {
  NAV_GROUPS,
  filterHiddenNavItems,
  type NavGroup,
  type NavItem,
} from "./nav-items";

function NavGroupSection({
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
  const flags = useFeatureFlags();

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: () => adminApi.getHealth(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const hiddenNavItems = useHiddenNavItems();

  // Scanner-dependent security entries are hidden when the backend reports
  // no scanner configured (#271). "Scan Results" needs Trivy or OpenSCAP;
  // "DT Projects" needs the Dependency-Track integration. The rest of the
  // Security group (policies, permissions, quality gates) is always shown
  // since it doesn't depend on a scanner being wired up.
  const featureAvailable = (item: NavItem): boolean => {
    if (item.href === "/security/scans") {
      return flags.trivyEnabled || flags.openscapEnabled;
    }
    if (item.href === "/security/dt-projects") {
      return flags.dependencyTrackEnabled;
    }
    return true;
  };

  const groupVisible = (group: NavGroup): boolean => {
    if (group.audience === "admin") return isAdmin;
    if (group.audience === "authenticated") return isAuthenticated;
    return true;
  };

  // Entries an administrator hid for everyone are dropped last (#968). That
  // only changes the menu: the pages keep their own permission checks. A
  // group left with no entries is not rendered at all.
  const visibleGroups = NAV_GROUPS.filter(groupVisible)
    .map((group) => ({
      ...group,
      items: filterHiddenNavItems(
        group.items.filter(
          (item) => (!item.adminOnly || isAdmin) && featureAvailable(item),
        ),
        hiddenNavItems,
      ),
    }))
    .filter((group) => group.items.length > 0);

  const webBuild = currentWebBuildLabel();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <Image
                  src="/logo-48.png"
                  alt="Artifact Keeper"
                  width={32}
                  height={32}
                  className="rounded-md"
                />
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Artifact Keeper</span>
                  <span className="text-xs text-muted-foreground" title={webBuild.title}>
                    Web {webBuild.label}
                    {health?.version ? ` / Server ${health.version}` : ""}
                    {health?.dirty && health?.commit
                      ? ` (${health.commit.slice(0, 7)})`
                      : ""}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="pb-4">
        {visibleGroups.map((group) => (
          <NavGroupSection
            key={group.label}
            label={group.label}
            items={group.items}
            pathname={pathname}
          />
        ))}
      </SidebarContent>
      <SidebarFooter />
      <SidebarRail />
    </Sidebar>
  );
}
