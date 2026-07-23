// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: any) => (
      <span data-testid={`icon-${name}`} {...props} />
    );
    Icon.displayName = name;
    return Icon;
  };
  return {
    AlertTriangle: stub("AlertTriangle"),
    Bug: stub("Bug"),
    Crosshair: stub("Crosshair"),
    Database: stub("Database"),
    Download: stub("Download"),
    Globe: stub("Globe"),
    Loader2: stub("Loader2"),
    Lock: stub("Lock"),
    Network: stub("Network"),
    RefreshCw: stub("RefreshCw"),
    ShieldAlert: stub("ShieldAlert"),
    Users: stub("Users"),
  };
});

const {
  mockUseAuth,
  mockUseQuery,
  mockInvalidateQueries,
  mockForCve,
  mockForArtifact,
  mockAccForCve,
  mockAccForArtifact,
  searchParamsState,
  tabsState,
} = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseQuery: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockForCve: vi.fn(),
  mockForArtifact: vi.fn(),
  mockAccForCve: vi.fn(),
  mockAccForArtifact: vi.fn(),
  searchParamsState: { value: "" },
  tabsState: { onValueChange: undefined as ((v: string) => void) | undefined },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => mockUseQuery(opts),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/lib/sdk-client", () => ({}));

vi.mock("@/lib/api/blast-radius", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/blast-radius")>();
  return {
    ...actual,
    blastRadiusApi: {
      forCve: (...args: any[]) => mockForCve(...args),
      forArtifact: (...args: any[]) => mockForArtifact(...args),
    },
    accessibleUsersApi: {
      forCve: (...args: any[]) => mockAccForCve(...args),
      forArtifact: (...args: any[]) => mockAccForArtifact(...args),
    },
  };
});

vi.mock("@/lib/api/audit", () => ({
  isValidUuid: (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      v.trim()
    ),
}));

// UI components
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: any) => <div data-testid="alert">{children}</div>,
  AlertTitle: ({ children }: any) => <span>{children}</span>,
  AlertDescription: ({ children }: any) => <span>{children}</span>,
}));

// Minimal Tabs stand-in: TabsTrigger buttons forward their value through the
// captured onValueChange so tests can switch modes like a user would.
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, value, onValueChange }: any) => {
    tabsState.onValueChange = onValueChange;
    return (
      <div data-testid="tabs" data-value={value}>
        {children}
      </div>
    );
  },
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children, value }: any) => (
    <button onClick={() => tabsState.onValueChange?.(value)}>{children}</button>
  ),
}));

// Minimal Select stand-in: exposes the current value and a button that fires
// onValueChange with a fixed repo id so tests can switch the scoped repository.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="repo-select" data-value={value ?? ""}>
      <button onClick={() => onValueChange?.("r2")}>select-r2</button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <div data-value={value}>{children}</div>
  ),
}));

vi.mock("@/components/common/stat-card", () => ({
  StatCard: ({ label, value, description }: any) => (
    <div data-testid="stat-card">
      <span>{label}</span>
      <span data-testid="stat-value">{String(value)}</span>
      {description && <span>{description}</span>}
    </div>
  ),
}));

