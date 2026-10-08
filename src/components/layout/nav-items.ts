import type { ComponentType } from "react";
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
  GitBranch,
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

/**
 * The sidebar's navigation structure, shared by the sidebar itself and by the
 * admin Settings page, where an administrator picks which entries to hide for
 * every user (#968, backend artifact-keeper#4574).
 *
 * An entry's `href` doubles as its identifier in the hidden list the backend
 * stores, so renaming a route means existing hidden lists stop matching it and
 * the entry shows up again (the safe direction).
 */

export interface NavItem {
  title: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** Shown only to administrators, even inside a group everyone sees. */
  adminOnly?: boolean;
}

/** Who sees a whole group. */
export type NavAudience = "everyone" | "authenticated" | "admin";

export interface NavGroup {
  label: string;
  audience: NavAudience;
  items: NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Overview",
    audience: "everyone",
    items: [{ title: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Artifacts",
    audience: "everyone",
    items: [
      { title: "Repositories", href: "/repositories", icon: Database },
      { title: "Packages", href: "/packages", icon: Boxes },
      { title: "Builds", href: "/builds", icon: Hammer },
      { title: "Staging", href: "/staging", icon: GitPullRequestArrow },
      { title: "Setup Guide", href: "/setup", icon: BookOpen },
    ],
  },
  {
    label: "Integration",
    audience: "authenticated",
    items: [
      { title: "Peers", href: "/peers", icon: Globe },
      { title: "Replication", href: "/replication", icon: RefreshCw },
      { title: "Sync Policies", href: "/sync-policies", icon: Workflow },
      { title: "Plugins", href: "/plugins", icon: Puzzle },
      { title: "Format Handlers", href: "/format-handlers", icon: Blocks },
      { title: "Webhooks", href: "/webhooks", icon: Webhook },
      { title: "Access Tokens", href: "/access-tokens", icon: Key },
      {
        title: "Migration",
        href: "/migration",
        icon: ArrowRightLeft,
        adminOnly: true,
      },
    ],
  },
  {
    label: "Security",
    audience: "admin",
    items: [
      { title: "Dashboard", href: "/security", icon: Shield },
      { title: "Scan Results", href: "/security/scans", icon: Search },
      { title: "Blast Radius", href: "/security/blast-radius", icon: Crosshair },
      { title: "DT Projects", href: "/security/dt-projects", icon: FolderSearch },
      { title: "Quality Gates", href: "/quality-gates", icon: ShieldCheck },
      { title: "Quality Checks", href: "/quality-checks", icon: ListChecks },
      { title: "Policies", href: "/security/policies", icon: FileCheck },
      { title: "License Policies", href: "/license-policies", icon: Scale },
      { title: "Curation", href: "/curation", icon: PackageCheck },
      { title: "Age Gate", href: "/age-gate", icon: Hourglass },
      { title: "Signing", href: "/signing", icon: FileSignature },
      { title: "Permissions", href: "/permissions", icon: Lock },
    ],
  },
  {
    label: "Operations",
    audience: "admin",
    items: [
      { title: "Analytics", href: "/analytics", icon: BarChart3 },
      { title: "Downloads", href: "/downloads", icon: Network },
      { title: "Approvals", href: "/approvals", icon: ClipboardCheck },
      { title: "Promotion Rules", href: "/promotion-rules", icon: Filter },
      { title: "Health", href: "/system-health", icon: HeartPulse },
      { title: "Lifecycle", href: "/lifecycle", icon: Recycle },
      { title: "Monitoring", href: "/monitoring", icon: Activity },
      { title: "Telemetry", href: "/telemetry", icon: Radio },
    ],
  },
  {
    label: "Administration",
    audience: "admin",
    items: [
      { title: "Users", href: "/users", icon: Users },
      { title: "Groups", href: "/groups", icon: UsersRound },
      { title: "Service Accounts", href: "/service-accounts", icon: Bot },
      { title: "Rate Limits", href: "/rate-limits", icon: Gauge },
      { title: "Audit Log", href: "/audit", icon: ScrollText },
      { title: "Backups", href: "/backups", icon: HardDrive },
      { title: "SSO Providers", href: "/settings/sso", icon: KeyRound },
      { title: "CI/CD OIDC", href: "/settings/sso/ci", icon: GitBranch },
      { title: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

/**
 * Entries that can never be hidden. The admin Settings page is where the
 * hidden list is edited, so hiding it would leave an admin without a link
 * back to the setting.
 */
export const ALWAYS_VISIBLE_NAV_HREFS: ReadonlySet<string> = new Set([
  "/settings",
]);

export function isNavItemHideable(href: string): boolean {
  return !ALWAYS_VISIBLE_NAV_HREFS.has(href);
}

/**
 * Drop the entries an administrator hid. Entries in
 * `ALWAYS_VISIBLE_NAV_HREFS` are kept whatever the list says, and unknown
 * identifiers in the list are ignored.
 */
export function filterHiddenNavItems<T extends { href: string }>(
  items: readonly T[],
  hidden: readonly string[],
): T[] {
  if (hidden.length === 0) return [...items];
  const hiddenSet = new Set(hidden);
  return items.filter(
    (item) => !hiddenSet.has(item.href) || !isNavItemHideable(item.href),
  );
}

/**
 * Normalize a hidden list before saving: de-duplicated, sorted (so the saved
 * value does not depend on click order) and without entries that cannot be
 * hidden. Identifiers this build does not know are kept, so saving from one
 * web version does not drop choices made for entries it does not have.
 */
export function normalizeHiddenNavItems(hidden: Iterable<string>): string[] {
  return [...new Set(hidden)].filter(isNavItemHideable).sort();
}
