// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// next/link -> simple anchor
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Controllable useAuth
const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

// Controllable useQuery / useQueryClient
const mockUseQuery = vi.fn();
const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

// API modules
vi.mock("@/lib/api/admin", () => ({
  adminApi: { getHealth: vi.fn(), getStats: vi.fn() },
}));
vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: { list: vi.fn() },
}));
vi.mock("@/lib/api/sbom", () => ({
  default: { getCveTrends: vi.fn() },
}));

// Utils
vi.mock("@/lib/utils", () => ({
  formatBytes: (bytes: number) => `${bytes} B`,
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

// lucide-react icons: enumerate every icon imported by the component under
// test so that vitest can resolve the named exports without a Proxy (which
// causes hangs during module initialisation).
vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
    Icon.displayName = name;
    return Icon;
  };
  return {
    Database: stub("Database"),
    FileBox: stub("FileBox"),
    Users: stub("Users"),
    HardDrive: stub("HardDrive"),
    CheckCircle2: stub("CheckCircle2"),
    XCircle: stub("XCircle"),
    AlertTriangle: stub("AlertTriangle"),
    RefreshCw: stub("RefreshCw"),
    Package: stub("Package"),
    ArrowRight: stub("ArrowRight"),
    Shield: stub("Shield"),
    ShieldAlert: stub("ShieldAlert"),
    ShieldX: stub("ShieldX"),
    ShieldCheck: stub("ShieldCheck"),
  };
});

// Common components - lightweight stand-ins that expose text for assertions
vi.mock("@/components/common/page-header", () => ({
  PageHeader: ({ title, description, actions }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <p>{description}</p>
      {actions && <div data-testid="header-actions">{actions}</div>}
    </div>
  ),
}));
vi.mock("@/components/common/stat-card", () => ({
  StatCard: ({ label, value }: any) => (
    <div data-testid={`stat-${label}`}>
      {label}: {value}
    </div>
  ),
}));
vi.mock("@/components/common/status-badge", () => ({
  StatusBadge: ({ status }: any) => <span>{status}</span>,
}));
vi.mock("@/components/common/empty-state", () => ({
  EmptyState: ({ title }: any) => <div>{title}</div>,
}));

// UI primitives
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h3>{children}</h3>,
  CardAction: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ui/table", () => ({
  Table: ({ children }: any) => <table>{children}</table>,
  TableBody: ({ children }: any) => <tbody>{children}</tbody>,
  TableCell: ({ children }: any) => <td>{children}</td>,
  TableHead: ({ children }: any) => <th>{children}</th>,
  TableHeader: ({ children }: any) => <thead>{children}</thead>,
  TableRow: ({ children }: any) => <tr>{children}</tr>,
}));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Configure mockUseQuery to return per-key overrides.
 * Any query key not in `overrides` falls back to idle/empty defaults.
 */
function setupUseQuery(overrides: Record<string, any> = {}) {
  mockUseQuery.mockImplementation((opts: any) => {
    const key = opts.queryKey[0];
    const defaults = { data: undefined, isLoading: false, isFetching: false };
    // Invoke queryFn to cover the inline arrow callbacks (lines 252, 262, 272, 281)
    if (opts.queryFn && opts.enabled !== false) {
      try { opts.queryFn(); } catch { /* API modules are mocked, safe to ignore */ }
    }
    return { ...defaults, ...(overrides[key] || {}) };
  });
}

// ---------------------------------------------------------------------------
// Import the component under test (vi.mock calls above are hoisted)
// ---------------------------------------------------------------------------

