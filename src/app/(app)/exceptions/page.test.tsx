// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

interface MutationConfig {
  mutationFn: (...a: unknown[]) => unknown;
  onSuccess?: (...a: unknown[]) => void;
  onError?: (...a: unknown[]) => void;
}
const mutationConfigs: MutationConfig[] = [];
const mutateFns: Array<ReturnType<typeof vi.fn>> = [];
const mockInvalidate = vi.fn();
const mockRefetch = vi.fn();

let queueData: {
  data?: unknown;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
} = { data: { items: [], total: 0 }, isLoading: false };
let repoConfigsData: unknown = {};
let usersData: unknown = [];
let reviewersData: unknown = null;
/** Queries the page declared with `enabled: false`, by their key prefix. */
const disabledQueries = new Set<string>();
const declaredQueries = new Set<string>();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: {
    queryKey: unknown[];
    queryFn: () => unknown;
    enabled?: boolean;
  }) => {
    const key = (opts.queryKey as string[])[0];
    declaredQueries.add(key);
    if (opts.enabled === false) disabledQueries.add(key);
    // Calling queryFn here is what covers the arrow and proves the `enabled`
    // gate: a query the page disabled must never reach its API module.
    if (opts.enabled !== false) {
      try {
        opts.queryFn();
      } catch {
        /* the API module is mocked; a throw here is not the subject */
      }
    }
    if (key === "exception-repo-configs") return { data: repoConfigsData };
    if (key === "exception-users") return { data: usersData };
    if (key === "security-reviewers") return { data: reviewersData };
    return { refetch: mockRefetch, isFetching: false, ...queueData };
  },
  useMutation: (config: MutationConfig) => {
    mutationConfigs.push(config);
    const mutate = vi.fn();
    mutateFns.push(mutate);
    return { mutate, isPending: false };
  },
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  },
}));

const api = {
  list: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  reopen: vi.fn(),
};
vi.mock("@/lib/api/exceptions", () => ({
  EXCEPTION_GATES: ["age", "scan", "curation"],
  EXCEPTION_STATUSES: ["pending", "approved", "rejected"],
  DEFAULT_EXPIRY_DAYS: 90,
  exceptionsApi: {
    list: (...a: unknown[]) => api.list(...a),
    approve: (...a: unknown[]) => api.approve(...a),
    reject: (...a: unknown[]) => api.reject(...a),
    reopen: (...a: unknown[]) => api.reopen(...a),
  },
}));

const mockGetRepoConfigs = vi.fn();
vi.mock("@/lib/api/age-gate", () => ({
  ageGateApi: { getRepoConfigs: (...a: unknown[]) => mockGetRepoConfigs(...a) },
}));

const mockListUsers = vi.fn();
vi.mock("@/lib/api/admin", () => ({
  adminApi: { listUsers: (...a: unknown[]) => mockListUsers(...a) },
}));

const mockListReviewers = vi.fn();
vi.mock("@/lib/api/security-reviewers", () => ({
  securityReviewersApi: { list: (...a: unknown[]) => mockListReviewers(...a) },
}));

let authUser: { id?: string; is_admin: boolean; capabilities?: string[] } | null = {
  is_admin: true,
};
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    user: authUser,
    isAuthenticated: authUser !== null,
    isLoading: false,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

// Native <select> that forwards the trigger's aria-label, so each filter is
// reachable by accessible name. Radix's Select is unusable in jsdom.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children: React.ReactNode;
  }) => {
    const items: Array<{ value: string; label: string }> = [];
    let ariaLabel = "";
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      const el = child as React.ReactElement<{
        "aria-label"?: string;
        children?: React.ReactNode;
      }>;
      if (el.props["aria-label"]) ariaLabel = el.props["aria-label"];
      React.Children.forEach(el.props.children, (sub) => {
        if (React.isValidElement(sub) && (sub.props as Record<string, unknown>).value) {
          const p = sub.props as { value: string; children: React.ReactNode };
          items.push({ value: p.value, label: String(p.children) });
        }
      });
    });
    return (
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
      >
        {items.map((i) => (
          <option key={i.value} value={i.value}>
            {i.label}
          </option>
        ))}
      </select>
    );
  },
  SelectTrigger: ({ children, ...p }: { children: React.ReactNode }) => (
    <span {...p}>{children}</span>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

// Radix renders dialog content in a portal and only when open; render it in
// tree so `within(dialog)` can reach the grant controls.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("lucide-react", () => {
  const icon = (name: string) => {
    const C = () => <span data-testid={`icon-${name}`} />;
    C.displayName = name;
    return C;
  };
  return {
    ShieldCheck: icon("shield-check"),
    RefreshCw: icon("refresh"),
    AlertCircle: icon("alert-circle"),
    Loader2: icon("loader"),
    Infinity: icon("infinity"),
  };
});

import { ApiError } from "@/lib/api/fetch";
import ExceptionsPage from "./page";

