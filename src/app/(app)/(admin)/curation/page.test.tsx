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
let reposData: unknown = { items: [] };
let packagesData: { data: unknown; isLoading?: boolean; isError?: boolean; error?: unknown } = {
  data: [],
  isLoading: false,
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[]; queryFn: () => unknown; enabled?: boolean }) => {
    const key = (opts.queryKey as string[])[0];
    if (key === "repositories-all") return { data: reposData };
    // curation packages
    if (opts.enabled !== false) {
      try {
        opts.queryFn();
      } catch {
        /* ignore */
      }
    }
    return { refetch: vi.fn(), isFetching: false, ...packagesData };
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
  listPackages: vi.fn(),
  approve: vi.fn(),
  block: vi.fn(),
  bulkApprove: vi.fn(),
  bulkBlock: vi.fn(),
  reEvaluate: vi.fn(),
};
vi.mock("@/lib/api/curation", () => ({
  default: {
    listPackages: (...a: unknown[]) => api.listPackages(...a),
    approve: (...a: unknown[]) => api.approve(...a),
    block: (...a: unknown[]) => api.block(...a),
    bulkApprove: (...a: unknown[]) => api.bulkApprove(...a),
    bulkBlock: (...a: unknown[]) => api.bulkBlock(...a),
    reEvaluate: (...a: unknown[]) => api.reEvaluate(...a),
  },
}));
vi.mock("@/lib/api/repositories", () => ({ repositoriesApi: { list: vi.fn() } }));

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
        <option value="" />
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

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange, "aria-label": al }: { checked?: boolean; onCheckedChange?: (v: boolean) => void; "aria-label"?: string }) => (
    <input type="checkbox" aria-label={al} checked={!!checked} onChange={(e) => onCheckedChange?.(e.target.checked)} />
  ),
}));

import CurationPage from "./page";

const PKG = {
  id: "p1",
  name: "left-pad",
  version: "1.3.0",
  format: "npm",
  repository_key: "staging-npm",
  description: null,
  size_bytes: 1024,
  download_count: 0,
  metadata: {},
  created_at: "x",
  updated_at: "y",
};
const STAGING = { items: [{ id: "r1", key: "staging-npm", repo_type: "staging" }, { id: "r2", key: "local", repo_type: "local" }] };

const approveMutate = () => mutateFns[mutateFns.length - 4];
const blockMutate = () => mutateFns[mutateFns.length - 3];
const bulkMutate = () => mutateFns[mutateFns.length - 2];
const reEvalMutate = () => mutateFns[mutateFns.length - 1];

beforeEach(() => {
  mutationConfigs.length = 0;
  mutateFns.length = 0;
  vi.clearAllMocks();
  isAdmin = true;
  reposData = { items: [] };
  packagesData = { data: [], isLoading: false };
});
afterEach(() => cleanup());

async function selectRepo(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText("Staging repository"), "r1");
}

