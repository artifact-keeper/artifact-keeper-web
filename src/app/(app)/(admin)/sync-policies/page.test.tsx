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
let queryResponse: { data: unknown; isLoading?: boolean; isError?: boolean; error?: unknown } = {
  data: [],
  isLoading: false,
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryFn: () => unknown; enabled?: boolean }) => {
    if (opts.enabled !== false) {
      try {
        opts.queryFn();
      } catch {
        /* ignore */
      }
    }
    return { refetch: vi.fn(), isFetching: false, ...queryResponse };
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

const api = { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
vi.mock("@/lib/api/sync-policies", () => ({
  default: {
    list: (...a: unknown[]) => api.list(...a),
    create: (...a: unknown[]) => api.create(...a),
    update: (...a: unknown[]) => api.update(...a),
    remove: (...a: unknown[]) => api.remove(...a),
    toggle: (...a: unknown[]) => api.toggle(...a),
  },
  // real implementation so the filter->artifact_filter translation is exercised
  filterToArtifactFilter: (glob: string) => {
    const t = glob.trim();
    return t ? { include_paths: [t] } : {};
  },
}));

let isAdmin = true;
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ user: isAdmin ? { is_admin: true } : { is_admin: false } }),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children: React.ReactNode }) => {
    const items: Array<{ value: string; label: string }> = [];
    React.Children.forEach(children, (c) => {
      if (!React.isValidElement(c)) return;
      React.Children.forEach((c as React.ReactElement<{ children?: React.ReactNode }>).props.children, (s) => {
        if (React.isValidElement(s) && (s.props as Record<string, unknown>).value) {
          const p = s.props as { value: string; children: React.ReactNode };
          items.push({ value: p.value, label: String(p.children) });
        }
      });
    });
    return (
      <select aria-label="Mode" value={value} onChange={(e) => onValueChange?.(e.target.value)}>
        {items.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
      </select>
    );
  },
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange, "aria-label": al }: { checked?: boolean; onCheckedChange?: (v: boolean) => void; "aria-label"?: string }) => (
    <input type="checkbox" role="switch" aria-label={al} checked={!!checked} onChange={(e) => onCheckedChange?.(e.target.checked)} />
  ),
}));

import SyncPoliciesPage from "./page";

const POLICY = {
  id: "sp1",
  name: "mirror-releases",
  description: "release mirror",
  enabled: true,
  filter: "*.tar.gz",
  replication_mode: "mirror",
  priority: 100,
  precedence: 0,
  created_at: "x",
  updated_at: "y",
};

const saveMutate = () => mutateFns[mutateFns.length - 3];
const toggleMutate = () => mutateFns[mutateFns.length - 2];
const deleteMutate = () => mutateFns[mutateFns.length - 1];

beforeEach(() => {
  mutationConfigs.length = 0;
  mutateFns.length = 0;
  vi.clearAllMocks();
  isAdmin = true;
  queryResponse = { data: [], isLoading: false };
});
afterEach(() => cleanup());

describe("SyncPoliciesPage", () => {
  it("gates non-admins", () => {
    isAdmin = false;
    render(<SyncPoliciesPage />);
    expect(screen.getByText(/requires administrator access/i)).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    render(<SyncPoliciesPage />);
    expect(screen.getByText(/No sync policies yet/i)).toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    queryResponse = { data: undefined, isLoading: true };
    render(<SyncPoliciesPage />);
    expect(screen.queryByText(/No sync policies yet/i)).not.toBeInTheDocument();
  });

  it("shows an error state with retry", () => {
    queryResponse = { data: undefined, isLoading: false, isError: true, error: new Error("x") };
    render(<SyncPoliciesPage />);
    expect(screen.getByText(/Couldn't load sync policies/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("lists policies with mode + priority", () => {
    queryResponse = { data: [POLICY], isLoading: false };
    render(<SyncPoliciesPage />);
    expect(screen.getByText("mirror-releases")).toBeInTheDocument();
    expect(screen.getByText("mirror")).toBeInTheDocument();
    expect(screen.getByText(/priority 100/i)).toBeInTheDocument();
  });

  it("creates a policy", async () => {
    const user = userEvent.setup();
    render(<SyncPoliciesPage />);
    await user.click(screen.getByRole("button", { name: /new policy/i }));
    await user.type(screen.getByLabelText("Name"), "  push-all  ");
    await user.click(screen.getByRole("button", { name: /^Create$/i }));
    expect(saveMutate()).toHaveBeenCalledWith(
      expect.objectContaining({ id: null, form: expect.objectContaining({ name: "push-all" }) }),
    );
  });

  it("edits an existing policy (filter + name prefilled, update with id)", async () => {
    const user = userEvent.setup();
    queryResponse = { data: [POLICY], isLoading: false };
    render(<SyncPoliciesPage />);
    await user.click(screen.getByRole("button", { name: /Edit mirror-releases/i }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("mirror-releases");
    expect((screen.getByLabelText(/Filter glob/i) as HTMLInputElement).value).toBe("*.tar.gz");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    expect(saveMutate()).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sp1",
        form: expect.objectContaining({ name: "mirror-releases", filter: "*.tar.gz" }),
      }),
    );
  });

  it("clearing Priority yields undefined (not 0/NaN)", async () => {
    const user = userEvent.setup();
    render(<SyncPoliciesPage />);
    await user.click(screen.getByRole("button", { name: /new policy/i }));
    await user.type(screen.getByLabelText("Name"), "p");
    await user.clear(screen.getByLabelText("Priority"));
    await user.click(screen.getByRole("button", { name: /^Create$/i }));
    const arg = saveMutate().mock.calls[0][0] as { form: { priority?: number } };
    expect(arg.form.priority).toBeUndefined();
  });

  it("toggles enabled via the switch", async () => {
    const user = userEvent.setup();
    queryResponse = { data: [POLICY], isLoading: false };
    render(<SyncPoliciesPage />);
    await user.click(screen.getByRole("switch", { name: /Enable mirror-releases/i }));
    expect(toggleMutate()).toHaveBeenCalledWith({ id: "sp1", enabled: false });
  });

  it("deletes via the confirm dialog", async () => {
    const user = userEvent.setup();
    queryResponse = { data: [POLICY], isLoading: false };
    render(<SyncPoliciesPage />);
    await user.click(screen.getByRole("button", { name: /Delete mirror-releases/i }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /^Delete$/i }));
    expect(deleteMutate()).toHaveBeenCalledWith("sp1");
  });

  it("mutation callbacks invalidate, toast, and call the API", () => {
    render(<SyncPoliciesPage />);
    const [save, toggle, del] = mutationConfigs;
    save.mutationFn({ id: null, form: { name: "x", filter: "*.tgz" } });
    expect(api.create).toHaveBeenCalledWith({ name: "x", filter: "*.tgz" });
    // update must translate the glob filter into artifact_filter (UpdateSyncPolicyPayload has no `filter`)
    save.mutationFn({ id: "sp1", form: { name: "y", filter: "*.whl", replication_mode: "pull", priority: 5 } });
    expect(api.update).toHaveBeenCalledWith("sp1", {
      name: "y",
      description: undefined,
      replication_mode: "pull",
      priority: 5,
      artifact_filter: { include_paths: ["*.whl"] },
    });
    toggle.mutationFn({ id: "sp1", enabled: false });
    expect(api.toggle).toHaveBeenCalledWith("sp1", false);
    del.mutationFn("sp1");
    expect(api.remove).toHaveBeenCalledWith("sp1");
    save.onSuccess?.({}, { id: null });
    del.onSuccess?.();
    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalled();
  });
});