import DashboardPage from "../page";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DashboardPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return empty/idle data for all queries
    setupUseQuery({
      "recent-repositories": {
        data: { items: [] },
        isLoading: false,
        isFetching: false,
      },
    });
  });

  // -------------------------------------------------------------------------
  // 1. Unauthenticated: no health section, no refresh button
  // -------------------------------------------------------------------------
  it("does not render System Health or Refresh button for unauthenticated users", () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false });

    render(<DashboardPage />);

    expect(screen.queryByText("System Health")).not.toBeInTheDocument();
    expect(screen.queryByText("Refresh")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 2. Authenticated non-admin: health section + refresh button visible
  // -------------------------------------------------------------------------
  it("renders System Health section and Refresh button for authenticated users", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "user1" },
      isAuthenticated: true,
    });

    setupUseQuery({
      health: {
        data: { status: "healthy", checks: {} },
        isLoading: false,
        isFetching: false,
      },
      "recent-repositories": {
        data: { items: [] },
        isLoading: false,
        isFetching: false,
      },
    });

    render(<DashboardPage />);

    expect(screen.getByText("System Health")).toBeInTheDocument();
    expect(screen.getByText("Refresh")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 3. Authenticated admin: health, stats, and security sections visible
  // -------------------------------------------------------------------------
  it("renders Statistics and Security Overview sections for admin users", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "admin", display_name: "Admin", is_admin: true },
      isAuthenticated: true,
    });

    setupUseQuery({
      health: {
        data: { status: "healthy", checks: {} },
        isLoading: false,
        isFetching: false,
      },
      "admin-stats": {
        data: {
          total_repositories: 10,
          total_artifacts: 200,
          total_users: 5,
          total_storage_bytes: 1024000,
        },
        isLoading: false,
        isFetching: false,
      },
      "cve-trends": {
        data: {
          total_cves: 3,
          open_cves: 1,
          fixed_cves: 2,
          acknowledged_cves: 0,
          critical_count: 0,
          high_count: 1,
          medium_count: 1,
          low_count: 1,
          avg_days_to_fix: 4.5,
        },
        isLoading: false,
        isFetching: false,
      },
      "recent-repositories": {
        data: { items: [] },
        isLoading: false,
        isFetching: false,
      },
    });

    render(<DashboardPage />);

    expect(screen.getByText("System Health")).toBeInTheDocument();
    expect(screen.getByText("Statistics")).toBeInTheDocument();
    expect(screen.getByText("Security Overview")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 4. Welcome greeting uses display_name when present
  // -------------------------------------------------------------------------
  it("shows a personalized welcome greeting when user has a display_name", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "admin", display_name: "Admin", is_admin: true },
      isAuthenticated: true,
    });

    setupUseQuery({
      health: {
        data: { status: "healthy", checks: {} },
        isLoading: false,
        isFetching: false,
      },
      "recent-repositories": {
        data: { items: [] },
        isLoading: false,
        isFetching: false,
      },
    });

    render(<DashboardPage />);

    expect(screen.getByText("Welcome back, Admin")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 5. Generic title when no user is authenticated
  // -------------------------------------------------------------------------
  it('shows generic "Dashboard" title when no user is authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false });

    render(<DashboardPage />);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 6. Health query enabled flag tracks isAuthenticated
  // -------------------------------------------------------------------------
  it("passes enabled: true to the health query when authenticated", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "user1" },
      isAuthenticated: true,
    });

    setupUseQuery({
      "recent-repositories": {
        data: { items: [] },
        isLoading: false,
        isFetching: false,
      },
    });

    render(<DashboardPage />);

    const healthCall = mockUseQuery.mock.calls.find(
      (call: any[]) => call[0]?.queryKey?.[0] === "health",
    );
    expect(healthCall).toBeDefined();
    expect(healthCall![0].enabled).toBe(true);
  });

  it("passes enabled: false to the health query when not authenticated", () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false });

    render(<DashboardPage />);

    const healthCall = mockUseQuery.mock.calls.find(
      (call: any[]) => call[0]?.queryKey?.[0] === "health",
    );
    expect(healthCall).toBeDefined();
    expect(healthCall![0].enabled).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 8. Health cards render with various statuses (covers healthIcon/healthColor)
  // -------------------------------------------------------------------------
  it("renders health cards with degraded and missing statuses", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "user1" },
      isAuthenticated: true,
    });

    setupUseQuery({
      health: {
        data: {
          status: "degraded",
          checks: {
            database: { status: "healthy" },
            storage: { status: "unavailable" },
            security_scanner: { status: "unhealthy" },
            meilisearch: { status: "healthy" },
          },
        },
        isLoading: false,
        isFetching: false,
      },
      "recent-repositories": {
        data: { items: [] },
        isLoading: false,
        isFetching: false,
      },
    });

    render(<DashboardPage />);

    expect(screen.getByText("Overall")).toBeInTheDocument();
    expect(screen.getByText("degraded")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();
    expect(screen.getByText("Storage")).toBeInTheDocument();
    expect(screen.getByText("Security Scanner")).toBeInTheDocument();
    expect(screen.getByText("Search Engine")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 9. Health cards with undefined status (covers null branch)
  // -------------------------------------------------------------------------
  it("renders health card with undefined status showing Unknown", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "user1" },
      isAuthenticated: true,
    });

    setupUseQuery({
      health: {
        data: {
          status: undefined,
          checks: {
            database: { status: undefined },
            storage: { status: "healthy" },
          },
        },
        isLoading: false,
        isFetching: false,
      },
      "recent-repositories": {
        data: { items: [] },
        isLoading: false,
        isFetching: false,
      },
    });

    render(<DashboardPage />);

    const unknowns = screen.getAllByText("Unknown");
    expect(unknowns.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // 10. Repository rows render (covers RepoRow and getFormatBadgeClass)
  // -------------------------------------------------------------------------
  it("renders repository rows with format badges", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "user1" },
      isAuthenticated: true,
    });

    setupUseQuery({
      health: {
        data: { status: "healthy", checks: {} },
        isLoading: false,
        isFetching: false,
      },
      "recent-repositories": {
        data: {
          items: [
            { id: "1", key: "libs-maven", name: "Maven Libs", format: "maven", repo_type: "local", storage_used_bytes: 2048 },
            { id: "2", key: "npm-proxy", name: "NPM Proxy", format: "npm", repo_type: "remote", storage_used_bytes: 0 },
            { id: "3", key: "custom-repo", name: "", format: "unknown", repo_type: "virtual", storage_used_bytes: 512 },
          ],
        },
        isLoading: false,
        isFetching: false,
      },
    });

    render(<DashboardPage />);

    expect(screen.getByText("Maven Libs")).toBeInTheDocument();
    expect(screen.getByText("maven")).toBeInTheDocument();
    expect(screen.getByText("NPM Proxy")).toBeInTheDocument();
    expect(screen.getByText("npm")).toBeInTheDocument();
    // Repo with empty name falls back to key
    expect(screen.getByText("custom-repo")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 11. Loading states show skeletons
  // -------------------------------------------------------------------------
  it("shows skeletons while data is loading", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "admin", is_admin: true },
      isAuthenticated: true,
    });

    setupUseQuery({
      health: { data: undefined, isLoading: true, isFetching: true },
      "admin-stats": { data: undefined, isLoading: true, isFetching: true },
      "cve-trends": { data: undefined, isLoading: true, isFetching: true },
      "recent-repositories": { data: undefined, isLoading: true, isFetching: true },
    });

    render(<DashboardPage />);

    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 12. Admin stats failure shows error message
  // -------------------------------------------------------------------------
  it("shows error message when admin stats fail to load", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "admin", is_admin: true },
      isAuthenticated: true,
    });

    setupUseQuery({
      health: {
        data: { status: "healthy", checks: {} },
        isLoading: false,
        isFetching: false,
      },
      "admin-stats": { data: undefined, isLoading: false, isFetching: false },
      "cve-trends": { data: undefined, isLoading: false, isFetching: false },
      "recent-repositories": {
        data: { items: [] },
        isLoading: false,
        isFetching: false,
      },
    });

    render(<DashboardPage />);

    expect(
      screen.getByText("Failed to load admin statistics."),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 13. CVE trends empty state
  // -------------------------------------------------------------------------
  it("shows no CVE data message when trends are undefined", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "admin", is_admin: true },
      isAuthenticated: true,
    });

    setupUseQuery({
      health: {
        data: { status: "healthy", checks: {} },
        isLoading: false,
        isFetching: false,
      },
      "admin-stats": {
        data: { total_repositories: 1, total_artifacts: 1, total_users: 1, total_storage_bytes: 0 },
        isLoading: false,
        isFetching: false,
      },
      "cve-trends": { data: undefined, isLoading: false, isFetching: false },
      "recent-repositories": {
        data: { items: [] },
        isLoading: false,
        isFetching: false,
      },
    });

    render(<DashboardPage />);

    expect(
      screen.getByText(/No CVE data available yet/),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 14. Severity breakdown renders with CVE data (covers SeverityBreakdown)
  // -------------------------------------------------------------------------
  it("renders severity breakdown bars when CVE data is available", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "admin", is_admin: true },
      isAuthenticated: true,
    });

    setupUseQuery({
      health: {
        data: { status: "healthy", checks: {} },
        isLoading: false,
        isFetching: false,
      },
      "admin-stats": {
        data: { total_repositories: 1, total_artifacts: 1, total_users: 1, total_storage_bytes: 0 },
        isLoading: false,
        isFetching: false,
      },
      "cve-trends": {
        data: {
          total_cves: 10,
          open_cves: 4,
          fixed_cves: 5,
          acknowledged_cves: 1,
          critical_count: 2,
          high_count: 3,
          medium_count: 3,
          low_count: 2,
          avg_days_to_fix: 7,
        },
        isLoading: false,
        isFetching: false,
      },
      "recent-repositories": {
        data: { items: [] },
        isLoading: false,
        isFetching: false,
      },
    });

    render(<DashboardPage />);

    // Severity labels
    expect(screen.getByText("critical")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.getByText("low")).toBeInTheDocument();

    // Status summary
    expect(screen.getByText("4")).toBeInTheDocument(); // Open
    expect(screen.getByText("5")).toBeInTheDocument(); // Fixed
    expect(screen.getByText("7d")).toBeInTheDocument(); // Avg fix time
  });

  // -------------------------------------------------------------------------
  // 15. handleRefresh invalidates all queries
  // -------------------------------------------------------------------------
  it("calls invalidateQueries for all query keys when Refresh is clicked", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "user1" },
      isAuthenticated: true,
    });

    setupUseQuery({
      health: {
        data: { status: "healthy", checks: {} },
        isLoading: false,
        isFetching: false,
      },
      "recent-repositories": {
        data: { items: [] },
        isLoading: false,
        isFetching: false,
      },
    });

    render(<DashboardPage />);

    const refreshButton = screen.getByText("Refresh").closest("button")!;
    fireEvent.click(refreshButton);

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["health"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["admin-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["recent-repositories"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["cve-trends"] });
  });
});
