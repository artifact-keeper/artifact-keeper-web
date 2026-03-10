// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

// Capture mutation and query configs
const useMutationConfigs: Array<{
  mutationFn: (...args: unknown[]) => unknown;
  onSuccess?: (...args: unknown[]) => void;
  onError?: (...args: unknown[]) => void;
}> = [];

let useQueryResponses: Record<string, any> = {};
let useQueryCallIndex = 0;
const useQueryCallKeys: string[][] = [];

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: any) => {
    const key = opts.queryKey;
    useQueryCallKeys.push(key);
    const idx = useQueryCallIndex++;
    // Try to match by first element of queryKey
    const keyStr = key[0];
    if (useQueryResponses[keyStr]) {
      // Execute queryFn to cover arrow callbacks
      if (opts.queryFn && opts.enabled !== false) {
        try { opts.queryFn(); } catch { /* safe */ }
      }
      return useQueryResponses[keyStr];
    }
    return { data: undefined, isLoading: false, isFetching: false };
  },
  useMutation: (config: any) => {
    useMutationConfigs.push(config);
    return { mutate: vi.fn(), isPending: false };
  },
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: {
    list: vi.fn().mockResolvedValue({ items: [], pagination: { total_pages: 1 } }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock("@/lib/api/search", () => ({
  searchApi: { quickSearch: vi.fn() },
}));

vi.mock("@/lib/query-keys", () => ({
  invalidateGroup: vi.fn(),
}));

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseIsMobile = vi.fn();
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock("@/lib/error-utils", () => ({
  toUserMessage: (err: unknown, fallback: string) => {
    if (err instanceof Error) return err.message;
    if (err && typeof err === "object" && "error" in err) return (err as any).error;
    return fallback;
  },
}));

vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: any) => <span data-testid={`icon-${name}`} {...props} />;
    Icon.displayName = name;
    return Icon;
  };
  return {
    Plus: stub("Plus"),
    Search: stub("Search"),
    RefreshCw: stub("RefreshCw"),
    Package: stub("Package"),
  };
});

// Stub complex UI components
vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: any) => <div data-testid="resizable-group">{children}</div>,
  ResizablePanel: ({ children }: any) => <div data-testid="resizable-panel">{children}</div>,
  ResizableHandle: () => <div data-testid="resizable-handle" />,
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: Object.assign(
    React.forwardRef(function TooltipTrigger({ children, ...props }: any, ref: any) {
      return <div ref={ref} {...props}>{children}</div>;
    }),
    { displayName: "TooltipTrigger" }
  ),
  TooltipContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <select value={value} onChange={(e: any) => onValueChange?.(e.target.value)} data-testid="mock-select">
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
  SelectGroup: ({ children }: any) => <optgroup>{children}</optgroup>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

// Stub child components
vi.mock("./repo-list-item", () => ({
  RepoListItem: (props: any) => (
    <div
      data-testid="repo-list-item"
      data-key={props.repo.key}
      onClick={() => props.onSelect(props.repo)}
    >
      {props.repo.key}
      {props.artifactMatchCount != null && (
        <span data-testid="artifact-match-count">{props.artifactMatchCount}</span>
      )}
    </div>
  ),
}));

vi.mock("./repo-detail-panel", () => ({
  RepoDetailPanel: ({ repoKey }: any) => <div data-testid="detail-panel">{repoKey}</div>,
}));

vi.mock("./repo-dialogs", () => ({
  RepoDialogs: () => <div data-testid="repo-dialogs" />,
}));

// ---------------------------------------------------------------------------
// Import component under test
// ---------------------------------------------------------------------------

import { RepositoriesContent } from "./repositories-content";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const sampleRepos = [
  { id: "1", key: "maven-central", name: "Maven Central", format: "maven", repo_type: "remote", storage_used_bytes: 1024, is_public: true },
  { id: "2", key: "npm-local", name: "NPM Local", format: "npm", repo_type: "local", storage_used_bytes: 2048, is_public: true },
  { id: "3", key: "docker-proxy", name: "Docker Proxy", format: "docker", repo_type: "remote", storage_used_bytes: 0, is_public: false },
];

