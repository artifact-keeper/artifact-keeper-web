// @vitest-environment jsdom
import React from "react";
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
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
let rulesResponse: {
  data: unknown;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
} = { data: [], isLoading: false };
let reposData: unknown = { items: [] };

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: {
    queryKey: unknown[];
    queryFn: () => unknown;
    enabled?: boolean;
  }) => {
    const key = (opts.queryKey as string[])[0];
    if (key === "repositories") return { data: reposData };
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
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: vi.fn(),
  },
}));

const api = { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() };
vi.mock("@/lib/api/curation-rules", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/api/curation-rules")
  >("@/lib/api/curation-rules");
  return {
    ...actual,
    default: {
      list: (...a: unknown[]) => api.list(...a),
      get: (...a: unknown[]) => api.get(...a),
      create: (...a: unknown[]) => api.create(...a),
      update: (...a: unknown[]) => api.update(...a),
      remove: (...a: unknown[]) => api.remove(...a),
    },
  };
});
vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: { list: vi.fn() },
}));

// Native <select> stub for jsdom (project convention in this admin dir).
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
    React.Children.forEach(children, (c) => {
      if (!React.isValidElement(c)) return;
      const el = c as React.ReactElement<{
        "aria-label"?: string;
        children?: React.ReactNode;
      }>;
      if (el.props["aria-label"]) ariaLabel = el.props["aria-label"];
      React.Children.forEach(el.props.children, (s) => {
        if (
          React.isValidElement(s) &&
          (s.props as Record<string, unknown>).value
        ) {
          const p = s.props as { value: string; children: React.ReactNode };
          items.push({ value: p.value, label: String(p.children) });
        }
      });
    });
    return (
      <select
        aria-label={ariaLabel || undefined}
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
      >
        <option value="" />
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
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
    id,
  }: {
    checked?: boolean;
    onCheckedChange?: (v: boolean) => void;
    id?: string;
  }) => (
    <input
      type="checkbox"
      role="switch"
      id={id}
      checked={!!checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

import { CurationRulesManager, toRequest } from "./curation-rules-manager";

const PATTERN_RULE = {
  id: "r1",
  staging_repo_id: "repo1",
  package_pattern: "left-*",
  version_constraint: "*",
  architecture: "*",
  action: "block",
  priority: 50,
  reason: "known-bad",
  rule_type: "pattern",
  config: {},
  scope: "repository",
  enabled: true,
};
const POP_RULE = {
  id: "r2",
  staging_repo_id: null,
  package_pattern: "*",
  version_constraint: "*",
  architecture: "*",
  action: "flag",
  priority: 100,
  reason: null,
  rule_type: "popularity",
  config: {
    min_downloads: 500,
    typosquat_check: true,
    homoglyph_check: true,
    affix_check: true,
    affix_max_downloads: 2000,
    max_distance: 1,
    action: "block",
  },
  scope: "global",
  enabled: false,
};
const REPOS = {
  items: [{ id: "repo1", key: "staging-npm", repo_type: "staging" }],
};

const saveMutate = () => mutateFns[mutateFns.length - 2];
const deleteMutate = () => mutateFns[mutateFns.length - 1];

beforeEach(() => {
  mutationConfigs.length = 0;
  mutateFns.length = 0;
  vi.clearAllMocks();
  rulesResponse = { data: [], isLoading: false };
  reposData = { items: [] };
});
afterEach(() => cleanup());

describe("CurationRulesManager", () => {
  it("shows the empty state", () => {
    render(<CurationRulesManager />);
    expect(screen.getByText(/No curation rules yet/i)).toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    rulesResponse = { data: undefined, isLoading: true };
    render(<CurationRulesManager />);
    expect(screen.queryByText(/No curation rules yet/i)).not.toBeInTheDocument();
  });

  it("shows an error state with retry", () => {
    rulesResponse = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("x"),
    };
    render(<CurationRulesManager />);
    expect(
      screen.getByText(/Couldn't load curation rules/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("lists rules across engine types with resolved scope + action", () => {
    rulesResponse = { data: [PATTERN_RULE, POP_RULE], isLoading: false };
    reposData = REPOS;
    render(<CurationRulesManager />);
    // "Pattern" appears as both a column header and the pattern rule's type.
    expect(screen.getAllByText("Pattern").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Popularity")).toBeInTheDocument();
    expect(screen.getByText("left-*")).toBeInTheDocument();
    // repository-scoped rule resolves its repo key
    expect(screen.getByText("staging-npm")).toBeInTheDocument();
    // global-scoped rule shows "global"
    expect(screen.getByText("global")).toBeInTheDocument();
    // block action + disabled badge
    expect(screen.getByText("block")).toBeInTheDocument();
    expect(screen.getByText("disabled")).toBeInTheDocument();
  });

  it("creates a default pattern rule", async () => {
    const user = userEvent.setup();
    reposData = REPOS;
    render(<CurationRulesManager />);
    await user.click(screen.getByRole("button", { name: /new rule/i }));
    await user.click(screen.getByRole("button", { name: /^Create$/i }));
    expect(saveMutate()).toHaveBeenCalledWith(
      expect.objectContaining({
        id: null,
        form: expect.objectContaining({ rule_type: "pattern" }),
      }),
    );
  });

  it("switches the config sub-form to publisher-trust and requires publishers", async () => {
    const user = userEvent.setup();
    render(<CurationRulesManager />);
    await user.click(screen.getByRole("button", { name: /new rule/i }));
    await user.selectOptions(
      screen.getByLabelText("Rule type"),
      "publisher_trust",
    );
    // sub-form is revealed
    const publishers = screen.getByLabelText(/Trusted publishers/i);
    expect(publishers).toBeInTheDocument();
    // Create is disabled until a publisher is entered
    const create = screen.getByRole("button", { name: /^Create$/i });
    expect(create).toBeDisabled();
    await user.type(publishers, "github.com/acme");
    expect(create).toBeEnabled();
    await user.click(create);
    expect(saveMutate()).toHaveBeenCalledWith(
      expect.objectContaining({
        form: expect.objectContaining({
          rule_type: "publisher_trust",
          trusted_publishers: "github.com/acme",
        }),
      }),
    );
  });

  it("reveals homoglyph/affix fields only when the typo-squat toggle is on", async () => {
    const user = userEvent.setup();
    render(<CurationRulesManager />);
    await user.click(screen.getByRole("button", { name: /new rule/i }));
    await user.selectOptions(screen.getByLabelText("Rule type"), "popularity");
    // min_downloads is always visible for popularity
    expect(screen.getByLabelText(/Min downloads/i)).toBeInTheDocument();
    // typosquat defaults on -> nested checks visible
    expect(screen.getByLabelText(/Homoglyph check/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Max edit distance/i)).toBeInTheDocument();
    // toggle typosquat off -> nested checks hidden
    await user.click(screen.getByLabelText(/Typo-squat check/i));
    expect(screen.queryByLabelText(/Homoglyph check/i)).not.toBeInTheDocument();
    // affix_max_downloads only appears once affix check is on
    await user.click(screen.getByLabelText(/Typo-squat check/i)); // back on
    expect(
      screen.queryByLabelText(/Affix max downloads/i),
    ).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/^Affix check/i));
    expect(screen.getByLabelText(/Affix max downloads/i)).toBeInTheDocument();
  });

  it("round-trips an existing popularity rule into the edit form", async () => {
    const user = userEvent.setup();
    rulesResponse = { data: [POP_RULE], isLoading: false };
    render(<CurationRulesManager />);
    await user.click(
      screen.getByRole("button", { name: /Edit popularity rule/i }),
    );
    expect((screen.getByLabelText(/Min downloads/i) as HTMLInputElement).value).toBe(
      "500",
    );
    expect(
      (screen.getByLabelText(/Max edit distance/i) as HTMLInputElement).value,
    ).toBe("1");
    expect(
      (screen.getByLabelText(/Affix max downloads/i) as HTMLInputElement).value,
    ).toBe("2000");
    await user.click(screen.getByRole("button", { name: /^Save$/i }));
    expect(saveMutate()).toHaveBeenCalledWith(
      expect.objectContaining({ id: "r2" }),
    );
  });

  it("deletes via confirm", async () => {
    const user = userEvent.setup();
    rulesResponse = { data: [PATTERN_RULE], isLoading: false };
    reposData = REPOS;
    render(<CurationRulesManager />);
    await user.click(
      screen.getByRole("button", { name: /Delete pattern rule/i }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /^Delete$/i }));
    expect(deleteMutate()).toHaveBeenCalledWith("r1");
  });

  it("resolves an unknown repo id to the raw id in the scope badge", () => {
    rulesResponse = {
      data: [{ ...PATTERN_RULE, staging_repo_id: "ghost-repo" }],
      isLoading: false,
    };
    reposData = REPOS; // does not contain ghost-repo
    render(<CurationRulesManager />);
    expect(screen.getByText("ghost-repo")).toBeInTheDocument();
  });

  it("captures every common + popularity field on create", async () => {
    const user = userEvent.setup();
    render(<CurationRulesManager />);
    await user.click(screen.getByRole("button", { name: /new rule/i }));
    await user.selectOptions(screen.getByLabelText("Rule type"), "popularity");
    await user.selectOptions(screen.getByLabelText("Scope"), "global");

    const pattern = screen.getByLabelText("Package pattern");
    await user.clear(pattern);
    await user.type(pattern, "ex-*");
    const version = screen.getByLabelText("Version");
    await user.clear(version);
    await user.type(version, ">=1.0.0");
    const arch = screen.getByLabelText("Architecture");
    await user.clear(arch);
    await user.type(arch, "x86_64");
    await user.selectOptions(screen.getByLabelText("Action"), "block");
    // Number inputs carry a default and revert on clear, so drive them with a
    // single deterministic change event rather than clear+type.
    fireEvent.change(screen.getByLabelText("Priority"), {
      target: { value: "5" },
    });

    fireEvent.change(screen.getByLabelText(/Min downloads/i), {
      target: { value: "300" },
    });
    await user.selectOptions(screen.getByLabelText(/Flagged action/i), "block");
    fireEvent.change(screen.getByLabelText(/Max edit distance/i), {
      target: { value: "1" },
    });
    await user.click(screen.getByLabelText(/Homoglyph check/i));
    await user.click(screen.getByLabelText(/^Affix check/i));
    fireEvent.change(screen.getByLabelText(/Affix max downloads/i), {
      target: { value: "250" },
    });
    await user.type(screen.getByLabelText(/Popular packages/i), "react, vue");

    await user.type(screen.getByLabelText("Reason"), "squat guard");
    await user.click(screen.getByLabelText("Enabled")); // true -> false

    await user.click(screen.getByRole("button", { name: /^Create$/i }));
    const arg = saveMutate().mock.calls[0][0] as { form: Record<string, unknown> };
    expect(arg.form).toMatchObject({
      rule_type: "popularity",
      scope: "global",
      package_pattern: "ex-*",
      version_constraint: ">=1.0.0",
      architecture: "x86_64",
      action: "block",
      priority: 5,
      min_downloads: 300,
      pop_action: "block",
      max_distance: 1,
      homoglyph_check: true,
      affix_check: true,
      affix_max_downloads: 250,
      popular_packages: "react, vue",
      reason: "squat guard",
      enabled: false,
    });
  });

  it("captures publisher-trust match + untrusted action on create", async () => {
    const user = userEvent.setup();
    render(<CurationRulesManager />);
    await user.click(screen.getByRole("button", { name: /new rule/i }));
    await user.selectOptions(
      screen.getByLabelText("Rule type"),
      "publisher_trust",
    );
    await user.type(screen.getByLabelText(/Trusted publishers/i), "acme");
    await user.selectOptions(screen.getByLabelText("Match"), "signature");
    await user.selectOptions(
      screen.getByLabelText("Untrusted action"),
      "block",
    );
    await user.click(screen.getByRole("button", { name: /^Create$/i }));
    const arg = saveMutate().mock.calls[0][0] as { form: Record<string, unknown> };
    expect(arg.form).toMatchObject({
      rule_type: "publisher_trust",
      trusted_publishers: "acme",
      pt_match: "signature",
      pt_action: "block",
    });
  });

  it("round-trips a publisher-trust rule into the edit form", async () => {
    const user = userEvent.setup();
    rulesResponse = {
      data: [
        {
          ...PATTERN_RULE,
          id: "pt1",
          rule_type: "publisher_trust",
          config: {
            trusted_publishers: ["p1", "p2"],
            match: "namespace",
            action: "audit",
          },
        },
      ],
      isLoading: false,
    };
    reposData = REPOS;
    render(<CurationRulesManager />);
    await user.click(
      screen.getByRole("button", { name: /Edit publisher_trust rule/i }),
    );
    expect(
      (screen.getByLabelText(/Trusted publishers/i) as HTMLTextAreaElement)
        .value,
    ).toBe("p1, p2");
    expect((screen.getByLabelText("Untrusted action") as HTMLSelectElement).value).toBe(
      "audit",
    );
  });

  it("cancel closes the dialog without saving", async () => {
    const user = userEvent.setup();
    render(<CurationRulesManager />);
    await user.click(screen.getByRole("button", { name: /new rule/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(saveMutate()).not.toHaveBeenCalled();
  });

  it("mutation callbacks invalidate, toast, and reset (create/update/delete)", () => {
    render(<CurationRulesManager />);
    const [save, del] = mutationConfigs;
    save.onSuccess?.(undefined, { id: null });
    save.onSuccess?.(undefined, { id: "r1" });
    del.onSuccess?.();
    expect(mockInvalidate).toHaveBeenCalledTimes(3);
    expect(mockToastSuccess).toHaveBeenCalledWith("Rule created");
    expect(mockToastSuccess).toHaveBeenCalledWith("Rule updated");
    expect(mockToastSuccess).toHaveBeenCalledWith("Rule deleted");
  });

  it("save mutationFn dispatches create vs update against the api", () => {
    render(<CurationRulesManager />);
    const [save] = mutationConfigs;
    const baseForm = {
      rule_type: "popularity",
      scope: "global",
      staging_repo_id: "",
      package_pattern: "*",
      version_constraint: "*",
      architecture: "*",
      action: "flag",
      priority: 100,
      reason: "",
      enabled: true,
      trusted_publishers: "",
      pt_match: "attestation",
      pt_action: "flag",
      min_downloads: 1000,
      max_distance: 2,
      typosquat_check: true,
      homoglyph_check: false,
      affix_check: false,
      affix_max_downloads: 1000,
      pop_action: "block",
      popular_packages: "react, lodash",
    };
    save.mutationFn({ id: null, form: baseForm });
    expect(api.create).toHaveBeenCalledTimes(1);
    const createReq = api.create.mock.calls[0][0];
    expect(createReq.rule_type).toBe("popularity");
    expect(createReq.staging_repo_id).toBeNull();
    expect(createReq.config).toMatchObject({
      typosquat_check: true,
      action: "block",
      min_downloads: 1000,
      max_distance: 2,
      popular_packages: ["react", "lodash"],
    });
    save.mutationFn({ id: "r9", form: baseForm });
    expect(api.update).toHaveBeenCalledWith("r9", expect.any(Object));
  });
});

describe("toRequest config building", () => {
  const base = {
    rule_type: "pattern" as const,
    scope: "repository" as const,
    staging_repo_id: "repo1",
    package_pattern: "  left-* ",
    version_constraint: "",
    architecture: "*",
    action: "block",
    priority: 10,
    reason: "  bad  ",
    enabled: true,
    trusted_publishers: "",
    pt_match: "attestation",
    pt_action: "flag",
    min_downloads: undefined,
    max_distance: 2,
    typosquat_check: true,
    homoglyph_check: false,
    affix_check: false,
    affix_max_downloads: 1000,
    pop_action: "flag",
    popular_packages: "",
  };

  it("trims patterns, defaults blanks to *, trims reason, empty config for pattern", () => {
    const req = toRequest(base);
    expect(req.package_pattern).toBe("left-*");
    expect(req.version_constraint).toBe("*");
    expect(req.reason).toBe("bad");
    expect(req.config).toEqual({});
    expect(req.staging_repo_id).toBe("repo1");
  });

  it("nulls staging_repo_id when scope is global", () => {
    const req = toRequest({ ...base, scope: "global" });
    expect(req.staging_repo_id).toBeNull();
  });

  it("builds publisher_trust config with a parsed publisher list", () => {
    const req = toRequest({
      ...base,
      rule_type: "publisher_trust",
      trusted_publishers: "a, b\n b \nc",
      pt_match: "signature",
      pt_action: "block",
    });
    expect(req.config).toEqual({
      trusted_publishers: ["a", "b", "c"],
      match: "signature",
      action: "block",
    });
  });

  it("omits affix/homoglyph/distance from popularity config when typosquat is off", () => {
    const req = toRequest({
      ...base,
      rule_type: "popularity",
      typosquat_check: false,
      pop_action: "flag",
      min_downloads: 250,
    });
    expect(req.config).toEqual({
      typosquat_check: false,
      action: "flag",
      min_downloads: 250,
    });
  });

  it("includes affix_max_downloads only when affix_check is on", () => {
    const withAffix = toRequest({
      ...base,
      rule_type: "popularity",
      typosquat_check: true,
      affix_check: true,
      affix_max_downloads: 3000,
    });
    expect(withAffix.config).toMatchObject({
      max_distance: 2,
      homoglyph_check: false,
      affix_check: true,
      affix_max_downloads: 3000,
    });
    const withoutAffix = toRequest({
      ...base,
      rule_type: "popularity",
      typosquat_check: true,
      affix_check: false,
    });
    expect(withoutAffix.config).not.toHaveProperty("affix_max_downloads");
  });
});