// Lightweight DataTable stand-in that still exercises the column cell
// renderers and accessors, row keys, the empty message, the loading flag,
// and the pagination callbacks the page passes in.
vi.mock("@/components/common/data-table", () => ({
  DataTable: ({
    columns,
    data,
    loading,
    emptyMessage,
    rowKey,
    onPageChange,
    onPageSizeChange,
  }: any) => {
    if (loading) return <div data-testid="data-table-loading" />;
    if (!data.length)
      return <div data-testid="data-table-empty">{emptyMessage}</div>;
    return (
      <div>
        <table data-testid="data-table">
          <tbody>
            {data.map((row: any, i: number) => (
              <tr key={rowKey ? rowKey(row) : i}>
                {columns.map((c: any) => {
                  c.accessor?.(row); // real DataTable uses accessors for sorting
                  return (
                    <td key={c.id}>
                      {c.cell ? c.cell(row) : String(c.accessor?.(row) ?? "")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {onPageChange && (
          <button onClick={() => onPageChange(2)}>next-page</button>
        )}
        {onPageSizeChange && (
          <button onClick={() => onPageSizeChange(100)}>set-page-size</button>
        )}
      </div>
    );
  },
}));

import BlastRadiusPage, {
  AccessScopeBadge,
  ExposureBadge,
  ViaBadge,
  ipPreview,
} from "../page";

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const ADMIN = { id: "admin-id", username: "admin", is_admin: true };
const USER_ID = "0e8b23a5-1111-4f2b-9f7d-1c2d3e4f5a6b";
const ARTIFACT_ID = "9a1b23c4-5555-4f2b-9f7d-1c2d3e4f5a6b";

const REPORT = {
  target: { kind: "cve", value: "CVE-2021-44228" },
  summary: {
    affected_artifact_count: 2,
    affected_repo_count: 3,
    downloader_user_count: 2,
    anonymous_download_present: true,
    distinct_ip_count: 4,
    total_download_count: 7,
  },
  affected_repos: [
    {
      repository_id: "r1",
      repository_key: "public-npm",
      is_public: true,
      access_scope: "public",
    },
    {
      repository_id: "r2",
      repository_key: "acl-repo",
      is_public: false,
      access_scope: "restricted_acl",
    },
    {
      repository_id: "r3",
      repository_key: "roles-repo",
      is_public: false,
      access_scope: "restricted_roles",
    },
  ],
  downloaders: [
    {
      user_id: USER_ID,
      username: "jane",
      download_count: 4,
      distinct_ip_count: 5,
      first_download: "2026-07-09T10:00:00Z",
      last_download: "2026-07-10T12:00:00Z",
      ip_addresses: ["10.0.0.1", "10.0.0.2", "10.0.0.3", "10.0.0.4"],
    },
    {
      user_id: "1f7a12b4-2222-4f2b-9f7d-1c2d3e4f5a6b",
      username: null,
      download_count: 2,
      distinct_ip_count: 1,
      first_download: "2026-07-08T10:00:00Z",
      last_download: "2026-07-08T11:00:00Z",
      ip_addresses: ["10.0.0.9"],
    },
    {
      user_id: null,
      username: null,
      download_count: 1,
      distinct_ip_count: 1,
      first_download: "2026-07-07T10:00:00Z",
      last_download: "2026-07-07T10:00:00Z",
      ip_addresses: [],
    },
  ],
  total_downloaders: 3,
  page: 1,
  per_page: 20,
};

const ACCESSIBLE_REPORT = {
  target: { kind: "cve", value: "CVE-2021-44228" },
  repository: {
    repository_id: "r1",
    repository_key: "public-npm",
    access_scope: "restricted_acl",
  },
  exposure: "enumerable",
  accessible_not_downloaded: [
    { reason: "has-access", user_id: "u1", username: "carol", via: "permission" },
    { reason: "has-access", user_id: "u2", username: "dave", via: "role" },
  ],
  total: 2,
  page: 1,
  per_page: 20,
};

const IDLE = {
  data: undefined,
  isLoading: false,
  isError: false,
  isFetching: false,
};

function queryState(
  state: Partial<typeof IDLE> & { data?: unknown } = {},
  accessibleState: Partial<typeof IDLE> & { data?: unknown } = {}
) {
  mockUseQuery.mockImplementation((opts: any) => {
    if (opts.queryKey?.[0] === "admin-blast-radius") {
      return { ...IDLE, ...state };
    }
    if (opts.queryKey?.[0] === "admin-accessible-users") {
      return { ...IDLE, ...accessibleState };
    }
    throw new Error(`Unexpected query key: ${JSON.stringify(opts.queryKey)}`);
  });
}

function lastQueryOpts() {
  return mockUseQuery.mock.calls
    .map(([o]) => o)
    .filter((o) => o.queryKey?.[0] === "admin-blast-radius")
    .at(-1);
}

function lastAccessibleOpts() {
  return mockUseQuery.mock.calls
    .map(([o]) => o)
    .filter((o) => o.queryKey?.[0] === "admin-accessible-users")
    .at(-1);
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParamsState.value = "";
  mockUseAuth.mockReturnValue({ user: ADMIN });
});

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BlastRadiusPage", () => {
  it("denies access to non-admins", () => {
    mockUseAuth.mockReturnValue({ user: { ...ADMIN, is_admin: false } });
    queryState();

    render(<BlastRadiusPage />);

    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /analyze/i })
    ).not.toBeInTheDocument();
  });

  it("starts idle with a pick-a-target hint and the query disabled", () => {
    queryState();

    render(<BlastRadiusPage />);

    expect(
      screen.getByRole("heading", { name: /blast radius/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/pick a target/i)).toBeInTheDocument();
    expect(lastQueryOpts().enabled).toBe(false);
  });

  it("rejects a malformed CVE id client-side and clears on correction", () => {
    queryState();

    render(<BlastRadiusPage />);

    fireEvent.change(screen.getByLabelText(/cve \/ advisory id/i), {
      target: { value: "log4shell" },
    });
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/enter a cve id/i);
    expect(lastQueryOpts().enabled).toBe(false);

    fireEvent.change(screen.getByLabelText(/cve \/ advisory id/i), {
      target: { value: "cve-2021-44228" },
    });
    fireEvent.keyDown(screen.getByLabelText(/cve \/ advisory id/i), {
      key: "Enter",
    });
    expect(screen.getByRole("alert")).toHaveTextContent("");
    expect(lastQueryOpts().enabled).toBe(true);
  });

  it("rejects a malformed artifact id after switching modes", () => {
    queryState();

    render(<BlastRadiusPage />);

    fireEvent.click(screen.getByRole("button", { name: /by artifact/i }));
    fireEvent.change(screen.getByLabelText(/artifact id/i), {
      target: { value: "not-a-uuid" },
    });
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/must be a uuid/i);

    // Switching modes clears the stale validation error.
    fireEvent.click(screen.getByRole("button", { name: /by cve/i }));
    expect(screen.getByRole("alert")).toHaveTextContent("");
  });

  it("runs the CVE report through blastRadiusApi.forCve with pagination", async () => {
    queryState({ data: REPORT });
    mockForCve.mockResolvedValue(REPORT);

    render(<BlastRadiusPage />);

    fireEvent.change(screen.getByLabelText(/cve \/ advisory id/i), {
      target: { value: " cve-2021-44228 " },
    });
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));

    const opts = lastQueryOpts();
    expect(opts.enabled).toBe(true);
    await opts.queryFn();
    expect(mockForCve).toHaveBeenCalledWith("CVE-2021-44228", {
      page: 1,
      per_page: 20,
    });
    expect(opts.placeholderData("previous")).toBe("previous");
  });

  it("runs the artifact report through blastRadiusApi.forArtifact", async () => {
    queryState({ data: REPORT });
    mockForArtifact.mockResolvedValue(REPORT);

    render(<BlastRadiusPage />);

    fireEvent.click(screen.getByRole("button", { name: /by artifact/i }));
    fireEvent.change(screen.getByLabelText(/artifact id/i), {
      target: { value: ARTIFACT_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));

    await lastQueryOpts().queryFn();
    expect(mockForArtifact).toHaveBeenCalledWith(ARTIFACT_ID, {
      page: 1,
      per_page: 20,
    });
  });

  it("prefills and runs from a ?cve= deep link", () => {
    searchParamsState.value = "cve=cve-2021-44228";
    queryState({ data: REPORT });

    render(<BlastRadiusPage />);

    expect(screen.getByLabelText(/cve \/ advisory id/i)).toHaveValue(
      "cve-2021-44228"
    );
    expect(lastQueryOpts().enabled).toBe(true);
    // The normalized id is shown as the report scope.
    expect(screen.getByText("CVE-2021-44228")).toBeInTheDocument();
  });

  it("prefills artifact mode from a ?artifact= deep link", async () => {
    searchParamsState.value = `artifact=${ARTIFACT_ID}`;
    queryState({ data: REPORT });
    mockForArtifact.mockResolvedValue(REPORT);

    render(<BlastRadiusPage />);

    expect(screen.getByLabelText(/artifact id/i)).toHaveValue(ARTIFACT_ID);
    await lastQueryOpts().queryFn();
    expect(mockForArtifact).toHaveBeenCalledWith(ARTIFACT_ID, {
      page: 1,
      per_page: 20,
    });
  });

  it("only prefills (does not run) from a malformed deep-link id", () => {
    searchParamsState.value = "cve=log4shell";
    queryState();

    render(<BlastRadiusPage />);

    expect(screen.getByLabelText(/cve \/ advisory id/i)).toHaveValue(
      "log4shell"
    );
    expect(lastQueryOpts().enabled).toBe(false);
    expect(screen.getByText(/pick a target/i)).toBeInTheDocument();
  });

  it("shows an error alert when the report fails to load", () => {
    searchParamsState.value = "cve=CVE-2021-44228";
    queryState({ isError: true });

    render(<BlastRadiusPage />);

    expect(screen.getByText(/blast radius unavailable/i)).toBeInTheDocument();
  });

  it("shows a spinner while the report loads", () => {
    searchParamsState.value = "cve=CVE-2021-44228";
    queryState({ isLoading: true });

    render(<BlastRadiusPage />);

    expect(screen.getAllByTestId("icon-Loader2").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("stat-card")).not.toBeInTheDocument();
  });

  it("renders summary tiles, the anonymous badge, and flagged repos", () => {
    searchParamsState.value = "cve=CVE-2021-44228";
    queryState({ data: REPORT });

    render(<BlastRadiusPage />);

    // Summary tiles
    expect(screen.getByText("Affected artifacts")).toBeInTheDocument();
    expect(screen.getByText("Affected repos")).toBeInTheDocument();
    // "Downloaders" is both a tile label and a section heading.
    expect(screen.getAllByText("Downloaders").length).toBe(2);
    expect(screen.getByText("Distinct IPs")).toBeInTheDocument();
    expect(screen.getByText("Total downloads")).toBeInTheDocument();
    expect(screen.getByText("+ anonymous")).toBeInTheDocument();
    expect(
      screen.getByText(/anonymous downloads present/i)
    ).toBeInTheDocument();

    // Affected repos: the public repo is loudly flagged, the private scopes
    // get their own labels. (The repo key also appears in the latent-exposure
    // repository selector, so there may be more than one match.)
    expect(screen.getAllByText("public-npm").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/public — everyone exposed/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/restricted \(explicit acl\)/i)).toBeInTheDocument();
    expect(screen.getByText(/restricted \(roles\)/i)).toBeInTheDocument();
  });

  it("renders downloaders with anonymous and unknown-user fallbacks", () => {
    searchParamsState.value = "cve=CVE-2021-44228";
    queryState({ data: REPORT });

    render(<BlastRadiusPage />);

    expect(screen.getByText("jane")).toBeInTheDocument();
    expect(screen.getByText("anonymous")).toBeInTheDocument();
    // Unknown user (no username) renders its truncated id with a tooltip.
    expect(
      screen.getByTitle("1f7a12b4-2222-4f2b-9f7d-1c2d3e4f5a6b")
    ).toBeInTheDocument();
    // IP sample preview collapses beyond the first three addresses.
    expect(
      screen.getByText("10.0.0.1, 10.0.0.2, 10.0.0.3 +2 more")
    ).toBeInTheDocument();
  });

  it("invalidates the report on refresh and forwards pagination callbacks", () => {
    searchParamsState.value = "cve=CVE-2021-44228";
    queryState({ data: REPORT });

    render(<BlastRadiusPage />);

    fireEvent.click(
      screen.getByRole("button", { name: /refresh blast radius/i })
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["admin-blast-radius"],
    });

    fireEvent.click(screen.getByRole("button", { name: "next-page" }));
    fireEvent.click(screen.getByRole("button", { name: "set-page-size" }));
    expect(screen.getAllByTestId("data-table").length).toBeGreaterThan(0);
  });

  it("shows empty-table messages for a CVE with no recorded exposure", () => {
    searchParamsState.value = "cve=CVE-2021-44228";
    queryState({
      data: {
        ...REPORT,
        summary: {
          ...REPORT.summary,
          anonymous_download_present: false,
          total_download_count: 0,
        },
        affected_repos: [],
        downloaders: [],
        total_downloaders: 0,
      },
    });

    render(<BlastRadiusPage />);

    expect(
      screen.getByText(/no repositories hold an affected artifact/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no downloads of affected artifacts recorded/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/anonymous downloads present/i)
    ).not.toBeInTheDocument();
  });

  it("renders the latent-exposure section, separated from confirmed downloaders", () => {
    searchParamsState.value = "cve=CVE-2021-44228";
    queryState({ data: REPORT }, { data: ACCESSIBLE_REPORT });

    render(<BlastRadiusPage />);

    // The section and its copy make the latent-vs-confirmed distinction clear.
    expect(
      screen.getByRole("heading", { name: /accessible, not downloaded/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/latent exposure/i)).toBeInTheDocument();
    expect(screen.getByText(/potential/i)).toBeInTheDocument();
    // The confirmed downloaders view is still intact alongside it.
    expect(screen.getByText("jane")).toBeInTheDocument();

    // Accessible-but-not-downloaded users render with their access path.
    expect(screen.getByText("carol")).toBeInTheDocument();
    expect(screen.getByText("dave")).toBeInTheDocument();
    expect(screen.getByText(/permission grant/i)).toBeInTheDocument();
    expect(screen.getByText(/role assignment/i)).toBeInTheDocument();
    expect(screen.getByText(/enumerable set/i)).toBeInTheDocument();
    expect(screen.getByText(/2 with latent access/i)).toBeInTheDocument();
  });

  it("scopes the CVE accessible-users query to the first affected repo, switchable", async () => {
    searchParamsState.value = "cve=CVE-2021-44228";
    queryState({ data: REPORT }, { data: ACCESSIBLE_REPORT });
    mockAccForCve.mockResolvedValue(ACCESSIBLE_REPORT);

    render(<BlastRadiusPage />);

    let opts = lastAccessibleOpts();
    expect(opts.enabled).toBe(true);
    await opts.queryFn();
    // Defaults to the first affected repository (r1).
    expect(mockAccForCve).toHaveBeenCalledWith("CVE-2021-44228", {
      repository_id: "r1",
      page: 1,
      per_page: 20,
    });

    // Switching the repository selector re-scopes the enumeration to r2.
    mockAccForCve.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "select-r2" }));
    opts = lastAccessibleOpts();
    await opts.queryFn();
    expect(mockAccForCve).toHaveBeenCalledWith("CVE-2021-44228", {
      repository_id: "r2",
      page: 1,
      per_page: 20,
    });
  });

  it("runs the artifact accessible-users query without a repository_id", async () => {
    searchParamsState.value = `artifact=${ARTIFACT_ID}`;
    queryState(
      { data: { ...REPORT, target: { kind: "artifact", value: ARTIFACT_ID } } },
      {
        data: {
          ...ACCESSIBLE_REPORT,
          target: { kind: "artifact", value: ARTIFACT_ID },
        },
      }
    );
    mockAccForArtifact.mockResolvedValue(ACCESSIBLE_REPORT);

    render(<BlastRadiusPage />);

    const opts = lastAccessibleOpts();
    expect(opts.enabled).toBe(true);
    await opts.queryFn();
    expect(mockAccForArtifact).toHaveBeenCalledWith(ARTIFACT_ID, {
      page: 1,
      per_page: 20,
    });
    // No repository selector in artifact mode (the artifact implies the repo).
    expect(
      screen.queryByRole("button", { name: "select-r2" })
    ).not.toBeInTheDocument();
  });

  it("shows the everyone banner for a public repo instead of a user list", () => {
    searchParamsState.value = "cve=CVE-2021-44228";
    queryState(
      { data: REPORT },
      {
        data: {
          ...ACCESSIBLE_REPORT,
          repository: {
            ...ACCESSIBLE_REPORT.repository,
            access_scope: "public",
          },
          exposure: "everyone",
          accessible_not_downloaded: [],
          total: null,
        },
      }
    );

    render(<BlastRadiusPage />);

    expect(
      screen.getByText(/public repository — everyone can access/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("carol")).not.toBeInTheDocument();
  });

  it("shows a latent-exposure error without hiding the downloaders view", () => {
    searchParamsState.value = "cve=CVE-2021-44228";
    queryState({ data: REPORT }, { isError: true });

    render(<BlastRadiusPage />);

    expect(screen.getByText(/latent exposure unavailable/i)).toBeInTheDocument();
    // The confirmed-downloaders view still renders.
    expect(screen.getByText("jane")).toBeInTheDocument();
  });
});