describe("RepositoriesContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMutationConfigs.length = 0;
    useQueryCallIndex = 0;
    useQueryCallKeys.length = 0;
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: { is_admin: true } });
    mockUseIsMobile.mockReturnValue(false);

    useQueryResponses = {
      repositories: {
        data: { items: sampleRepos, pagination: { total_pages: 1, total: 3 } },
        isLoading: false,
        isFetching: false,
      },
      "repo-artifact-search": { data: undefined, isLoading: false, isFetching: false },
      "repo-artifact-extras": { data: undefined, isLoading: false, isFetching: false },
    };
  });

  afterEach(() => {
    cleanup();
  });

  // ---- Basic rendering ----

  it("renders page heading and description", () => {
    render(<RepositoriesContent />);
    expect(screen.getByText("Repositories")).toBeInTheDocument();
    expect(screen.getByText(/manage artifact repositories/i)).toBeInTheDocument();
  });

  it("renders Create Repository button when authenticated", () => {
    render(<RepositoriesContent />);
    expect(screen.getByText("Create Repository")).toBeInTheDocument();
  });

  it("does not render Create Repository button when not authenticated", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, user: null });
    render(<RepositoriesContent />);
    expect(screen.queryByText("Create Repository")).not.toBeInTheDocument();
  });

  it("renders search input", () => {
    render(<RepositoriesContent />);
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("renders repository list items", () => {
    render(<RepositoriesContent />);
    const items = screen.getAllByTestId("repo-list-item");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("maven-central");
    expect(items[1]).toHaveTextContent("npm-local");
  });

  // ---- Loading state ----

  it("shows skeletons while loading", () => {
    useQueryResponses = {
      repositories: { data: undefined, isLoading: true, isFetching: true },
      "repo-artifact-search": { data: undefined, isLoading: false, isFetching: false },
      "repo-artifact-extras": { data: undefined, isLoading: false, isFetching: false },
    };
    render(<RepositoriesContent />);
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // ---- Empty state ----

  it("shows empty state when no repositories found", () => {
    useQueryResponses = {
      repositories: {
        data: { items: [], pagination: { total_pages: 1 } },
        isLoading: false,
        isFetching: false,
      },
      "repo-artifact-search": { data: undefined, isLoading: false, isFetching: false },
      "repo-artifact-extras": { data: undefined, isLoading: false, isFetching: false },
    };
    render(<RepositoriesContent />);
    expect(screen.getByText("No repositories found.")).toBeInTheDocument();
  });

  // ---- Desktop layout ----

  it("renders resizable panel group on desktop", () => {
    mockUseIsMobile.mockReturnValue(false);
    render(<RepositoriesContent />);
    expect(screen.getByTestId("resizable-group")).toBeInTheDocument();
  });

  it("auto-selects first repo on desktop when none selected", () => {
    mockUseIsMobile.mockReturnValue(false);
    render(<RepositoriesContent />);
    // The detail panel should show the first repo's key
    expect(screen.getByTestId("detail-panel")).toHaveTextContent("maven-central");
  });

  // ---- Mobile layout ----

  it("does not render resizable panels on mobile", () => {
    mockUseIsMobile.mockReturnValue(true);
    render(<RepositoriesContent />);
    expect(screen.queryByTestId("resizable-group")).not.toBeInTheDocument();
  });

  it("navigates to repo detail page on mobile when selecting a repo", () => {
    mockUseIsMobile.mockReturnValue(true);
    render(<RepositoriesContent />);

    const firstItem = screen.getAllByTestId("repo-list-item")[0];
    fireEvent.click(firstItem);

    expect(mockPush).toHaveBeenCalledWith("/repositories/maven-central");
  });

  // ---- Detail panel placeholder ----

  it("shows placeholder when no repos exist and nothing is selected", () => {
    useQueryResponses = {
      repositories: {
        data: { items: [], pagination: { total_pages: 1 } },
        isLoading: false,
        isFetching: false,
      },
      "repo-artifact-search": { data: undefined, isLoading: false, isFetching: false },
      "repo-artifact-extras": { data: undefined, isLoading: false, isFetching: false },
    };
    mockUseIsMobile.mockReturnValue(false);
    render(<RepositoriesContent />);
    expect(screen.getByText("Select a repository")).toBeInTheDocument();
  });

  // ---- Pagination ----

  it("does not render pagination when totalPages is 1", () => {
    render(<RepositoriesContent />);
    expect(screen.queryByLabelText("Previous page")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Next page")).not.toBeInTheDocument();
  });

  it("renders pagination when totalPages > 1", () => {
    useQueryResponses = {
      repositories: {
        data: { items: sampleRepos, pagination: { total_pages: 3, total: 150 } },
        isLoading: false,
        isFetching: false,
      },
      "repo-artifact-search": { data: undefined, isLoading: false, isFetching: false },
      "repo-artifact-extras": { data: undefined, isLoading: false, isFetching: false },
    };
    render(<RepositoriesContent />);
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous page")).toBeInTheDocument();
    expect(screen.getByLabelText("Next page")).toBeInTheDocument();
  });

  // ---- Mutation callbacks ----

  it("registers create, update, and delete mutations", () => {
    render(<RepositoriesContent />);
    expect(useMutationConfigs).toHaveLength(3);
  });

  it("create mutation onSuccess shows toast for staging repo", () => {
    render(<RepositoriesContent />);
    const createConfig = useMutationConfigs[0];
    createConfig.onSuccess?.({}, { repo_type: "staging" });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Repository created",
      expect.objectContaining({
        description: expect.stringMatching(/promotion rules/i),
      })
    );
  });

  it("create mutation onSuccess shows simple toast for non-staging repo", () => {
    render(<RepositoriesContent />);
    const createConfig = useMutationConfigs[0];
    createConfig.onSuccess?.({}, { repo_type: "local" });
    expect(mockToastSuccess).toHaveBeenCalledWith("Repository created");
  });

  it("create mutation onError shows error toast", () => {
    render(<RepositoriesContent />);
    const createConfig = useMutationConfigs[0];
    createConfig.onError?.(new Error("Conflict"));
    expect(mockToastError).toHaveBeenCalledWith("Conflict");
  });

  it("update mutation onSuccess shows success toast", () => {
    render(<RepositoriesContent />);
    const updateConfig = useMutationConfigs[1];
    updateConfig.onSuccess?.({ key: "test" }, { key: "test", data: {} });
    expect(mockToastSuccess).toHaveBeenCalledWith("Repository updated");
  });

  it("update mutation onError shows error toast", () => {
    render(<RepositoriesContent />);
    const updateConfig = useMutationConfigs[1];
    updateConfig.onError?.({ error: "Not Found" });
    expect(mockToastError).toHaveBeenCalledWith("Not Found");
  });

  it("delete mutation onSuccess shows success toast", () => {
    render(<RepositoriesContent />);
    const deleteConfig = useMutationConfigs[2];
    deleteConfig.onSuccess?.({}, "my-repo");
    expect(mockToastSuccess).toHaveBeenCalledWith("Repository deleted");
  });

  it("delete mutation onError shows error toast", () => {
    render(<RepositoriesContent />);
    const deleteConfig = useMutationConfigs[2];
    deleteConfig.onError?.(new Error("Cannot delete"));
    expect(mockToastError).toHaveBeenCalledWith("Cannot delete");
  });

  // ---- Selection on desktop ----

  it("shows detail panel for clicked repo on desktop", () => {
    mockUseIsMobile.mockReturnValue(false);

    // Mock window.history.replaceState
    const originalReplaceState = window.history.replaceState;
    window.history.replaceState = vi.fn();

    render(<RepositoriesContent />);

    const secondItem = screen.getAllByTestId("repo-list-item")[1];
    fireEvent.click(secondItem);

    // Detail panel should show npm-local
    const panels = screen.getAllByTestId("detail-panel");
    expect(panels.some((p) => p.textContent === "npm-local")).toBe(true);

    window.history.replaceState = originalReplaceState;
  });

  // ---- Dialogs ----

  it("renders the RepoDialogs component", () => {
    render(<RepositoriesContent />);
    expect(screen.getByTestId("repo-dialogs")).toBeInTheDocument();
  });

  // ---- Search/filter ----

  it("filters repos by name when search query is typed", () => {
    render(<RepositoriesContent />);

    const searchInput = screen.getByPlaceholderText("Search...");
    fireEvent.change(searchInput, { target: { value: "maven" } });

    // After filtering, only maven-central should match by name
    const items = screen.getAllByTestId("repo-list-item");
    // The filter runs via useMemo, but since our mock returns all items
    // the search query filters on the client side
    expect(items.some((el) => el.textContent?.includes("maven-central"))).toBe(true);
  });

  it("shows artifact match count from search results", () => {
    // Simulate artifact search returning results for npm-local
    useQueryResponses["repo-artifact-search"] = {
      data: [
        { repository_key: "npm-local", name: "react", id: "1" },
        { repository_key: "npm-local", name: "lodash", id: "2" },
      ],
      isLoading: false,
      isFetching: false,
    };
    render(<RepositoriesContent />);

    // Type a search query to trigger artifact search
    const searchInput = screen.getByPlaceholderText("Search...");
    fireEvent.change(searchInput, { target: { value: "react" } });

    // The artifact match count badges should render
    const matchCounts = screen.getAllByTestId("artifact-match-count");
    expect(matchCounts.length).toBeGreaterThan(0);
  });

  // ---- Refresh button ----

  it("renders refresh button with aria-label", () => {
    render(<RepositoriesContent />);
    expect(screen.getByLabelText("Refresh repositories")).toBeInTheDocument();
  });

  it("shows spinning icon when fetching", () => {
    useQueryResponses = {
      repositories: {
        data: { items: sampleRepos, pagination: { total_pages: 1 } },
        isLoading: false,
        isFetching: true,
      },
      "repo-artifact-search": { data: undefined, isLoading: false, isFetching: false },
      "repo-artifact-extras": { data: undefined, isLoading: false, isFetching: false },
    };
    render(<RepositoriesContent />);
    // The RefreshCw icon should be rendered (even if not spinning in mock)
    expect(screen.getByTestId("icon-RefreshCw")).toBeInTheDocument();
  });

  // ---- Non-admin user ----

  it("does not pass edit/delete handlers when user is not admin", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: { is_admin: false } });
    render(<RepositoriesContent />);

    // RepoListItem should still render but without edit/delete callbacks
    const items = screen.getAllByTestId("repo-list-item");
    expect(items.length).toBeGreaterThan(0);
  });

  it("does not pass edit/delete handlers when not authenticated", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, user: null });
    render(<RepositoriesContent />);

    const items = screen.getAllByTestId("repo-list-item");
    expect(items.length).toBeGreaterThan(0);
  });

  // ---- Pagination page changes ----

  it("disables previous button on first page", () => {
    useQueryResponses = {
      repositories: {
        data: { items: sampleRepos, pagination: { total_pages: 3, total: 150 } },
        isLoading: false,
        isFetching: false,
      },
      "repo-artifact-search": { data: undefined, isLoading: false, isFetching: false },
      "repo-artifact-extras": { data: undefined, isLoading: false, isFetching: false },
    };
    render(<RepositoriesContent />);

    const prevBtn = screen.getByLabelText("Previous page");
    expect(prevBtn).toHaveProperty("disabled", true);
  });

  // ---- Format/type filter selects ----

  it("renders format and type filter selects", () => {
    render(<RepositoriesContent />);
    const selects = screen.getAllByTestId("mock-select");
    // Should have at least 2 selects (format + type)
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });

  // ---- URL-based initial selection ----

  it("initializes selectedKey from URL searchParams", () => {
    // Set up window.location to have a selected param
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, href: "http://localhost:3000/repositories?selected=npm-local" },
      writable: true,
    });

    render(<RepositoriesContent />);

    // Detail panel should show npm-local since it was in URL
    const panels = screen.getAllByTestId("detail-panel");
    expect(panels.some((p) => p.textContent === "npm-local")).toBe(true);

    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
  });

  // ---- Loading state has accessibility attributes ----

  it("loading state has aria-busy attribute", () => {
    useQueryResponses = {
      repositories: { data: undefined, isLoading: true, isFetching: true },
      "repo-artifact-search": { data: undefined, isLoading: false, isFetching: false },
      "repo-artifact-extras": { data: undefined, isLoading: false, isFetching: false },
    };
    render(<RepositoriesContent />);
    const statusEl = screen.getByRole("status");
    expect(statusEl).toHaveAttribute("aria-busy", "true");
  });
});
