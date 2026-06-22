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
let rulesResponse: { data: unknown; isLoading?: boolean; isError?: boolean; error?: unknown } = { data: [], isLoading: false };
let reposData: unknown = { items: [] };

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[]; queryFn: () => unknown; enabled?: boolean }) => {
    const key = (opts.queryKey as string[])[0];
    if (key === "repositories-all") return { data: reposData };
    if (opts.enabled !== false) {
      try {
        opts.queryFn();
      } catch {
        /* ignore */
      }
    }
    return { refetch: vi.fn(), isFetching: false, ...rulesResponse };
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

const api = { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), evaluate: vi.fn() };
vi.mock("@/lib/api/promotion-rules", () => ({
  default: {
    list: (...a: unknown[]) => api.list(...a),
    create: (...a: unknown[]) => api.create(...a),
    update: (...a: unknown[]) => api.update(...a),
    remove: (...a: unknown[]) => api.remove(...a),
    evaluate: (...a: unknown[]) => api.evaluate(...a),
  },
}));
vi.mock("@/lib/api/repositories", () => ({ repositoriesApi: { list: vi.fn() } }));

let isAdmin = true;
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ user: isAdmin ? { is_admin: true } : { is_admin: false } }),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children: React.ReactNode }) => {
    const items: Array<{ value: string; label: string }> = [];
    let ariaLabel = "";
    React.Children.forEach(children, (c) => {
      if (!React.isValidElement(c)) return;
      const el = c as React.ReactElement<{ "aria-label"?: string; children?: React.ReactNode }>;
      if (el.props["aria-label"]) ariaLabel = el.props["aria-label"];
      React.Children.forEach(el.props.children, (s) => {
        if (React.isValidElement(s) && (s.props as Record<string, unknown>).value) {
          const p = s.props as { value: string; children: React.ReactNode };
          items.push({ value: p.value, label: String(p.children) });
        }
      });
    });
    return (
      <select aria-label={ariaLabel || undefined} value={value} onChange={(e) => onValueChange?.(e.target.value)}>
        <option value="" />
        {items.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
      </select>
    );
  },
  SelectTrigger: ({ children, ...p }: { children: React.ReactNode }) => <span {...p}>{children}</span>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange, id }: { checked?: boolean; onCheckedChange?: (v: boolean) => void; id?: string }) => (
    <input type="checkbox" role="switch" id={id} checked={!!checked} onChange={(e) => onCheckedChange?.(e.target.checked)} />
  ),
}));

import PromotionRulesPage from "./page";

const RULE = {
  id: "r1",
  name: "promote-stable",
  source_repo_id: "src",
  target_repo_id: "tgt",
  is_enabled: true,
  auto_promote: true,
  require_signature: false,
  allowed_licenses: [],
  max_cve_severity: "high",
  min_health_score: 80,
  min_staging_hours: null,
  max_artifact_age_days: null,
  created_at: "x",
  updated_at: "y",
};
const REPOS = { items: [{ id: "src", key: "staging-npm" }, { id: "tgt", key: "release-npm" }] };

const saveMutate = () => mutateFns[mutateFns.length - 3];
const deleteMutate = () => mutateFns[mutateFns.length - 2];
const evalMutate = () => mutateFns[mutateFns.length - 1];

beforeEach(() => {
  mutationConfigs.length = 0;
  mutateFns.length = 0;
  vi.clearAllMocks();
  isAdmin = true;
  rulesResponse = { data: [], isLoading: false };
  reposData = { items: [] };
});
afterEach(() => cleanup());

