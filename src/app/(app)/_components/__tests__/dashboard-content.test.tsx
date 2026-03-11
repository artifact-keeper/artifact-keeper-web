// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks (hoisted before imports)
// ---------------------------------------------------------------------------

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseQuery = vi.fn();
const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: { getHealth: vi.fn(), getStats: vi.fn() },
}));
vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: { list: vi.fn() },
}));
vi.mock("@/lib/api/sbom", () => ({
  default: { getCveTrends: vi.fn() },
}));

vi.mock("@/lib/utils", () => ({
  formatBytes: (bytes: number) => `${bytes} B`,
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

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

function setupUseQuery(overrides: Record<string, any> = {}) {
  mockUseQuery.mockImplementation((opts: any) => {
    const key = opts.queryKey[0];
    const defaults = { data: undefined, isLoading: false, isFetching: false };
    if (opts.queryFn && opts.enabled !== false) {
      try { opts.queryFn(); } catch { /* safe to ignore */ }
    }
    return { ...defaults, ...(overrides[key] || {}) };
  });
}

// ---------------------------------------------------------------------------
// Import component under test
// ---------------------------------------------------------------------------

import { DashboardContent } from "../dashboard-content";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DashboardContent", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setupUseQuery({
      "recent-repositories": {
        data: { items: [] },
        isLoading: false,
        isFetching: false,
      },
    });
  });

  it("does not render System Health for unauthenticated users", () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false });
    render(<DashboardContent />);
    expect(screen.queryByText("System Health")).not.toBeInTheDocument();
  });

  it("renders System Health section for authenticated users", () => {
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
      "recent-repositories": { data: { items: [] }, isLoading: false, isFetching: false },
    });
    render(<DashboardContent />);
    expect(screen.getByText("System Health")).toBeInTheDocument();
  });

  it("renders Statistics section for admin users", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "admin", display_name: "Admin", is_admin: true },
      isAuthenticated: true,
    });
    setupUseQuery({
      health: { data: { status: "healthy", checks: {} }, isLoading: false, isFetching: false },
      "admin-stats": {
        data: { total_repositories: 10, total_artifacts: 200, total_users: 5, total_storage_bytes: 1024000 },
        isLoading: false,
        isFetching: false,
      },
      "cve-trends": {
        data: { total_cves: 3, open_cves: 1, fixed_cves: 2, acknowledged_cves: 0, critical_count: 0, high_count: 1, medium_count: 1, low_count: 1, avg_days_to_fix: 4.5 },
        isLoading: false,
        isFetching: false,
      },
      "recent-repositories": { data: { items: [] }, isLoading: false, isFetching: false },
    });
    render(<DashboardContent />);
    expect(screen.getByText("Statistics")).toBeInTheDocument();
    expect(screen.getByText("Security Overview")).toBeInTheDocument();
  });

  it("shows personalized greeting with display_name", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "admin", display_name: "Admin" },
      isAuthenticated: true,
    });
    setupUseQuery({
      health: { data: { status: "healthy", checks: {} }, isLoading: false, isFetching: false },
      "recent-repositories": { data: { items: [] }, isLoading: false, isFetching: false },
    });
    render(<DashboardContent />);
    expect(screen.getByText("Welcome back, Admin")).toBeInTheDocument();
  });

  it("falls back to username when display_name is absent", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "dev_user" },
      isAuthenticated: true,
    });
    setupUseQuery({
      health: { data: { status: "healthy", checks: {} }, isLoading: false, isFetching: false },
      "recent-repositories": { data: { items: [] }, isLoading: false, isFetching: false },
    });
    render(<DashboardContent />);
    expect(screen.getByText("Welcome back, dev_user")).toBeInTheDocument();
  });

  it('shows "Dashboard" title when no user', () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false });
    render(<DashboardContent />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders repository rows with format badges", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "user1" },
      isAuthenticated: true,
    });
    setupUseQuery({
      health: { data: { status: "healthy", checks: {} }, isLoading: false, isFetching: false },
      "recent-repositories": {
        data: {
          items: [
            { id: "1", key: "libs-maven", name: "Maven Libs", format: "maven", repo_type: "local", storage_used_bytes: 2048 },
            { id: "2", key: "npm-proxy", name: "NPM Proxy", format: "npm", repo_type: "remote", storage_used_bytes: 0 },
          ],
        },
        isLoading: false,
        isFetching: false,
      },
    });
    render(<DashboardContent />);
    expect(screen.getByText("Maven Libs")).toBeInTheDocument();
    expect(screen.getByText("maven")).toBeInTheDocument();
    expect(screen.getByText("NPM Proxy")).toBeInTheDocument();
  });

  it("renders repo key when name is empty", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "user1" },
      isAuthenticated: true,
    });
    setupUseQuery({
      health: { data: { status: "healthy", checks: {} }, isLoading: false, isFetching: false },
      "recent-repositories": {
        data: {
          items: [
            { id: "1", key: "custom-repo", name: "", format: "unknown", repo_type: "virtual", storage_used_bytes: 512 },
          ],
        },
        isLoading: false,
        isFetching: false,
      },
    });
    render(<DashboardContent />);
    expect(screen.getByText("custom-repo")).toBeInTheDocument();
  });

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
    render(<DashboardContent />);
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows error message when admin stats fail to load", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "admin", is_admin: true },
      isAuthenticated: true,
    });
    setupUseQuery({
      health: { data: { status: "healthy", checks: {} }, isLoading: false, isFetching: false },
      "admin-stats": { data: undefined, isLoading: false, isFetching: false },
      "cve-trends": { data: undefined, isLoading: false, isFetching: false },
      "recent-repositories": { data: { items: [] }, isLoading: false, isFetching: false },
    });
    render(<DashboardContent />);
    expect(screen.getByText("Failed to load admin statistics.")).toBeInTheDocument();
  });

  it("renders empty state for no repositories", () => {
    mockUseAuth.mockReturnValue({ user: null, isAuthenticated: false });
    setupUseQuery({
      "recent-repositories": { data: { items: [] }, isLoading: false, isFetching: false },
    });
    render(<DashboardContent />);
    expect(screen.getByText("No repositories yet")).toBeInTheDocument();
  });

  it("renders health cards with various status values", () => {
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
      "recent-repositories": { data: { items: [] }, isLoading: false, isFetching: false },
    });
    render(<DashboardContent />);
    expect(screen.getByText("degraded")).toBeInTheDocument();
    expect(screen.getByText("Database")).toBeInTheDocument();
    expect(screen.getByText("Storage")).toBeInTheDocument();
  });

  it('renders "Unknown" when health status is undefined', () => {
    mockUseAuth.mockReturnValue({
      user: { username: "user1" },
      isAuthenticated: true,
    });
    setupUseQuery({
      health: {
        data: { status: undefined, checks: { database: { status: undefined } } },
        isLoading: false,
        isFetching: false,
      },
      "recent-repositories": { data: { items: [] }, isLoading: false, isFetching: false },
    });
    render(<DashboardContent />);
    const unknowns = screen.getAllByText("Unknown");
    expect(unknowns.length).toBeGreaterThanOrEqual(1);
  });

  it("renders severity breakdown with CVE trends data", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "admin", is_admin: true },
      isAuthenticated: true,
    });
    setupUseQuery({
      health: { data: { status: "healthy", checks: {} }, isLoading: false, isFetching: false },
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
      "recent-repositories": { data: { items: [] }, isLoading: false, isFetching: false },
    });
    render(<DashboardContent />);
    expect(screen.getByText("critical")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.getByText("low")).toBeInTheDocument();
    expect(screen.getByText("7d")).toBeInTheDocument();
  });

  it("shows no CVE data message when trends are undefined", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "admin", is_admin: true },
      isAuthenticated: true,
    });
    setupUseQuery({
      health: { data: { status: "healthy", checks: {} }, isLoading: false, isFetching: false },
      "admin-stats": {
        data: { total_repositories: 1, total_artifacts: 1, total_users: 1, total_storage_bytes: 0 },
        isLoading: false,
        isFetching: false,
      },
      "cve-trends": { data: undefined, isLoading: false, isFetching: false },
      "recent-repositories": { data: { items: [] }, isLoading: false, isFetching: false },
    });
    render(<DashboardContent />);
    expect(screen.getByText(/No CVE data available yet/)).toBeInTheDocument();
  });

  it("does not render severity breakdown when total_cves is 0", () => {
    mockUseAuth.mockReturnValue({
      user: { username: "admin", is_admin: true },
      isAuthenticated: true,
    });
    setupUseQuery({
      health: { data: { status: "healthy", checks: {} }, isLoading: false, isFetching: false },
      "admin-stats": {
        data: { total_repositories: 1, total_artifacts: 1, total_users: 1, total_storage_bytes: 0 },
        isLoading: false,
        isFetching: false,
      },
      "cve-trends": {
        data: {
          total_cves: 0,
          open_cves: 0,
          fixed_cves: 0,
          acknowledged_cves: 0,
          critical_count: 0,
          high_count: 0,
          medium_count: 0,
          low_count: 0,
          avg_days_to_fix: null,
        },
        isLoading: false,
        isFetching: false,
      },
      "recent-repositories": { data: { items: [] }, isLoading: false, isFetching: false },
    });
    render(<DashboardContent />);
    // Severity breakdown section should not render when total_cves = 0
    expect(screen.queryByText("Severity Breakdown")).not.toBeInTheDocument();
    // But Security Overview stats should still render
    expect(screen.getByText("Security Overview")).toBeInTheDocument();
  });
});
