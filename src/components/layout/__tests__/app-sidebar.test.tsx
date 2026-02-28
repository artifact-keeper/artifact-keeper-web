// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock("next/image", () => ({
  default: ({ alt, src, width, height, className }: any) => (
    <img
      alt={alt}
      src={src}
      width={width}
      height={height}
      className={className}
    />
  ),
}));

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: { getHealth: vi.fn() },
}));

vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: any) => <div data-testid="sidebar">{children}</div>,
  SidebarContent: ({ children }: any) => <div>{children}</div>,
  SidebarGroup: ({ children }: any) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: any) => <div>{children}</div>,
  SidebarHeader: ({ children }: any) => <div>{children}</div>,
  SidebarMenu: ({ children }: any) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children }: any) => <li>{children}</li>,
  SidebarMenuButton: ({ children }: any) => <div>{children}</div>,
  SidebarFooter: () => <div />,
  SidebarRail: () => <div />,
}));

// Mock each lucide-react icon as a simple span component.
// The factory must be self-contained because vi.mock is hoisted.
vi.mock("lucide-react", () => {
  const icon = () => null;
  return {
    LayoutDashboard: icon,
    Database: icon,
    Boxes: icon,
    Hammer: icon,
    Globe: icon,
    RefreshCw: icon,
    Puzzle: icon,
    Webhook: icon,
    ArrowRightLeft: icon,
    Bot: icon,
    BookOpen: icon,
    GitPullRequestArrow: icon,
    Key: icon,
    Shield: icon,
    ShieldCheck: icon,
    Search: icon,
    FileCheck: icon,
    Lock: icon,
    Users: icon,
    UsersRound: icon,
    HardDrive: icon,
    KeyRound: icon,
    Settings: icon,
    BarChart3: icon,
    Recycle: icon,
    Radio: icon,
    Activity: icon,
    HeartPulse: icon,
    Scale: icon,
    FolderSearch: icon,
    ClipboardCheck: icon,
  };
});

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import { AppSidebar } from "../app-sidebar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authState({
  isAuthenticated = false,
  isAdmin = false,
}: { isAuthenticated?: boolean; isAdmin?: boolean } = {}) {
  mockUseAuth.mockReturnValue({
    isAuthenticated,
    user: isAuthenticated ? { is_admin: isAdmin } : null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AppSidebar", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_VERSION = "1.1.0";
    mockUseQuery.mockReturnValue({ data: undefined });
  });

  it("shows web version only when health data is not available", () => {
    authState({ isAuthenticated: true });
    mockUseQuery.mockReturnValue({ data: undefined });

    render(<AppSidebar />);

    expect(screen.getByText(/Web 1\.1\.0/)).toBeDefined();
    expect(screen.queryByText(/Server/)).toBeNull();
  });

  it("shows both web and server version when health data is available", () => {
    authState({ isAuthenticated: true });
    mockUseQuery.mockReturnValue({ data: { version: "1.1.0-rc.8" } });

    render(<AppSidebar />);

    const versionEl = screen.getByText(/Web 1\.1\.0/);
    expect(versionEl.textContent).toContain("/ Server 1.1.0-rc.8");
  });

  it("does not fetch health when unauthenticated", () => {
    authState({ isAuthenticated: false });

    render(<AppSidebar />);

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("shows integration items for authenticated users", () => {
    authState({ isAuthenticated: true });

    render(<AppSidebar />);

    expect(screen.getByText("Integration")).toBeDefined();
  });

  it("hides admin sections for non-admin users", () => {
    authState({ isAuthenticated: true, isAdmin: false });

    render(<AppSidebar />);

    expect(screen.queryByText("Security")).toBeNull();
    expect(screen.queryByText("Operations")).toBeNull();
    expect(screen.queryByText("Administration")).toBeNull();
  });

  it("shows all sections for admin users", () => {
    authState({ isAuthenticated: true, isAdmin: true });

    render(<AppSidebar />);

    expect(screen.getByText("Security")).toBeDefined();
    expect(screen.getByText("Operations")).toBeDefined();
    expect(screen.getByText("Administration")).toBeDefined();
  });
});
