"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  Boxes,
  Hammer,
  Globe,
  RefreshCw,
  Puzzle,
  Blocks,
  Webhook,
  ArrowRightLeft,
  Bot,
  BookOpen,
  GitPullRequestArrow,
  Workflow,
  Key,
  PackageCheck,
  FileSignature,
  Shield,
  ShieldCheck,
  ListChecks,
  Search,
  FileCheck,
  Lock,
  Users,
  UsersRound,
  HardDrive,
  KeyRound,
  Settings,
  BarChart3,
  Recycle,
  Radio,
  Activity,
  HeartPulse,
  Scale,
  FolderSearch,
  ClipboardCheck,
  Filter,
  Gauge,
  ScrollText,
  Network,
  Crosshair,
  Hourglass,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import { useFeatureFlags } from "@/providers/system-config-provider";
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

interface NavItem {
  /** Translation key under `sidebar.nav`. */
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const overviewItems: NavItem[] = [
  { title: "dashboard", href: "/", icon: LayoutDashboard },
];

const artifactItems: NavItem[] = [
  { title: "repositories", href: "/repositories", icon: Database },
  { title: "packages", href: "/packages", icon: Boxes },
  { title: "builds", href: "/builds", icon: Hammer },
  { title: "staging", href: "/staging", icon: GitPullRequestArrow },
  { title: "setupGuide", href: "/setup", icon: BookOpen },
];

const integrationItems: NavItem[] = [
  { title: "peers", href: "/peers", icon: Globe },
  { title: "replication", href: "/replication", icon: RefreshCw },
  { title: "syncPolicies", href: "/sync-policies", icon: Workflow },
  { title: "plugins", href: "/plugins", icon: Puzzle },
  { title: "formatHandlers", href: "/format-handlers", icon: Blocks },
  { title: "webhooks", href: "/webhooks", icon: Webhook },
  { title: "accessTokens", href: "/access-tokens", icon: Key },
  { title: "migration", href: "/migration", icon: ArrowRightLeft },
];

const securityItems: NavItem[] = [
  { title: "securityDashboard", href: "/security", icon: Shield },
  { title: "scanResults", href: "/security/scans", icon: Search },
  { title: "blastRadius", href: "/security/blast-radius", icon: Crosshair },
  { title: "dtProjects", href: "/security/dt-projects", icon: FolderSearch },
  { title: "qualityGates", href: "/quality-gates", icon: ShieldCheck },
  { title: "qualityChecks", href: "/quality-checks", icon: ListChecks },
  { title: "policies", href: "/security/policies", icon: FileCheck },
  { title: "licensePolicies", href: "/license-policies", icon: Scale },
  { title: "curation", href: "/curation", icon: PackageCheck },
  { title: "ageGate", href: "/age-gate", icon: Hourglass },
  { title: "signing", href: "/signing", icon: FileSignature },
  { title: "permissions", href: "/permissions", icon: Lock },
];

const operationsItems: NavItem[] = [
  { title: "analytics", href: "/analytics", icon: BarChart3 },
  { title: "downloads", href: "/downloads", icon: Network },
  { title: "approvals", href: "/approvals", icon: ClipboardCheck },
  { title: "promotionRules", href: "/promotion-rules", icon: Filter },
  { title: "health", href: "/system-health", icon: HeartPulse },
  { title: "lifecycle", href: "/lifecycle", icon: Recycle },
  { title: "monitoring", href: "/monitoring", icon: Activity },
  { title: "telemetry", href: "/telemetry", icon: Radio },
];

const adminItems: NavItem[] = [
  { title: "users", href: "/users", icon: Users },
  { title: "groups", href: "/groups", icon: UsersRound },
  { title: "serviceAccounts", href: "/service-accounts", icon: Bot },
  { title: "rateLimits", href: "/rate-limits", icon: Gauge },
  { title: "auditLog", href: "/audit", icon: ScrollText },
  { title: "backups", href: "/backups", icon: HardDrive },
  { title: "ssoProviders", href: "/settings/sso", icon: KeyRound },
  { title: "settings", href: "/settings", icon: Settings },
];

function NavGroup({
  labelKey,
  items,
  pathname,
}: {
  /** Translation key under `sidebar.groups`. */
  labelKey: string;
  items: NavItem[];
  pathname: string;
}) {
  const t = useTranslations("sidebar");
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t(`groups.${labelKey}`)}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const label = t(`nav.${item.title}`);
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href}
                tooltip={label}
              >
                <Link href={item.href}>
                  <item.icon className="size-4" />
                  <span>{label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
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

  // For integration items, non-admin authenticated users don't see Migration
  const visibleIntegrationItems = isAdmin
    ? integrationItems
    : integrationItems.filter((item) => item.href !== "/migration");

  // Hide scanner-dependent security entries when the backend reports no
  // scanner configured (#271). "Scan Results" needs Trivy or OpenSCAP;
  // "DT Projects" needs the Dependency-Track integration. The rest of the
  // Security group (policies, permissions, quality gates) is always shown
  // since it doesn't depend on a scanner being wired up.
  const visibleSecurityItems = securityItems.filter((item) => {
    if (item.href === "/security/scans") {
      return flags.trivyEnabled || flags.openscapEnabled;
    }
    if (item.href === "/security/dt-projects") {
      return flags.dependencyTrackEnabled;
    }
    return true;
  });

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
                  <span className="text-xs text-muted-foreground">
                    Web {process.env.NEXT_PUBLIC_APP_VERSION}
                    {process.env.NEXT_PUBLIC_APP_VERSION?.includes("-") &&
                    process.env.NEXT_PUBLIC_GIT_SHA &&
                    process.env.NEXT_PUBLIC_GIT_SHA !== "unknown"
                      ? ` (${process.env.NEXT_PUBLIC_GIT_SHA.slice(0, 7)})`
                      : ""}
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
        <NavGroup labelKey="overview" items={overviewItems} pathname={pathname} />
        <NavGroup labelKey="artifacts" items={artifactItems} pathname={pathname} />
        {isAuthenticated && (
          <NavGroup
            labelKey="integration"
            items={visibleIntegrationItems}
            pathname={pathname}
          />
        )}
        {isAdmin && (
          <>
            <NavGroup
              labelKey="security"
              items={visibleSecurityItems}
              pathname={pathname}
            />
            <NavGroup
              labelKey="operations"
              items={operationsItems}
              pathname={pathname}
            />
            <NavGroup
              labelKey="administration"
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