describe("AccessScopeBadge", () => {
  it("degrades unknown scopes to a neutral badge with the raw value", () => {
    render(<AccessScopeBadge scope="quarantined" />);
    expect(screen.getByText("quarantined")).toBeInTheDocument();
  });
});

describe("ExposureBadge", () => {
  it("loudly flags a public 'everyone' exposure", () => {
    render(<ExposureBadge exposure="everyone" />);
    expect(
      screen.getByText(/everyone — public repository/i)
    ).toBeInTheDocument();
  });

  it("labels the enumerable and effectively-everyone cases", () => {
    const { rerender } = render(<ExposureBadge exposure="enumerable" />);
    expect(screen.getByText(/enumerable set/i)).toBeInTheDocument();
    rerender(<ExposureBadge exposure="effectively-everyone" />);
    expect(screen.getByText(/effectively everyone/i)).toBeInTheDocument();
  });

  it("degrades an unknown exposure to a neutral badge with the raw value", () => {
    render(<ExposureBadge exposure="quantum" />);
    expect(screen.getByText("quantum")).toBeInTheDocument();
  });
});

describe("ViaBadge", () => {
  it("maps known access paths to friendly labels", () => {
    const { rerender } = render(<ViaBadge via="admin" />);
    expect(screen.getByText("Administrator")).toBeInTheDocument();
    rerender(<ViaBadge via="permission" />);
    expect(screen.getByText("Permission grant")).toBeInTheDocument();
    rerender(<ViaBadge via="role" />);
    expect(screen.getByText("Role assignment")).toBeInTheDocument();
  });

  it("falls back to the raw value for an unknown access path", () => {
    render(<ViaBadge via="mystery" />);
    expect(screen.getByText("mystery")).toBeInTheDocument();
  });
});

describe("ipPreview", () => {
  it("renders an em dash for an empty sample", () => {
    expect(ipPreview([], 0)).toBe("—");
  });

  it("lists up to three addresses verbatim", () => {
    expect(ipPreview(["10.0.0.1", "10.0.0.2"], 2)).toBe("10.0.0.1, 10.0.0.2");
  });

  it("collapses the remainder using the exact distinct count", () => {
    expect(ipPreview(["a", "b", "c", "d"], 6)).toBe("a, b, c +3 more");
  });
});
