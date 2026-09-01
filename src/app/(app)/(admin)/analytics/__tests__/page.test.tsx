// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React from "react";

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/api/analytics", () => ({ analyticsApi: {} }));
vi.mock("@/lib/api/admin", () => ({ adminApi: {} }));

vi.mock("@/lib/utils", () => ({
  formatBytes: (bytes: number) => `${bytes} B`,
  formatDate: (d: string) => d,
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

// Radix only mounts tooltip content on hover; render it inline so the
// local/remote breakdown is assertable.
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: any) => <span>{children}</span>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <span>{children}</span>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
}));

// Render every tab's content so the breakdown and trend tables are both in the
// document; fixture numbers below are chosen not to collide.
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children }: any) => <button>{children}</button>,
  TabsContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("lucide-react", () => {
  const icon = () => null;
  return {
    BarChart3: icon,
    TrendingUp: icon,
    HardDrive: icon,
    Package: icon,
    Download: icon,
    Clock: icon,
    RefreshCw: icon,
    Camera: icon,
    Columns3: icon,
  };
});

const GROWTH = {
  period_start: "2026-04-01",
  period_end: "2026-05-01",
  storage_bytes_start: 1,
  storage_bytes_end: 2,
  storage_growth_bytes: 1,
  storage_growth_percent: 100,
  artifacts_start: 1,
  artifacts_end: 2,
  artifacts_added: 1,
  downloads_in_period: 5,
};

const STATS = {
  total_repositories: 9,
  total_artifacts: 200,
  total_storage_bytes: 1_000_000,
  total_users: 4,
  proxy_artifact_count: 50,
  proxy_storage_bytes: 500_000,
};

const BREAKDOWN = [
  {
    repository_id: "repo-a",
    repository_key: "maven-proxy",
    repository_name: "Maven Proxy",
    format: "maven",
    artifact_count: 25,
    storage_bytes: 100,
    download_count: 10,
    proxy_artifact_count: 5,
    proxy_storage_bytes: 20,
    proxy_download_count: 3,
    last_upload_at: null,
  },
];

const TREND = [
  {
    snapshot_date: "2026-05-01",
    total_repositories: 9,
    total_artifacts: 700,
    total_storage_bytes: 9_000,
    total_downloads: 400,
    total_users: 4,
    proxy_artifact_count: 60,
    proxy_storage_bytes: 800,
    proxy_download_count: 70,
  },
];

const DOWNLOADS = [
  { date: "2026-05-01", download_count: 1_000, proxy_download_count: 210 },
];

function queryData(key: string) {
  if (key === "analytics-growth") return GROWTH;
  if (key === "analytics-breakdown") return BREAKDOWN;
  if (key === "analytics-trend") return TREND;
  if (key === "analytics-downloads") return DOWNLOADS;
  if (key === "admin-stats") return STATS;
  return [];
}

async function renderPage() {
  const { default: AnalyticsPage } = await import("../page");
  render(<AnalyticsPage />);
}

describe("AnalyticsPage local/remote accounting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { is_admin: true } });
    mockUseQuery.mockImplementation(({ queryKey }: any) => ({
      data: queryData(queryKey[0]),
      isLoading: false,
    }));
  });

  afterEach(cleanup);

  it("sums local and remote in the stat cards, with the split on hover", async () => {
    await renderPage();

    expect(screen.getByText("250")).toBeDefined();
    expect(screen.getByText("1500000 B")).toBeDefined();
    expect(screen.getByText("200")).toBeDefined();
    expect(screen.getByText("50")).toBeDefined();
    expect(screen.getByText("1000000 B")).toBeDefined();
    expect(screen.getByText("500000 B")).toBeDefined();
  });

  it("sums artifacts, storage and downloads per repository", async () => {
    await renderPage();

    // 25 + 5 artifacts, 100 + 20 bytes, 10 + 3 downloads.
    expect(screen.getByText("30")).toBeDefined();
    expect(screen.getByText("120 B")).toBeDefined();
    expect(screen.getByText("13")).toBeDefined();
    // Hover halves.
    expect(screen.getByText("25")).toBeDefined();
    expect(screen.getByText("5")).toBeDefined();
    expect(screen.getByText("100 B")).toBeDefined();
    expect(screen.getByText("20 B")).toBeDefined();
  });

  it("sums the daily snapshot and download trend rows", async () => {
    await renderPage();

    // Storage trend: 700 + 60, 9000 + 800, 400 + 70.
    expect(screen.getByText("760")).toBeDefined();
    expect(screen.getByText("9800 B")).toBeDefined();
    expect(screen.getByText("470")).toBeDefined();
    // Download trend: 1000 + 210.
    expect(screen.getByText("1,210")).toBeDefined();
  });

  it("splits every metric into local and remote columns when toggled", async () => {
    await renderPage();

    fireEvent.click(
      screen.getAllByRole("button", { name: /Split local\/remote/ })[0],
    );

    // Breakdown + storage trend both carry all three metrics; download trends
    // carries downloads only.
    expect(screen.getAllByRole("columnheader", { name: "Artifacts (Local)" }))
      .toHaveLength(2);
    expect(screen.getAllByRole("columnheader", { name: "Storage (Remote)" }))
      .toHaveLength(2);
    expect(screen.getAllByRole("columnheader", { name: "Downloads (Remote)" }))
      .toHaveLength(3);
    // Combined totals are gone; the halves are the cells now.
    expect(screen.queryByText("30")).toBeNull();
    expect(screen.queryByText("13")).toBeNull();
    expect(screen.queryByText("760")).toBeNull();
    expect(screen.getByText("70")).toBeDefined();
    expect(screen.getByText("800 B")).toBeDefined();
  });

  it("hides analytics from non-admins", async () => {
    mockUseAuth.mockReturnValue({ user: { is_admin: false } });
    await renderPage();

    expect(screen.getByText("Access Denied")).toBeDefined();
  });
});
