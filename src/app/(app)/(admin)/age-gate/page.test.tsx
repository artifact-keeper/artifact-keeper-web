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
  data: { items: [], total: 0 },
  isLoading: false,
};
let repoConfigsData: unknown = {};
let usersData: unknown = [];

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[]; queryFn: () => unknown; enabled?: boolean }) => {
    const key = (opts.queryKey as string[])[0];
    if (key === "age-gate-repo-configs") return { data: repoConfigsData };
    if (key === "age-gate-reviewers") {
      if (opts.enabled !== false) opts.queryFn();
      return { data: usersData };
    }
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
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  },
}));

/**
 * Reopen capability, as the page sees it. Hoisted so the `vi.mock` factory
 * below can close over it; set before render to exercise an older backend.
 */
const capability = vi.hoisted(() => ({ reopenSupported: true }));

const api = {
  listReviews: vi.fn(),
  getReview: vi.fn(),
  approveReview: vi.fn(),
  rejectReview: vi.fn(),
  reopenReview: vi.fn(),
  changeReviewStatus: vi.fn(),
  getRepoConfigs: vi.fn(),
};
vi.mock("@/lib/api/age-gate", () => {
  // Declared inside the factory (vi.mock is hoisted) and re-imported below, so
  // the page and the tests share one class.
  class ReopenUnsupportedError extends Error {
    constructor() {
      super("This server does not support reopening a decided age gate review.");
      this.name = "ReopenUnsupportedError";
    }
  }
  return {
  AGE_GATE_STATUSES: ["pending", "approved", "rejected"],
  ReopenUnsupportedError,
  isReopenSupported: () => capability.reopenSupported,
  subscribeReopenSupport: () => () => {},
  ageGateApi: {
    listReviews: (...a: unknown[]) => api.listReviews(...a),
    getReview: (...a: unknown[]) => api.getReview(...a),
    approveReview: (...a: unknown[]) => api.approveReview(...a),
    rejectReview: (...a: unknown[]) => api.rejectReview(...a),
    reopenReview: (...a: unknown[]) => api.reopenReview(...a),
    changeReviewStatus: (...a: unknown[]) => api.changeReviewStatus(...a),
    getRepoConfigs: (...a: unknown[]) => api.getRepoConfigs(...a),
  },
  };
});

const mockListUsers = vi.fn();
vi.mock("@/lib/api/admin", () => ({
  adminApi: { listUsers: (...a: unknown[]) => mockListUsers(...a) },
}));

let isAdmin = true;
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ user: isAdmin ? { is_admin: true } : { is_admin: false } }),
}));

// Native <select> that forwards aria-label so tests can target each one.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children: React.ReactNode }) => {
    const items: Array<{ value: string; label: string; disabled?: boolean }> = [];
    let ariaLabel = "";
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      const el = child as React.ReactElement<{ "aria-label"?: string; children?: React.ReactNode }>;
      if (el.props["aria-label"]) ariaLabel = el.props["aria-label"];
      React.Children.forEach(el.props.children, (sub) => {
        if (React.isValidElement(sub) && (sub.props as Record<string, unknown>).value) {
          const p = sub.props as { value: string; children: React.ReactNode; disabled?: boolean };
          items.push({ value: p.value, label: String(p.children), disabled: p.disabled });
        }
      });
    });
    return (
      <select aria-label={ariaLabel} value={value} onChange={(e) => onValueChange?.(e.target.value)}>
        {items.map((i) => (
          <option key={i.value} value={i.value} disabled={i.disabled}>{i.label}</option>
        ))}
      </select>
    );
  },
  SelectTrigger: ({ children, ...p }: { children: React.ReactNode }) => <span {...p}>{children}</span>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
}));

import { ReopenUnsupportedError } from "@/lib/api/age-gate";
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

const APPROVED_REVIEW = {
  ...REVIEW,
  status: "approved",
  reviewReason: "vendor confirmed the release",
  reviewedAt: "2026-07-21T00:00:00Z",
  reviewedBy: "11111111-2222-3333-4444-555555555555",
};

const lastMutate = () => mutateFns[mutateFns.length - 1];