const ROW = {
  id: "ex1",
  repositoryKey: "npm-remote",
  packageName: "leftpad-clone",
  packageVersion: "0.0.1",
  gate: "scan" as const,
  status: "pending",
  origin: "requested" as const,
  justification: "the build needs it",
  requestCount: 4,
  requestedAt: "2026-07-15T00:00:00Z",
  lastRequestedAt: "2026-07-20T00:00:00Z",
  reviewedAt: null,
  reviewedBy: null,
  reviewReason: null,
  requestedBy: "11111111-2222-3333-4444-555555555555",
  expiresAt: null,
  upstreamPublishedAt: "2026-07-10T00:00:00Z",
  instanceLocked: false,
  requestedByUsername: null,
};

const APPROVED = {
  ...ROW,
  id: "ex2",
  status: "approved",
  reviewedBy: "99999999-8888-7777-6666-555555555555",
  reviewedAt: "2026-07-21T00:00:00Z",
  reviewReason: "vendor confirmed the release",
  expiresAt: "2099-01-01T00:00:00Z",
};

const withRows = (...items: unknown[]) => {
  queueData = { data: { items, total: items.length }, isLoading: false };
};
const lastMutate = () => mutateFns[mutateFns.length - 1];
const openDialog = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => {
  // A sibling-gate fixture puts the same coordinate on two rows, so the
  // first match is the row under test.
  await user.click(screen.getAllByRole("button", { name })[0]);
  return screen.findByRole("dialog");
};
/** Scoped to the table: the gate filter renders the same labels as the rows. */
const table = () => within(screen.getByRole("table"));

beforeEach(() => {
  mutationConfigs.length = 0;
  mutateFns.length = 0;
  disabledQueries.clear();
  declaredQueries.clear();
  vi.clearAllMocks();
  authUser = { is_admin: true };
  queueData = { data: { items: [], total: 0 }, isLoading: false };
  repoConfigsData = {};
  usersData = [];
  reviewersData = null;
});
afterEach(() => cleanup());

describe("reviewers list", () => {
  it("shows an admin the users and groups who can review", () => {
    reviewersData = {
      users: [
        { id: "u1", username: "hmed", display_name: "Hmed", is_active: true },
        { id: "u2", username: "gone", display_name: null, is_active: false },
      ],
      groups: [{ id: "g1", name: "sec-team", external_source: "oidc", member_count: 3 }],
    };
    render(<ExceptionsPage />);
    const list = screen.getByRole("region", { name: "Reviewers" });
    expect(list).toHaveTextContent(
      "Administrators, plus Hmed, gone (inactive), sec-team (group, 3 members).",
    );
    expect(mockListReviewers).toHaveBeenCalled();
  });

  it("says when only administrators can review", () => {
    reviewersData = { users: [], groups: [] };
    render(<ExceptionsPage />);
    expect(screen.getByRole("region", { name: "Reviewers" })).toHaveTextContent(
      "Administrators only.",
    );
  });

  it("is hidden when the backend has no reviewer API", () => {
    reviewersData = null;
    render(<ExceptionsPage />);
    expect(screen.queryByRole("region", { name: "Reviewers" })).toBeNull();
  });

  it("is hidden from a non-admin reviewer, who never asks for it", () => {
    authUser = { is_admin: false, capabilities: ["security_review"] };
    reviewersData = { users: [], groups: [] };
    render(<ExceptionsPage />);
    expect(screen.queryByRole("region", { name: "Reviewers" })).toBeNull();
    expect(declaredQueries.has("security-reviewers")).toBe(false);
    expect(mockListReviewers).not.toHaveBeenCalled();
  });
});

describe("capability gate", () => {
  it("renders nothing for an authenticated user without the capability", () => {
    authUser = { is_admin: false };
    render(<ExceptionsPage />);
    expect(screen.queryByText("Package Exceptions")).not.toBeInTheDocument();
    // The queue must not be fetched either: hiding the markup while still
    // asking for the rows would leak the queue to the network tab.
    expect(api.list).not.toHaveBeenCalled();
  });

  it("renders the queue for a non-admin who holds security_review", () => {
    authUser = { is_admin: false, capabilities: ["security_review"] };
    render(<ExceptionsPage />);
    expect(screen.getByText("Package Exceptions")).toBeInTheDocument();
  });

  it("renders the queue for an admin with no capability list", () => {
    render(<ExceptionsPage />);
    expect(screen.getByText("Package Exceptions")).toBeInTheDocument();
  });
});