describe("PromotionRulesPage", () => {
  it("gates non-admins", () => {
    isAdmin = false;
    render(<PromotionRulesPage />);
    expect(screen.getByText(/requires administrator access/i)).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    render(<PromotionRulesPage />);
    expect(screen.getByText(/No promotion rules yet/i)).toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    rulesResponse = { data: undefined, isLoading: true };
    render(<PromotionRulesPage />);
    expect(screen.queryByText(/No promotion rules yet/i)).not.toBeInTheDocument();
  });

  it("shows an error state with retry", () => {
    rulesResponse = { data: undefined, isLoading: false, isError: true, error: new Error("x") };
    render(<PromotionRulesPage />);
    expect(screen.getByText(/Couldn't load promotion rules/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("lists rules with resolved repo keys and badges", () => {
    rulesResponse = { data: [RULE], isLoading: false };
    reposData = REPOS;
    render(<PromotionRulesPage />);
    expect(screen.getByText("promote-stable")).toBeInTheDocument();
    expect(screen.getByText("staging-npm")).toBeInTheDocument();
    expect(screen.getByText("release-npm")).toBeInTheDocument();
    expect(screen.getByText("auto-promote")).toBeInTheDocument();
  });

  it("creates a rule (name + source + target selected)", async () => {
    const user = userEvent.setup();
    reposData = REPOS;
    render(<PromotionRulesPage />);
    await user.click(screen.getByRole("button", { name: /new rule/i }));
    await user.type(screen.getByLabelText("Name"), "promote-x");
    await user.selectOptions(screen.getByLabelText("Source repository"), "src");
    await user.selectOptions(screen.getByLabelText("Target repository"), "tgt");
    await user.click(screen.getByRole("button", { name: /^Create$/i }));
    expect(saveMutate()).toHaveBeenCalledWith(
      expect.objectContaining({
        id: null,
        form: expect.objectContaining({ name: "promote-x", source_repo_id: "src", target_repo_id: "tgt" }),
      }),
    );
  });

  it("locks source/target when editing", async () => {
    const user = userEvent.setup();
    rulesResponse = { data: [RULE], isLoading: false };
    reposData = REPOS;
    render(<PromotionRulesPage />);
    await user.click(screen.getByRole("button", { name: /Edit promote-stable/i }));
    // source/target render as disabled inputs (not selects) in edit mode
    expect((screen.getByLabelText("Source (staging)") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Source (staging)") as HTMLInputElement).value).toBe("staging-npm");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    expect(saveMutate()).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }));
  });

  it("evaluates a rule", async () => {
    const user = userEvent.setup();
    rulesResponse = { data: [RULE], isLoading: false };
    reposData = REPOS;
    render(<PromotionRulesPage />);
    await user.click(screen.getByRole("button", { name: /Evaluate promote-stable/i }));
    expect(evalMutate()).toHaveBeenCalledWith("r1");
  });

  it("deletes via confirm", async () => {
    const user = userEvent.setup();
    rulesResponse = { data: [RULE], isLoading: false };
    reposData = REPOS;
    render(<PromotionRulesPage />);
    await user.click(screen.getByRole("button", { name: /Delete promote-stable/i }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /^Delete$/i }));
    expect(deleteMutate()).toHaveBeenCalledWith("r1");
  });

  it("mutation callbacks: create vs update (no source/target on update), evaluate toast", () => {
    render(<PromotionRulesPage />);
    const [save, del, evaluate] = mutationConfigs;
    save.mutationFn({ id: null, form: { name: " x ", source_repo_id: "s", target_repo_id: "t", auto_promote: true, require_signature: false, is_enabled: true, max_cve_severity: "any", min_health_score: undefined, min_staging_hours: undefined } });
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ name: "x", source_repo_id: "s", target_repo_id: "t", max_cve_severity: null }));
    save.mutationFn({ id: "r1", form: { name: "y", source_repo_id: "s", target_repo_id: "t", auto_promote: false, require_signature: true, is_enabled: true, max_cve_severity: "high", min_health_score: 90, min_staging_hours: 4 } });
    const updateArg = api.update.mock.calls[0][1] as Record<string, unknown>;
    expect(updateArg).not.toHaveProperty("source_repo_id");
    expect(updateArg).not.toHaveProperty("target_repo_id");
    expect(updateArg).toMatchObject({ name: "y", max_cve_severity: "high", min_health_score: 90 });
    del.mutationFn("r1");
    expect(api.remove).toHaveBeenCalledWith("r1");
    evaluate.onSuccess?.({ rule_name: "promote-stable", passed: 1, failed: 0, total: 1 });
    expect(mockToastSuccess).toHaveBeenCalled();
  });
});