describe("CurationPage", () => {
  it("gates non-admins", () => {
    isAdmin = false;
    render(<CurationPage />);
    expect(screen.getByText(/requires administrator access/i)).toBeInTheDocument();
  });

  it("prompts to pick a staging repo before loading", () => {
    render(<CurationPage />);
    expect(screen.getByText(/Select a staging repository to review/i)).toBeInTheDocument();
  });

  it("shows the empty queue after selecting a repo", async () => {
    const user = userEvent.setup();
    reposData = STAGING;
    render(<CurationPage />);
    await selectRepo(user);
    expect(screen.getByText(/No pending packages/i)).toBeInTheDocument();
    expect(api.listPackages).toHaveBeenCalledWith("r1", { status: "pending" });
  });

  it("shows an error state with retry", async () => {
    const user = userEvent.setup();
    reposData = STAGING;
    packagesData = { data: undefined, isLoading: false, isError: true, error: new Error("x") };
    render(<CurationPage />);
    await selectRepo(user);
    expect(screen.getByText(/Couldn't load the curation queue/i)).toBeInTheDocument();
  });

  it("lists packages and approves / blocks per row", async () => {
    const user = userEvent.setup();
    reposData = STAGING;
    packagesData = { data: [PKG], isLoading: false };
    render(<CurationPage />);
    await selectRepo(user);
    expect(screen.getByText("left-pad")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Approve left-pad/i }));
    expect(approveMutate()).toHaveBeenCalledWith("p1");
    await user.click(screen.getByRole("button", { name: /Block left-pad/i }));
    expect(blockMutate()).toHaveBeenCalledWith("p1");
  });

  it("bulk-approves selected packages with a reason", async () => {
    const user = userEvent.setup();
    reposData = STAGING;
    packagesData = { data: [PKG], isLoading: false };
    render(<CurationPage />);
    await selectRepo(user);
    await user.click(screen.getByLabelText("Select left-pad"));
    await user.click(screen.getByRole("button", { name: /^Approve$/i }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Reason"), "cve-free");
    await user.click(within(dialog).getByRole("button", { name: /confirm/i }));
    expect(bulkMutate()).toHaveBeenCalledWith({ action: "approve", ids: ["p1"], why: "cve-free" });
  });

  it("disables bulk Confirm until a non-blank reason is entered", async () => {
    const user = userEvent.setup();
    reposData = STAGING;
    packagesData = { data: [PKG], isLoading: false };
    render(<CurationPage />);
    await selectRepo(user);
    await user.click(screen.getByLabelText("Select left-pad"));
    await user.click(screen.getByRole("button", { name: /^Approve$/i }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: /confirm/i });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Reason"), "   ");
    expect(confirm).toBeDisabled(); // whitespace-only stays disabled
    await user.type(within(dialog).getByLabelText("Reason"), "ok");
    expect(confirm).toBeEnabled();
  });

  it("clears the reason when the bulk dialog is cancelled", async () => {
    const user = userEvent.setup();
    reposData = STAGING;
    packagesData = { data: [PKG], isLoading: false };
    render(<CurationPage />);
    await selectRepo(user);
    await user.click(screen.getByLabelText("Select left-pad"));
    await user.click(screen.getByRole("button", { name: /^Approve$/i }));
    let dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Reason"), "typed");
    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));
    // reopen — the field should be empty again
    await user.click(screen.getByRole("button", { name: /^Approve$/i }));
    dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("Reason") as HTMLInputElement).value).toBe("");
  });

  it("select-all selects every row", async () => {
    const user = userEvent.setup();
    reposData = STAGING;
    packagesData = { data: [PKG, { ...PKG, id: "p2", name: "right-pad" }], isLoading: false };
    render(<CurationPage />);
    await selectRepo(user);
    await user.click(screen.getByLabelText("Select all"));
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
  });

  it("hides the Approve action on the approved queue", async () => {
    const user = userEvent.setup();
    reposData = STAGING;
    packagesData = { data: [PKG], isLoading: false };
    render(<CurationPage />);
    await selectRepo(user);
    await user.selectOptions(screen.getByLabelText("Status filter"), "approved");
    expect(screen.queryByRole("button", { name: /Approve left-pad/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Block left-pad/i })).toBeInTheDocument();
  });

  it("re-evaluates the queue", async () => {
    const user = userEvent.setup();
    reposData = STAGING;
    render(<CurationPage />);
    await selectRepo(user);
    await user.click(screen.getByRole("button", { name: /Re-evaluate/i }));
    expect(reEvalMutate()).toHaveBeenCalled();
  });

  it("mutation callbacks invalidate, toast, and call the API", () => {
    render(<CurationPage />);
    const [approve, block, bulk, reEval] = mutationConfigs;
    approve.mutationFn("p1");
    block.mutationFn("p1");
    bulk.mutationFn({ action: "block", ids: ["p1"], why: "r" });
    reEval.mutationFn();
    expect(api.approve).toHaveBeenCalledWith("p1");
    expect(api.block).toHaveBeenCalledWith("p1");
    expect(api.bulkBlock).toHaveBeenCalledWith(["p1"], "r");
    expect(api.reEvaluate).toHaveBeenCalled();
    approve.onSuccess?.(PKG);
    bulk.onSuccess?.(2, { action: "approve" });
    reEval.onSuccess?.(3);
    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalled();
  });
});