describe("queue states", () => {
  it("asks for every gate, pending only, and human-filed rows only", () => {
    render(<ExceptionsPage />);
    expect(api.list).toHaveBeenCalledWith({
      gates: ["age", "scan", "curation"],
      statuses: ["pending"],
      justifiedOnly: true,
      perPage: 100,
    });
  });

  it("shows a busy skeleton while the queue loads", () => {
    queueData = { data: undefined, isLoading: true };
    render(<ExceptionsPage />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("shows the error and a retry when the queue fails", async () => {
    const user = userEvent.setup();
    queueData = { data: undefined, isLoading: false, isError: true, error: new Error("boom") };
    render(<ExceptionsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't load the queue/i);
    expect(screen.getByText("boom")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("says the server lacks the queue on a 404 rather than offering a doomed retry", () => {
    // A backend older than the exception queue 404s the list route. That is
    // a missing feature, not a failure the reviewer can retry away.
    queueData = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(404, ""),
    };
    render(<ExceptionsPage />);
    expect(screen.getByText(/does not have the package exception queue/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("reports a 404 that carries the backend's own message as an error, not a missing queue", () => {
    queueData = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(404, JSON.stringify({ code: "NOT_FOUND", message: "Review not found" })),
    };
    render(<ExceptionsPage />);
    expect(screen.queryByText(/does not have the package exception queue/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("says a narrowed sign-in cannot open the queue on a 403, with no retry", () => {
    queueData = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(
        403,
        JSON.stringify({
          code: "FORBIDDEN",
          message: "Repository-scoped tokens cannot read or decide package exceptions",
        }),
      ),
    };
    render(<ExceptionsPage />);
    expect(screen.getByText(/cannot open the exception queue with this sign-in/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("explains the default filter in the empty state and offers the request form", () => {
    render(<ExceptionsPage />);
    expect(screen.getByText(/No user-requested exceptions match these filters/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ask for a package that is not listed/i })).toHaveAttribute(
      "href",
      "/exceptions/request",
    );
  });

  it("warns when the server has more rows than the page fetched", () => {
    queueData = { data: { items: [ROW], total: 240 }, isLoading: false };
    render(<ExceptionsPage />);
    expect(screen.getByText(/Showing first 1 of 240/)).toBeInTheDocument();
  });

  it("refetches on demand", async () => {
    const user = userEvent.setup();
    render(<ExceptionsPage />);
    await user.click(screen.getByRole("button", { name: /refresh/i }));
    expect(mockRefetch).toHaveBeenCalled();
  });
});

describe("filters", () => {
  it("narrows the server-side query to one gate", async () => {
    const user = userEvent.setup();
    render(<ExceptionsPage />);
    await user.selectOptions(screen.getByLabelText("Why blocked"), "curation");
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ gates: ["curation"] }),
    );
  });

  it("asks for every gate again when All reasons is chosen", async () => {
    const user = userEvent.setup();
    render(<ExceptionsPage />);
    await user.selectOptions(screen.getByLabelText("Why blocked"), "scan");
    await user.selectOptions(screen.getByLabelText("Why blocked"), "__all__");
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ gates: ["age", "scan", "curation"] }),
    );
  });

  it("narrows and widens the status filter", async () => {
    const user = userEvent.setup();
    render(<ExceptionsPage />);
    await user.selectOptions(screen.getByLabelText("Status"), "approved");
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ statuses: ["approved"] }),
    );
    await user.selectOptions(screen.getByLabelText("Status"), "__all__");
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ statuses: ["pending", "approved", "rejected"] }),
    );
  });

  it("drops justified_only when the reviewer widens past user requests", async () => {
    const user = userEvent.setup();
    render(<ExceptionsPage />);
    await user.selectOptions(screen.getByLabelText("Requested by"), "all");
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ justifiedOnly: false }),
    );
  });

  it("filters attempted-only rows client-side, since the server has no such filter", async () => {
    const user = userEvent.setup();
    withRows(ROW, { ...ROW, id: "ex9", packageName: "nobody-asked", origin: "attempted" });
    render(<ExceptionsPage />);
    expect(screen.getByText("leftpad-clone")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Requested by"), "attempted");
    expect(screen.getByText("nobody-asked")).toBeInTheDocument();
    expect(screen.queryByText("leftpad-clone")).not.toBeInTheDocument();
  });

  it("does not claim truncation when attempted-only narrows a page the server sent whole", async () => {
    const user = userEvent.setup();
    queueData = {
      data: {
        items: [ROW, { ...ROW, id: "ex9", packageName: "nobody-asked", origin: "attempted" }],
        total: 2,
      },
      isLoading: false,
    };
    render(<ExceptionsPage />);
    await user.selectOptions(screen.getByLabelText("Requested by"), "attempted");
    expect(screen.getByText("nobody-asked")).toBeInTheDocument();
    expect(screen.queryByText(/Showing first/)).not.toBeInTheDocument();
  });

  it("says which filter emptied the list when attempted-only matches nothing", async () => {
    const user = userEvent.setup();
    withRows(ROW);
    render(<ExceptionsPage />);
    await user.selectOptions(screen.getByLabelText("Requested by"), "attempted");
    expect(screen.getByText(/No gate-filed refusals match/i)).toBeInTheDocument();
  });

  it("says plainly when nothing matches an unrestricted origin filter", async () => {
    const user = userEvent.setup();
    render(<ExceptionsPage />);
    await user.selectOptions(screen.getByLabelText("Requested by"), "all");
    expect(screen.getByText("No packages match these filters.")).toBeInTheDocument();
  });
});

describe("row ordering", () => {
  it("puts the most recently demanded coordinate first, whatever order the API returned", () => {
    withRows(
      { ...ROW, id: "old", packageName: "stale", lastRequestedAt: "2026-01-01T00:00:00Z" },
      { ...ROW, id: "new", packageName: "fresh", lastRequestedAt: "2026-09-01T00:00:00Z" },
    );
    render(<ExceptionsPage />);
    const names = screen.getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(names[0]).toContain("fresh");
    expect(names[1]).toContain("stale");
  });

  it("breaks a tie on id so the table does not reshuffle between refetches", () => {
    // Two rows filed in the same debounce window share a timestamp; without
    // a tiebreak their order would depend on the sort implementation.
    withRows(
      { ...ROW, id: "b", packageName: "beta" },
      { ...ROW, id: "a", packageName: "alpha" },
    );
    render(<ExceptionsPage />);
    const names = screen.getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(names[0]).toContain("alpha");
    expect(names[1]).toContain("beta");
  });

  it("does not drop a row whose timestamp the backend sent malformed", () => {
    withRows({ ...ROW, lastRequestedAt: "not-a-date" });
    render(<ExceptionsPage />);
    expect(screen.getByText("leftpad-clone")).toBeInTheDocument();
  });
});

describe("row rendering", () => {
  it("shows the coordinate, the gate in plain language and the justification", () => {
    withRows(ROW);
    render(<ExceptionsPage />);
    expect(table().getByText("leftpad-clone")).toBeInTheDocument();
    expect(table().getByText("0.0.1")).toBeInTheDocument();
    expect(table().getByText("Scan gate")).toBeInTheDocument();
    expect(table().getByText(/the build needs it/)).toBeInTheDocument();
  });

  it("labels a row from a backend that sends no gate as unknown rather than guessing", () => {
    withRows({ ...ROW, gate: null });
    render(<ExceptionsPage />);
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });

  it("opens the repository's scan findings from a scan-gate row only", () => {
    withRows(ROW, { ...ROW, id: "ex-age", gate: "age" });
    render(<ExceptionsPage />);
    const links = screen.getAllByRole("link", { name: "Scan gate" });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/repositories/npm-remote?tab=security");
    expect(table().getByText("Age gate")).not.toHaveAttribute("href");
  });

  it("links the repository badge to where its gates are configured", () => {
    withRows(ROW);
    render(<ExceptionsPage />);
    expect(screen.getByRole("link", { name: "npm-remote" })).toHaveAttribute(
      "href",
      "/repositories/npm-remote?tab=settings",
    );
  });

  it("percent-encodes a repository key into every link it builds", () => {
    withRows({ ...ROW, repositoryKey: "team/npm remote" });
    render(<ExceptionsPage />);
    expect(screen.getByRole("link", { name: "team/npm remote" })).toHaveAttribute(
      "href",
      "/repositories/team%2Fnpm%20remote?tab=settings",
    );
  });

  it("measures the package age at refusal time, not now", () => {
    // Measuring from today reads as a contradiction on an old row: "300d old
    // (min 7d)" next to a package the gate is still withholding.
    withRows({ ...ROW, gate: "age" });
    repoConfigsData = { "npm-remote": { repositoryKey: "npm-remote", minAgeDays: 14 } };
    render(<ExceptionsPage />);
    expect(screen.getByText(/5d old \(min 14d\)/)).toBeInTheDocument();
  });

  it("omits the age when upstream never reported a publish date", () => {
    withRows({ ...ROW, gate: "age", upstreamPublishedAt: null });
    render(<ExceptionsPage />);
    expect(screen.queryByText(/d old/)).not.toBeInTheDocument();
  });

  it("omits a nonsensical negative age", () => {
    withRows({ ...ROW, gate: "age", upstreamPublishedAt: "2027-01-01T00:00:00Z" });
    render(<ExceptionsPage />);
    expect(screen.queryByText(/d old/)).not.toBeInTheDocument();
  });

  it("shows the minimum-age threshold only for an age row", () => {
    withRows(ROW);
    repoConfigsData = { "npm-remote": { repositoryKey: "npm-remote", minAgeDays: 14 } };
    render(<ExceptionsPage />);
    expect(screen.queryByText(/min 14d/)).not.toBeInTheDocument();
  });

  it("names who asked and who decided, and pins the exact instant on the title", () => {
    withRows(APPROVED);
    usersData = [
      { id: "11111111-2222-3333-4444-555555555555", username: "dev", display_name: "Dev Eloper" },
      { id: "99999999-8888-7777-6666-555555555555", username: "sam", display_name: "Sam Reviewer" },
    ];
    render(<ExceptionsPage />);
    expect(screen.getByText(/by Dev Eloper/)).toBeInTheDocument();
    expect(screen.getByText(/Sam Reviewer/)).toBeInTheDocument();
    expect(screen.getByText(/vendor confirmed the release/)).toBeInTheDocument();
    // The date renders in the viewer's zone, so the exact instant lives on
    // the title where a timezone cannot blur it.
    expect(screen.getByTitle("2026-07-21T00:00:00Z")).toHaveTextContent(/on Jul \d+, 2026/);
  });

  it("prefers the requester username the backend sends, and skips the user lookup", () => {
    authUser = { is_admin: false, capabilities: ["security_review"] };
    withRows({ ...ROW, requestedByUsername: "alice" });
    render(<ExceptionsPage />);
    expect(screen.getByText("by alice")).toBeInTheDocument();
  });

  it("asks for the user list only to fill in names the backend did not send", () => {
    withRows({ ...APPROVED, requestedByUsername: "alice", reviewedByUsername: "sam" });
    render(<ExceptionsPage />);
    expect(mockListUsers).not.toHaveBeenCalled();
  });

  it("prefers the reviewer username the backend sends, so a non-admin sees it too", () => {
    authUser = { is_admin: false, capabilities: ["security_review"] };
    withRows({ ...APPROVED, reviewedByUsername: "sam" });
    render(<ExceptionsPage />);
    expect(screen.getByText(/^sam/)).toBeInTheDocument();
    expect(screen.queryByText(/99999999…/)).not.toBeInTheDocument();
  });

  it("degrades a reviewer who is not in the first page of users to a short id", () => {
    withRows(APPROVED);
    usersData = [];
    render(<ExceptionsPage />);
    expect(screen.getByText(/99999999…/)).toBeInTheDocument();
  });

  it("distinguishes a row nobody asked for from one awaiting review", () => {
    withRows(
      { ...ROW, id: "a", origin: "attempted", requestedBy: null, justification: null },
      { ...ROW, id: "b" },
    );
    render(<ExceptionsPage />);
    expect(screen.getByText("Nobody has asked")).toBeInTheDocument();
    expect(screen.getByText("Awaiting review")).toBeInTheDocument();
  });

  it("shows a live grant's expiry, and marks a lapsed one as already expired", () => {
    withRows(APPROVED, { ...APPROVED, id: "ex3", expiresAt: "2020-01-01T00:00:00Z" });
    render(<ExceptionsPage />);
    expect(screen.getByText(/^until /)).toBeInTheDocument();
    // Expiry is evaluated on read with no sweeper, so a lapsed row still
    // reads `approved`; rendering it as still-granted would be a lie.
    expect(screen.getByText(/^expired /)).toBeInTheDocument();
  });

  it("calls a never-expiring grant what it is", () => {
    withRows({ ...APPROVED, expiresAt: null });
    render(<ExceptionsPage />);
    expect(screen.getByText("never expires")).toBeInTheDocument();
  });

  it("shows no expiry at all on a row that was never granted", () => {
    withRows(ROW);
    render(<ExceptionsPage />);
    expect(screen.queryByText(/never expires|^until |^expired /)).not.toBeInTheDocument();
  });

  it("falls back to the raw status for one the UI does not model", () => {
    withRows({ ...ROW, status: "escalated" });
    render(<ExceptionsPage />);
    expect(screen.getByText("escalated")).toBeInTheDocument();
  });

  it("warns that a sibling gate still withholds the same coordinate", () => {
    // Each gate files its own row and is excepted separately, so granting
    // one and believing the package is released is the trap here.
    withRows(ROW, { ...ROW, id: "ex-curation", gate: "curation" });
    render(<ExceptionsPage />);
    expect(screen.getAllByText(/Also blocked by/)).toHaveLength(2);
    expect(screen.getByText(/Also blocked by Curation rule/)).toBeInTheDocument();
  });

  it("stops warning once the sibling gate has been granted", () => {
    withRows(ROW, { ...ROW, id: "ex-curation", gate: "curation", status: "approved" });
    render(<ExceptionsPage />);
    expect(screen.queryByText(/Also blocked by Curation rule/)).not.toBeInTheDocument();
  });

  it("does not treat a different version as a sibling of the same package", () => {
    withRows(ROW, { ...ROW, id: "ex-other", gate: "curation", packageVersion: "0.0.2" });
    render(<ExceptionsPage />);
    expect(screen.queryByText(/Also blocked by/)).not.toBeInTheDocument();
  });
});

describe("decision actions", () => {
  it("offers grant and refuse on a pending row", () => {
    withRows(ROW);
    render(<ExceptionsPage />);
    expect(screen.getByRole("button", { name: "Grant leftpad-clone@0.0.1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refuse leftpad-clone@0.0.1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reopen/ })).not.toBeInTheDocument();
  });

  it("offers refuse and reopen on a granted row", () => {
    withRows(APPROVED);
    render(<ExceptionsPage />);
    expect(screen.getByRole("button", { name: "Refuse leftpad-clone@0.0.1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reopen leftpad-clone@0.0.1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Grant/ })).not.toBeInTheDocument();
  });

  it("leaves only refuse to a non-admin reviewer on a row an administrator decided", () => {
    // The backend refuses a non-admin's grant or reopen of an instance-locked
    // row with 403, so the UI says so up front.
    authUser = { is_admin: false, capabilities: ["security_review"] };
    withRows({ ...ROW, status: "rejected", instanceLocked: true });
    render(<ExceptionsPage />);
    const grant = screen.getByRole("button", { name: /^Grant/ });
    expect(grant).toBeDisabled();
    expect(grant).toHaveAccessibleDescription(/only an administrator can grant or reopen it/i);
    expect(screen.getByRole("button", { name: /^Reopen/ })).toBeDisabled();
    withRows({ ...APPROVED, instanceLocked: true });
    cleanup();
    render(<ExceptionsPage />);
    expect(screen.getByRole("button", { name: /^Refuse/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Reopen/ })).toBeDisabled();
  });

  it("does not let a requester grant their own scan or curation request", () => {
    authUser = { id: ROW.requestedBy, is_admin: true };
    withRows(ROW);
    render(<ExceptionsPage />);
    const grant = screen.getByRole("button", { name: /^Grant/ });
    expect(grant).toBeDisabled();
    expect(grant).toHaveAccessibleDescription(/a different reviewer has to grant it/i);
    expect(screen.getByRole("button", { name: /^Refuse/ })).toBeEnabled();
  });

  it("still lets a requester grant their own age-gate request, as the backend does", () => {
    authUser = { id: ROW.requestedBy, is_admin: true };
    withRows({ ...ROW, gate: "age" });
    render(<ExceptionsPage />);
    expect(screen.getByRole("button", { name: /^Grant/ })).toBeEnabled();
  });

  it("keeps every action open to an admin on an instance-locked row", () => {
    withRows({ ...ROW, status: "rejected", instanceLocked: true });
    render(<ExceptionsPage />);
    expect(screen.getByRole("button", { name: /^Grant/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Reopen/ })).toBeEnabled();
    expect(screen.queryByText(/only an administrator can grant/i)).not.toBeInTheDocument();
  });

  it("offers grant and reopen on a refused row", () => {
    withRows({ ...ROW, status: "rejected" });
    render(<ExceptionsPage />);
    expect(screen.getByRole("button", { name: /^Grant/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Reopen/ })).toBeInTheDocument();
  });
});

describe("grant dialog", () => {
  it("states the coordinate, the window and the gate the grant is scoped to", async () => {
    const user = userEvent.setup();
    withRows(ROW);
    render(<ExceptionsPage />);
    const dialog = await openDialog(user, /^Grant leftpad-clone/);
    expect(within(dialog).getByText(/leftpad-clone@0.0.1 in npm-remote/)).toBeInTheDocument();
    expect(within(dialog).getByText(/serves the package for 90 days/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Scoped to/)).toBeInTheDocument();
    expect(within(dialog).getByText("Scan gate")).toBeInTheDocument();
  });

  it("warns that a scan grant is bound to the bytes that were scanned", async () => {
    const user = userEvent.setup();
    withRows(ROW);
    render(<ExceptionsPage />);
    const dialog = await openDialog(user, /^Grant leftpad-clone/);
    expect(within(dialog).getByText(/if upstream republishes this version/i)).toBeInTheDocument();
  });

  it("says nothing about digests for a gate that has none", async () => {
    const user = userEvent.setup();
    withRows({ ...ROW, gate: "age" });
    render(<ExceptionsPage />);
    const dialog = await openDialog(user, /^Grant leftpad-clone/);
    expect(within(dialog).queryByText(/republishes this version/i)).not.toBeInTheDocument();
  });

  it("repeats the sibling-gate warning where the reviewer is about to commit", async () => {
    const user = userEvent.setup();
    // Rows tie on timestamp and break on id, so `ex9` keeps the scan row
    // first and the dialog opens on it.
    withRows(ROW, { ...ROW, id: "ex9", gate: "curation" });
    render(<ExceptionsPage />);
    const dialog = await openDialog(user, /^Grant leftpad-clone/);
    expect(
      within(dialog).getByText(/Still withheld after this by Curation rule/),
    ).toBeInTheDocument();
  });

  it("switches the copy when the grant is made permanent", async () => {
    const user = userEvent.setup();
    withRows(ROW);
    render(<ExceptionsPage />);
    const dialog = await openDialog(user, /^Grant leftpad-clone/);
    await user.click(within(dialog).getByRole("button", { name: /never expires/i }));
    expect(within(dialog).getByText(/serves the package indefinitely/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Expires after/)).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: /never expires/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("says one day in the singular", async () => {
    const user = userEvent.setup();
    withRows(ROW);
    render(<ExceptionsPage />);
    const dialog = await openDialog(user, /^Grant leftpad-clone/);
    await user.clear(within(dialog).getByLabelText(/Expires after/));
    await user.type(within(dialog).getByLabelText(/Expires after/), "1");
    expect(within(dialog).getByText(/serves the package for 1 day,/)).toBeInTheDocument();
  });

  it("blocks and explains an out-of-range or empty window", async () => {
    const user = userEvent.setup();
    withRows(ROW);
    render(<ExceptionsPage />);
    const dialog = await openDialog(user, /^Grant leftpad-clone/);
    const days = within(dialog).getByLabelText(/Expires after/);
    const confirm = within(dialog).getByRole("button", { name: /confirm/i });

    await user.clear(days);
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/from 1 to 3650/);
    expect(days).toHaveAttribute("aria-invalid", "true");
    expect(confirm).toBeDisabled();

    await user.type(days, "4000");
    expect(confirm).toBeDisabled();

    // A fraction is not silently truncated to a window nobody typed.
    await user.clear(days);
    await user.type(days, "1.5");
    expect(confirm).toBeDisabled();

    await user.clear(days);
    await user.type(days, "30");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(dialog).getByText(/serves the package for 30 days/)).toBeInTheDocument();
  });

  it("accepts an out-of-range window once the grant is made permanent", async () => {
    const user = userEvent.setup();
    withRows(ROW);
    render(<ExceptionsPage />);
    const dialog = await openDialog(user, /^Grant leftpad-clone/);
    await user.clear(within(dialog).getByLabelText(/Expires after/));
    await user.click(within(dialog).getByRole("button", { name: /never expires/i }));
    await user.type(within(dialog).getByLabelText("Reason (required)"), "accepted");
    expect(within(dialog).getByRole("button", { name: /confirm/i })).toBeEnabled();
  });

  it("requires a reason for a grant, because a grant widens what is served", async () => {
    const user = userEvent.setup();
    withRows(ROW);
    render(<ExceptionsPage />);
    const dialog = await openDialog(user, /^Grant leftpad-clone/);
    const confirm = within(dialog).getByRole("button", { name: /confirm/i });
    const reason = within(dialog).getByLabelText("Reason (required)");

    expect(confirm).toBeDisabled();
    expect(reason).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByText(/widens what this instance serves/i)).toBeInTheDocument();

    await user.type(reason, "   ");
    expect(confirm).toBeDisabled();

    await user.type(reason, "vendor confirmed");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(lastMutate()).toHaveBeenCalledWith({
      row: ROW,
      target: "approved",
      why: "   vendor confirmed",
    });
  });

  it("lets a pending row be refused without a reason", async () => {
    const user = userEvent.setup();
    withRows(ROW);
    render(<ExceptionsPage />);
    const dialog = await openDialog(user, /^Refuse leftpad-clone/);
    expect(within(dialog).getByText(/Refuse this package/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Reason (optional)")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /confirm/i }));
    expect(lastMutate()).toHaveBeenCalledWith({ row: ROW, target: "rejected", why: "" });
  });

  it("requires a reason to reverse a decision that is already recorded", async () => {
    const user = userEvent.setup();
    withRows(APPROVED);
    render(<ExceptionsPage />);
    const dialog = await openDialog(user, /^Reopen leftpad-clone/);
    expect(within(dialog).getByText(/Reopen this decision/)).toBeInTheDocument();
    expect(within(dialog).getByText(/reverses a decision that is already recorded/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /confirm/i })).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Reason (required)"), "granted the wrong version");
    await user.click(within(dialog).getByRole("button", { name: /confirm/i }));
    expect(lastMutate()).toHaveBeenCalledWith({
      row: APPROVED,
      target: "pending",
      why: "granted the wrong version",
    });
  });

  it("offers no expiry control for a refusal", async () => {
    const user = userEvent.setup();
    withRows(ROW);
    render(<ExceptionsPage />);
    const dialog = await openDialog(user, /^Refuse leftpad-clone/);
    expect(within(dialog).queryByLabelText(/Expires after/)).not.toBeInTheDocument();
  });

  it("clears the reason and the window when the dialog is dismissed", async () => {
    const user = userEvent.setup();
    withRows(ROW);
    render(<ExceptionsPage />);
    let dialog = await openDialog(user, /^Grant leftpad-clone/);
    await user.clear(within(dialog).getByLabelText(/Expires after/));
    await user.type(within(dialog).getByLabelText(/Expires after/), "7");
    await user.type(within(dialog).getByLabelText("Reason (required)"), "typed");
    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));

    dialog = await openDialog(user, /^Grant leftpad-clone/);
    expect(within(dialog).getByLabelText("Reason (required)")).toHaveValue("");
    expect(within(dialog).getByLabelText(/Expires after/)).toHaveValue(90);
  });
});

describe("mutation callbacks", () => {
  it("sends a grant with the window the reviewer chose", async () => {
    const user = userEvent.setup();
    withRows(ROW);
    render(<ExceptionsPage />);
    const dialog = await openDialog(user, /^Grant leftpad-clone/);
    await user.clear(within(dialog).getByLabelText(/Expires after/));
    await user.type(within(dialog).getByLabelText(/Expires after/), "30");
    await mutationConfigs.at(-1)!.mutationFn({ row: ROW, target: "approved", why: "ok" });
    expect(api.approve).toHaveBeenCalledWith("ex1", {
      reason: "ok",
      neverExpires: false,
      expiresInDays: 30,
    });
  });

  it("sends never_expires with no window when the grant is permanent", async () => {
    const user = userEvent.setup();
    withRows(ROW);
    render(<ExceptionsPage />);
    const dialog = await openDialog(user, /^Grant leftpad-clone/);
    await user.click(within(dialog).getByRole("button", { name: /never expires/i }));
    await mutationConfigs.at(-1)!.mutationFn({ row: ROW, target: "approved", why: "ok" });
    expect(api.approve).toHaveBeenCalledWith("ex1", {
      reason: "ok",
      neverExpires: true,
      expiresInDays: undefined,
    });
  });

  it("routes a refusal and a reopen to their own endpoints", async () => {
    render(<ExceptionsPage />);
    const decide = mutationConfigs[0];
    await decide.mutationFn({ row: ROW, target: "rejected", why: "no" });
    expect(api.reject).toHaveBeenCalledWith("ex1", "no");
    await decide.mutationFn({ row: ROW, target: "pending", why: "undo" });
    expect(api.reopen).toHaveBeenCalledWith("ex1", "undo");
  });

  it("invalidates the queue and names the decision on success", () => {
    render(<ExceptionsPage />);
    const decide = mutationConfigs[0];
    decide.onSuccess?.(ROW, { row: ROW, target: "approved" });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["exceptions"] });
    expect(mockToastSuccess).toHaveBeenCalledWith("Granted leftpad-clone@0.0.1");
    decide.onSuccess?.(ROW, { row: ROW, target: "rejected" });
    expect(mockToastSuccess).toHaveBeenCalledWith("Refused leftpad-clone@0.0.1");
    decide.onSuccess?.(ROW, { row: ROW, target: "pending" });
    expect(mockToastSuccess).toHaveBeenCalledWith("Returned to pending leftpad-clone@0.0.1");
  });

  it("restates a self-grant refusal in plain words", () => {
    render(<ExceptionsPage />);
    mutationConfigs[0].onError?.(
      new ApiError(
        403,
        JSON.stringify({
          code: "FORBIDDEN",
          message: "Separation of duties: you cannot grant an exception you requested.",
        }),
      ),
    );
    expect(mockToastError).toHaveBeenCalledWith(
      "You asked for this exception, so a different reviewer has to grant it.",
    );
  });

  it("restates the instance-lock refusal for a reviewer, who is not a repository admin", () => {
    render(<ExceptionsPage />);
    mutationConfigs[0].onError?.(
      new ApiError(
        403,
        JSON.stringify({
          code: "FORBIDDEN",
          message: "This review was decided by an instance administrator. A repository administrator can reject it",
        }),
      ),
    );
    expect(mockToastError).toHaveBeenCalledWith(
      "An administrator decided this one, so only an administrator can grant or reopen it.",
    );
  });

  it("keeps any other 403 in the backend's words, with a fallback for an empty body", () => {
    render(<ExceptionsPage />);
    mutationConfigs[0].onError?.(
      new ApiError(403, JSON.stringify({ code: "FORBIDDEN", message: "Security reviewer access required" })),
    );
    expect(mockToastError).toHaveBeenLastCalledWith("Security reviewer access required");
    mutationConfigs[0].onError?.(new ApiError(403, ""));
    expect(mockToastError).toHaveBeenLastCalledWith("You are not allowed to make this decision.");
  });

  it("refreshes the queue when the row changed under the reviewer (409)", () => {
    render(<ExceptionsPage />);
    mutationConfigs[0].onError?.(
      new ApiError(409, JSON.stringify({ code: "CONFLICT", message: "changed concurrently; retry" })),
    );
    expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/Someone else changed this row/));
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["exceptions"] });
  });

  it("says why a scan request with no refused download cannot be granted yet (409)", () => {
    render(<ExceptionsPage />);
    const said =
      "No refused download of this package has been recorded yet, so there are no bytes to grant this scan exception for.";
    mutationConfigs[0].onError?.(new ApiError(409, JSON.stringify({ code: "CONFLICT", message: said })));
    expect(mockToastError).toHaveBeenCalledWith(said);
  });

  it("leaves the queue alone when the decision is refused by the server", () => {
    render(<ExceptionsPage />);
    mutationConfigs[0].onError?.(new Error("API error 403: forbidden"));
    expect(mockInvalidate).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith("API error 403: forbidden");
  });
});

