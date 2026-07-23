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
let checksResponse: { data: unknown; isLoading?: boolean; isError?: boolean; error?: unknown } = { data: [], isLoading: false };
let issuesData: unknown = [];

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[]; queryFn: () => unknown; enabled?: boolean }) => {
    const key = (opts.queryKey as string[])[0];
    if (key === "quality-check-issues") {
      if (opts.enabled !== false) {
        try {
          opts.queryFn();
        } catch {
          /* ignore */
        }
      }
      return { data: issuesData, isLoading: false };
    }
    if (opts.enabled !== false) {
      try {
        opts.queryFn();
      } catch {
        /* ignore */
      }
    }
    return { refetch: vi.fn(), isFetching: false, ...checksResponse };
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

const api = { list: vi.fn(), listIssues: vi.fn(), trigger: vi.fn(), suppressIssue: vi.fn(), unsuppressIssue: vi.fn() };
vi.mock("@/lib/api/quality-checks", () => ({
  default: {
    list: (...a: unknown[]) => api.list(...a),
    listIssues: (...a: unknown[]) => api.listIssues(...a),
    trigger: (...a: unknown[]) => api.trigger(...a),
    suppressIssue: (...a: unknown[]) => api.suppressIssue(...a),
    unsuppressIssue: (...a: unknown[]) => api.unsuppressIssue(...a),
  },
}));

let isAdmin = true;
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ user: isAdmin ? { is_admin: true } : { is_admin: false } }),
}));

import QualityChecksPage from "./page";

const CHECK = { id: "c1", artifact_id: "a1", repository_id: "r1", check_type: "metadata", passed: false, score: 70, issues_count: 2, critical_count: 1, high_count: 1, medium_count: 0, low_count: 0, info_count: 0, error_message: null, completed_at: "x", created_at: "y" };
const ISSUE = { id: "i1", check_result_id: "c1", category: "naming", severity: "high", title: "Bad name", description: "needs fix", location: "setup.py", is_suppressed: false, suppressed_reason: null, created_at: "y" };
const SUPPRESSED = { ...ISSUE, id: "i2", title: "Old dep", is_suppressed: true };

// mutation order: trigger, suppress, unsuppress
const triggerMutate = () => mutateFns[mutateFns.length - 3];
const suppressMutate = () => mutateFns[mutateFns.length - 2];
const unsuppressMutate = () => mutateFns[mutateFns.length - 1];

beforeEach(() => {
  mutationConfigs.length = 0;
  mutateFns.length = 0;
  vi.clearAllMocks();
  isAdmin = true;
  checksResponse = { data: [], isLoading: false };
  issuesData = [];
});
afterEach(() => cleanup());

describe("QualityChecksPage", () => {
  it("gates non-admins", () => {
    isAdmin = false;
    render(<QualityChecksPage />);
    expect(screen.getByText(/administrator access/i)).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    render(<QualityChecksPage />);
    expect(screen.getByText(/No quality-check results yet/i)).toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    checksResponse = { data: undefined, isLoading: true };
    render(<QualityChecksPage />);
    expect(screen.queryByText(/No quality-check results yet/i)).not.toBeInTheDocument();
  });

  it("shows an error state with retry", () => {
    checksResponse = { data: undefined, isLoading: false, isError: true, error: new Error("x") };
    render(<QualityChecksPage />);
    expect(screen.getByText(/Couldn't load quality checks/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("lists checks with failed badge + severity counts", () => {
    checksResponse = { data: [CHECK], isLoading: false };
    render(<QualityChecksPage />);
    expect(screen.getByText("metadata")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("1 critical")).toBeInTheDocument();
    expect(screen.getByText(/2 issues/)).toBeInTheDocument();
  });

  it("triggers checks", async () => {
    const user = userEvent.setup();
    render(<QualityChecksPage />);
    await user.click(screen.getByRole("button", { name: /run checks/i }));
    expect(triggerMutate()).toHaveBeenCalled();
  });

  it("opens the issues dialog and lists issues", async () => {
    const user = userEvent.setup();
    checksResponse = { data: [CHECK], isLoading: false };
    issuesData = [ISSUE];
    render(<QualityChecksPage />);
    await user.click(screen.getByRole("button", { name: /View issues for metadata/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Bad name")).toBeInTheDocument();
    expect(api.listIssues).toHaveBeenCalledWith("c1");
  });

  it("suppresses an issue with a reason", async () => {
    const user = userEvent.setup();
    checksResponse = { data: [CHECK], isLoading: false };
    issuesData = [ISSUE];
    render(<QualityChecksPage />);
    await user.click(screen.getByRole("button", { name: /View issues for metadata/i }));
    await user.click(await screen.findByRole("button", { name: /Suppress Bad name/i }));
    const reasonInput = await screen.findByLabelText("Reason");
    await user.type(reasonInput, "false positive");
    // the suppress confirm button is the one inside the reason dialog
    const dialogs = screen.getAllByRole("dialog");
    const reasonDialog = dialogs[dialogs.length - 1];
    await user.click(within(reasonDialog).getByRole("button", { name: /^Suppress$/i }));
    expect(suppressMutate()).toHaveBeenCalledWith({ id: "i1", reason: "false positive" });
  });

  it("un-suppresses a suppressed issue", async () => {
    const user = userEvent.setup();
    checksResponse = { data: [CHECK], isLoading: false };
    issuesData = [SUPPRESSED];
    render(<QualityChecksPage />);
    await user.click(screen.getByRole("button", { name: /View issues for metadata/i }));
    await user.click(await screen.findByRole("button", { name: /Un-suppress Old dep/i }));
    expect(unsuppressMutate()).toHaveBeenCalledWith("i2");
  });

  it("mutation callbacks invalidate, toast, and call the API", () => {
    render(<QualityChecksPage />);
    const [trigger, suppress, unsuppress] = mutationConfigs;
    trigger.mutationFn();
    expect(api.trigger).toHaveBeenCalledWith({});
    trigger.onSuccess?.({ queued: 3, message: "Queued 3" });
    suppress.mutationFn({ id: "i1", reason: "r" });
    expect(api.suppressIssue).toHaveBeenCalledWith("i1", "r");
    suppress.onSuccess?.();
    unsuppress.mutationFn("i1");
    expect(api.unsuppressIssue).toHaveBeenCalledWith("i1");
    unsuppress.onSuccess?.();
    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledTimes(3);
  });
});
