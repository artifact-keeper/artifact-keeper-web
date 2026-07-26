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
let reviewsData: { data: unknown; isLoading?: boolean; isError?: boolean; error?: unknown } = {
  data: [],
  isLoading: false,
};
let repoConfigsData: unknown = {};

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[]; queryFn: () => unknown; enabled?: boolean }) => {
    const key = (opts.queryKey as string[])[0];
    if (key === "age-gate-repo-configs") return { data: repoConfigsData };
    if (opts.enabled !== false) {
      try {
        opts.queryFn();
      } catch {
        /* ignore */
      }
    }
    return { refetch: vi.fn(), isFetching: false, ...reviewsData };
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
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => mockToastSuccess(...a), error: vi.fn() } }));

const api = {
  listReviews: vi.fn(),
  getReview: vi.fn(),
  approveReview: vi.fn(),
  rejectReview: vi.fn(),
  getRepoConfigs: vi.fn(),
};
vi.mock("@/lib/api/age-gate", () => ({
  default: {
    listReviews: (...a: unknown[]) => api.listReviews(...a),
    getReview: (...a: unknown[]) => api.getReview(...a),
    approveReview: (...a: unknown[]) => api.approveReview(...a),
    rejectReview: (...a: unknown[]) => api.rejectReview(...a),
    getRepoConfigs: (...a: unknown[]) => api.getRepoConfigs(...a),
  },
}));

let isAdmin = true;
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ user: isAdmin ? { is_admin: true } : { is_admin: false } }),
}));

// Native <select> that forwards aria-label so tests can target each one.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children: React.ReactNode }) => {
    const items: Array<{ value: string; label: string }> = [];
    let ariaLabel = "";
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      const el = child as React.ReactElement<{ "aria-label"?: string; children?: React.ReactNode }>;
      if (el.props["aria-label"]) ariaLabel = el.props["aria-label"];
      React.Children.forEach(el.props.children, (sub) => {
        if (React.isValidElement(sub) && (sub.props as Record<string, unknown>).value) {
          const p = sub.props as { value: string; children: React.ReactNode };
          items.push({ value: p.value, label: String(p.children) });
        }
      });
    });
    return (
      <select aria-label={ariaLabel} value={value} onChange={(e) => onValueChange?.(e.target.value)}>
        {items.map((i) => (
          <option key={i.value} value={i.value}>{i.label}</option>
        ))}
      </select>
    );
  },
  SelectTrigger: ({ children, ...p }: { children: React.ReactNode }) => <span {...p}>{children}</span>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
}));

import AgeGatePage from "./page";

const REVIEW = {
  id: "rv1",
  packageName: "leftpad-clone",
  packageVersion: "0.0.1",
  repositoryKey: "npm-remote",
  status: "pending",
  requestCount: 4,
  requestedAt: "2026-07-15T00:00:00Z",
  lastRequestedAt: "2026-07-20T00:00:00Z",
  upstreamPublishedAt: "2026-07-10T00:00:00Z",
  ageDaysAtRequest: 5,
  reviewReason: null,
  reviewedAt: null,
  reviewedBy: null,
};

const approveMutate = () => mutateFns[mutateFns.length - 1];

beforeEach(() => {
  mutationConfigs.length = 0;
  mutateFns.length = 0;
  vi.clearAllMocks();
  isAdmin = true;
  reviewsData = { data: [], isLoading: false };
  repoConfigsData = {};
});
afterEach(() => cleanup());

describe("AgeGatePage", () => {
  it("gates non-admins", () => {
    isAdmin = false;
    render(<AgeGatePage />);
    expect(screen.getByText(/requires administrator access/i)).toBeInTheDocument();
  });

  it("shows the empty queue by default (pending)", () => {
    render(<AgeGatePage />);
    expect(screen.getByText(/No pending releases/i)).toBeInTheDocument();
    expect(api.listReviews).toHaveBeenCalledWith({ status: "pending" });
  });

  it("shows an error state with retry", () => {
    reviewsData = { data: undefined, isLoading: false, isError: true, error: new Error("x") };
    render(<AgeGatePage />);
    expect(screen.getByText(/Couldn't load the age gate queue/i)).toBeInTheDocument();
  });

  it("lists held releases with age-at-request and repository", () => {
    reviewsData = { data: [REVIEW], isLoading: false };
    repoConfigsData = { "npm-remote": { repositoryKey: "npm-remote", enabled: true, minAgeDays: 14 } };
    render(<AgeGatePage />);
    expect(screen.getByText("leftpad-clone")).toBeInTheDocument();
    expect(screen.getByText("npm-remote")).toBeInTheDocument();
    expect(screen.getByText(/5d old \(min 14d\)/)).toBeInTheDocument();
  });

  it("approves a held release with a reason", async () => {
    const user = userEvent.setup();
    reviewsData = { data: [REVIEW], isLoading: false };
    render(<AgeGatePage />);
    await user.click(screen.getByRole("button", { name: /Approve leftpad-clone/i }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Reason"), "verified safe");
    await user.click(within(dialog).getByRole("button", { name: /confirm/i }));
    expect(approveMutate()).toHaveBeenCalledWith({ review: REVIEW, action: "approve", why: "verified safe" });
  });

  it("rejects a held release without requiring a reason", async () => {
    const user = userEvent.setup();
    reviewsData = { data: [REVIEW], isLoading: false };
    render(<AgeGatePage />);
    await user.click(screen.getByRole("button", { name: /Reject leftpad-clone/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /confirm/i }));
    expect(approveMutate()).toHaveBeenCalledWith({ review: REVIEW, action: "reject", why: "" });
  });

  it("clears the reason when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    reviewsData = { data: [REVIEW], isLoading: false };
    render(<AgeGatePage />);
    await user.click(screen.getByRole("button", { name: /Approve leftpad-clone/i }));
    let dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Reason"), "typed");
    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));
    await user.click(screen.getByRole("button", { name: /Approve leftpad-clone/i }));
    dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("Reason") as HTMLInputElement).value).toBe("");
  });

  it("hides the Approve action on the approved queue and Reject on the rejected queue", async () => {
    const user = userEvent.setup();
    reviewsData = { data: [{ ...REVIEW, status: "approved" }], isLoading: false };
    render(<AgeGatePage />);
    await user.selectOptions(screen.getByLabelText("Status filter"), "approved");
    expect(screen.queryByRole("button", { name: /Approve leftpad-clone/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reject leftpad-clone/i })).toBeInTheDocument();
  });

  it("mutation callbacks invalidate and toast on success, and call the API on submit", () => {
    render(<AgeGatePage />);
    const [action] = mutationConfigs;
    action.mutationFn({ review: REVIEW, action: "approve", why: "ok" });
    expect(api.approveReview).toHaveBeenCalledWith("rv1", "ok");
    action.onSuccess?.(REVIEW, { review: REVIEW, action: "approve" });
    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalled();
  });
});