describe("what a non-admin reviewer is not asked to fetch", () => {
  it("skips both admin-only lookups, since a reviewer would only collect 403s", () => {
    authUser = { is_admin: false, capabilities: ["security_review"] };
    withRows({ ...ROW, gate: "age" }, APPROVED);
    render(<ExceptionsPage />);
    expect(mockGetRepoConfigs).not.toHaveBeenCalled();
    expect(mockListUsers).not.toHaveBeenCalled();
    expect(disabledQueries).toContain("exception-repo-configs");
    expect(disabledQueries).toContain("exception-users");
    // The queue itself still renders: the reviewer sees the rows, just not
    // the names behind the ids.
    expect(table().getAllByText("leftpad-clone")).toHaveLength(2);
    expect(screen.getByText(/99999999…/)).toBeInTheDocument();
  });

  it("looks both up for an admin", () => {
    withRows({ ...ROW, gate: "age" }, APPROVED);
    render(<ExceptionsPage />);
    expect(mockGetRepoConfigs).toHaveBeenCalledWith(["npm-remote"]);
    expect(mockListUsers).toHaveBeenCalledWith({ perPage: 100 });
  });

  it("asks for neither when no row needs them", () => {
    withRows({ ...ROW, gate: "scan", reviewedBy: null, requestedBy: null });
    render(<ExceptionsPage />);
    expect(disabledQueries).toContain("exception-repo-configs");
    expect(disabledQueries).toContain("exception-users");
  });
});