beforeEach(() => {
  mutationConfigs.length = 0;
  mutateFns.length = 0;
  vi.clearAllMocks();
  isAdmin = true;
  reviewsData = { data: { items: [], total: 0 }, isLoading: false };
  repoConfigsData = {};
  usersData = [];
  capability.reopenSupported = true;
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
    expect(api.listReviews).toHaveBeenCalledWith({ statuses: ["pending"], perPage: 100 });
  });

  it("shows an error state with retry", () => {
    reviewsData = { data: undefined, isLoading: false, isError: true, error: new Error("x") };
    render(<AgeGatePage />);
    expect(screen.getByText(/Couldn't load the age gate queue/i)).toBeInTheDocument();
  });

  it("shows a loading skeleton while the queue is fetching", () => {
    reviewsData = { data: undefined, isLoading: true };
    render(<AgeGatePage />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("lists held releases with age-at-request and repository", () => {
    reviewsData = { data: { items: [REVIEW], total: 1 }, isLoading: false };
    repoConfigsData = { "npm-remote": { repositoryKey: "npm-remote", enabled: true, minAgeDays: 14 } };
    render(<AgeGatePage />);
    expect(screen.getByText("leftpad-clone")).toBeInTheDocument();
    expect(screen.getByText("npm-remote")).toBeInTheDocument();
    expect(screen.getByText(/5d old \(min 14d\)/)).toBeInTheDocument();
  });

  it("links each repository badge to that repo's settings tab (#701)", () => {
    reviewsData = { data: { items: [REVIEW], total: 1 }, isLoading: false };
    render(<AgeGatePage />);
    const link = screen.getByRole("link", { name: "npm-remote" });
    expect(link).toHaveAttribute("href", "/repositories/npm-remote?tab=settings");
  });

  it("adds a status to the server-side filter when its checkbox is ticked", async () => {
    const user = userEvent.setup();
    render(<AgeGatePage />);
    await user.click(screen.getByLabelText("Show approved"));
    expect(api.listReviews).toHaveBeenLastCalledWith({ statuses: ["pending", "approved"], perPage: 100 });
  });

  it("makes no request and says so when every status is unticked", async () => {
    const user = userEvent.setup();
    render(<AgeGatePage />);
    await user.click(screen.getByLabelText("Show pending"));
    expect(screen.getByText(/Select at least one status/i)).toBeInTheDocument();
    expect(api.listReviews).toHaveBeenCalledTimes(1); // only the initial pending fetch
  });

  describe("decision metadata", () => {
    it("shows the recorded reason, the reviewer's name and the decision date", () => {
      reviewsData = { data: { items: [APPROVED_REVIEW], total: 1 }, isLoading: false };
      usersData = [
        { id: "11111111-2222-3333-4444-555555555555", username: "sam", display_name: "Sam Reviewer" },
      ];
      render(<AgeGatePage />);
      expect(screen.getByText(/vendor confirmed the release/)).toBeInTheDocument();
      expect(screen.getByText(/Sam Reviewer/)).toBeInTheDocument();
      // Rendered in the viewer's local zone, so assert the shape and keep the
      // exact instant on the title attribute.
      expect(screen.getByTitle("2026-07-21T00:00:00Z")).toHaveTextContent(/on Jul \d+, 2026/);
      expect(mockListUsers).toHaveBeenCalledWith({ perPage: 100 });
    });

    it("falls back to a shortened user id when the reviewer is not in the user list", () => {
      reviewsData = { data: { items: [APPROVED_REVIEW], total: 1 }, isLoading: false };
      usersData = [];
      render(<AgeGatePage />);
      expect(screen.getByText(/11111111…/)).toBeInTheDocument();
    });

    it("marks a pending review as not yet decided", () => {
      reviewsData = { data: { items: [REVIEW], total: 1 }, isLoading: false };
      render(<AgeGatePage />);
      expect(screen.getByText(/Not yet decided/i)).toBeInTheDocument();
      expect(mockListUsers).not.toHaveBeenCalled();
    });

    it("marks a reopened review as not yet decided even though the backend leaves reviewer metadata on it", () => {
      // Reopen sets reviewed_by to the reopening admin with reviewed_at = NOW()
      // and keeps the reopen reason; the row is still pending and must not
      // read as decided.
      const reopened = {
        ...APPROVED_REVIEW,
        status: "pending",
        reviewReason: "approved the wrong package",
      };
      reviewsData = { data: { items: [reopened], total: 1 }, isLoading: false };
      usersData = [
        { id: "11111111-2222-3333-4444-555555555555", username: "sam", display_name: "Sam Reviewer" },
      ];
      render(<AgeGatePage />);
      expect(screen.getByText(/Not yet decided/i)).toBeInTheDocument();
      expect(screen.queryByText(/Sam Reviewer/)).not.toBeInTheDocument();
      expect(screen.queryByText(/approved the wrong package/)).not.toBeInTheDocument();
    });
  });

  describe("status control", () => {
    it("confirms before approving, spelling out that the version gets released", async () => {
      const user = userEvent.setup();
      reviewsData = { data: { items: [REVIEW], total: 1 }, isLoading: false };
      render(<AgeGatePage />);
      await user.selectOptions(screen.getByLabelText("Status for leftpad-clone"), "approved");
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(/releases the version to any client/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/Confirm you mean to release/i)).toBeInTheDocument();
      await user.type(within(dialog).getByLabelText("Reason"), "verified safe");
      await user.click(within(dialog).getByRole("button", { name: /confirm/i }));
      expect(lastMutate()).toHaveBeenCalledWith({ review: REVIEW, target: "approved", why: "verified safe" });
    });

    it("lets a pending review be rejected without a reason", async () => {
      const user = userEvent.setup();
      reviewsData = { data: { items: [REVIEW], total: 1 }, isLoading: false };
      render(<AgeGatePage />);
      await user.selectOptions(screen.getByLabelText("Status for leftpad-clone"), "rejected");
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: /confirm/i }));
      expect(lastMutate()).toHaveBeenCalledWith({ review: REVIEW, target: "rejected", why: "" });
    });

    it("requires a reason to reverse a recorded decision", async () => {
      const user = userEvent.setup();
      reviewsData = { data: { items: [APPROVED_REVIEW], total: 1 }, isLoading: false };
      render(<AgeGatePage />);
      await user.selectOptions(screen.getByLabelText("Status for leftpad-clone"), "pending");
      const dialog = await screen.findByRole("dialog");
      const confirm = within(dialog).getByRole("button", { name: /confirm/i });
      expect(confirm).toBeDisabled();
      await user.type(within(dialog).getByLabelText("Reason"), "   ");
      expect(confirm).toBeDisabled();
      await user.type(within(dialog).getByLabelText("Reason"), "approved the wrong package");
      expect(confirm).toBeEnabled();
      await user.click(confirm);
      expect(lastMutate()).toHaveBeenCalledWith({
        review: APPROVED_REVIEW,
        target: "pending",
        why: "approved the wrong package",
      });
    });

    it("says a decided-to-decided change is a single step that reverses the recorded decision", async () => {
      const user = userEvent.setup();
      reviewsData = { data: { items: [APPROVED_REVIEW], total: 1 }, isLoading: false };
      render(<AgeGatePage />);
      await user.selectOptions(screen.getByLabelText("Status for leftpad-clone"), "rejected");
      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByText(/reverses the recorded approved decision and marks the review rejected instead, in a single step/i),
      ).toBeInTheDocument();
      expect(within(dialog).queryByText(/two steps/i)).not.toBeInTheDocument();
    });

    it("clears the reason when the dialog is cancelled", async () => {
      const user = userEvent.setup();
      reviewsData = { data: { items: [REVIEW], total: 1 }, isLoading: false };
      render(<AgeGatePage />);
      const control = screen.getByLabelText("Status for leftpad-clone");
      await user.selectOptions(control, "approved");
      let dialog = await screen.findByRole("dialog");
      await user.type(within(dialog).getByLabelText("Reason"), "typed");
      await user.click(within(dialog).getByRole("button", { name: /cancel/i }));
      await user.selectOptions(control, "approved");
      dialog = await screen.findByRole("dialog");
      expect((within(dialog).getByLabelText("Reason") as HTMLTextAreaElement).value).toBe("");
    });
  });

  describe("backend without the reopen endpoint", () => {
    const optionsOf = (label: string) =>
      Object.fromEntries(
        Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((o) => [
          o.value,
          o.disabled,
        ]),
      );

    it("says nothing about the capability when the endpoint is there", () => {
      reviewsData = { data: { items: [APPROVED_REVIEW], total: 1 }, isLoading: false };
      render(<AgeGatePage />);
      expect(screen.queryByText(/does not support reopening/i)).not.toBeInTheDocument();
      expect(optionsOf("Status for leftpad-clone")).toEqual({
        pending: false,
        approved: false,
        rejected: false,
      });
    });

    it("explains the gap and offers no reopen-dependent transition on a decided review", () => {
      capability.reopenSupported = false;
      reviewsData = { data: { items: [APPROVED_REVIEW], total: 1 }, isLoading: false };
      render(<AgeGatePage />);
      expect(screen.getByText(/does not support reopening a decided review/i)).toBeInTheDocument();
      expect(optionsOf("Status for leftpad-clone")).toEqual({
        pending: true, // needs reopen
        approved: false, // the status it is already in
        rejected: true, // a backend without reopen also predates direct re-decide
      });
    });

    it("still offers approve and reject on a pending review", () => {
      capability.reopenSupported = false;
      reviewsData = { data: { items: [REVIEW], total: 1 }, isLoading: false };
      render(<AgeGatePage />);
      expect(optionsOf("Status for leftpad-clone")).toEqual({
        pending: false,
        approved: false,
        rejected: false,
      });
    });

    it("submits an approval normally even though reopen is unavailable", async () => {
      const user = userEvent.setup();
      capability.reopenSupported = false;
      reviewsData = { data: { items: [REVIEW], total: 1 }, isLoading: false };
      render(<AgeGatePage />);
      await user.selectOptions(screen.getByLabelText("Status for leftpad-clone"), "approved");
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: /confirm/i }));
      expect(lastMutate()).toHaveBeenCalledWith({ review: REVIEW, target: "approved", why: "" });
    });

    it("surfaces the capability message rather than a raw 404", () => {
      render(<AgeGatePage />);
      const [change] = mutationConfigs;
      change.onError?.(new ReopenUnsupportedError());
      expect(mockToastError).toHaveBeenCalledWith(
        "This server does not support reopening a decided age gate review.",
      );
      expect(mockInvalidate).not.toHaveBeenCalled();
    });
  });

  describe("mutation callbacks", () => {
    it("routes every transition through the composite status change", () => {
      render(<AgeGatePage />);
      const [change] = mutationConfigs;
      change.mutationFn({ review: APPROVED_REVIEW, target: "rejected", why: "cve landed" });
      expect(api.changeReviewStatus).toHaveBeenCalledWith(APPROVED_REVIEW, "rejected", "cve landed");
    });

    it("invalidates and toasts the completed transition on success", () => {
      render(<AgeGatePage />);
      const [change] = mutationConfigs;
      change.onSuccess?.(REVIEW, { review: REVIEW, target: "pending" });
      expect(mockInvalidate).toHaveBeenCalled();
      expect(mockToastSuccess).toHaveBeenCalledWith("Returned to pending leftpad-clone@0.0.1");
    });

    it("leaves the queue alone when a transition fails outright", () => {
      render(<AgeGatePage />);
      const [change] = mutationConfigs;
      // A transition is a single call now, so a failure means the review
      // never moved: no refetch, no reconcile, just the error.
      change.onError?.(new Error("API error 403: forbidden"), {
        review: APPROVED_REVIEW,
        target: "rejected",
        why: "cve landed",
      });
      expect(mockInvalidate).not.toHaveBeenCalled();
      expect(mockToastError).toHaveBeenCalledWith("API error 403: forbidden");
    });
  });

  describe("truncation notice", () => {
    it("warns when the server reports more reviews than the page fetched", () => {
      reviewsData = { data: { items: [REVIEW], total: 240 }, isLoading: false };
      render(<AgeGatePage />);
      expect(screen.getByText(/Showing first 1 of 240/)).toBeInTheDocument();
    });

    it("stays hidden when every matching review is on the page", () => {
      reviewsData = { data: { items: [REVIEW], total: 1 }, isLoading: false };
      render(<AgeGatePage />);
      expect(screen.queryByText(/Showing first/)).not.toBeInTheDocument();
    });
  });
});
