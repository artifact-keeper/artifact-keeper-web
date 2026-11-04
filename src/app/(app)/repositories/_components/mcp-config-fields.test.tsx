// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, renderHook, act, screen, cleanup, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Repository } from "@/types";
import { MCP_OFFICIAL_NAMESPACE_GLOB } from "@/lib/mcp/format";
import {
  EMPTY_MCP_CONFIG,
  McpConfigFields,
  buildMcpCreateFields,
  mcpCreateKeys,
  mcpChangedFields,
  mcpConfigFromRepo,
  mcpKeysForRepoType,
  mcpVisibleKeys,
  seedMcpRemoteConfig,
  useMcpSettingsForm,
  validateMcpGlob,
  type McpConfigFieldsProps,
  type McpConfigValue,
} from "./mcp-config-fields";

// Native <select> standing in for Radix Select; keeps `disabled`.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    disabled?: boolean;
    children: React.ReactNode;
  }) => {
    const items: { value: string; label: string }[] = [];
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      const content = child as React.ReactElement<{ children: React.ReactNode }>;
      React.Children.forEach(content.props.children, (item) => {
        if (React.isValidElement(item) && (item.props as { value?: string }).value) {
          const props = item.props as { value: string; children: React.ReactNode };
          items.push({ value: props.value, label: String(props.children) });
        }
      });
    });
    return (
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onValueChange?.(e.target.value)}
        data-testid="mock-select"
      >
        {items.map((i) => (
          <option key={i.value} value={i.value}>
            {i.label}
          </option>
        ))}
      </select>
    );
  },
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

afterEach(() => cleanup());

const repo = (over: Partial<Repository>): Repository =>
  ({ id: "r", key: "r", name: "r", format: "mcp", repo_type: "local", ...over }) as Repository;

const REPOS = [
  repo({ key: "npm-local", format: "npm" }),
  repo({ key: "yarn-remote", format: "yarn", repo_type: "remote" }),
  repo({ key: "docker-local", format: "docker" }),
  repo({ key: "maven-local", format: "maven" }),
];

/** Render the fields with real state, exposing the latest value. */
function renderFields(props: Partial<McpConfigFieldsProps> = {}, initial: McpConfigValue = EMPTY_MCP_CONFIG) {
  const seen: { value: McpConfigValue } = { value: initial };
  function Harness() {
    const [value, setValue] = useState(initial);
    seen.value = value;
    return (
      <McpConfigFields
        idPrefix="t"
        repoType="local"
        repositories={REPOS}
        {...props}
        value={value}
        onChange={setValue}
      />
    );
  }
  render(<Harness />);
  return seen;
}

describe("MCP config helpers", () => {
  it("maps repository types to their settings", () => {
    // The backend's applicability table (mcp_settings.rs `to_store` / `effective`).
    const hosted = [
      "mcp_namespace_allow",
      "mcp_package_policy",
      "mcp_package_repos",
      "mcp_server_deny",
      "mcp_require_oci_label",
      "mcp_require_namespace_grant",
      "mcp_probe_remotes",
      "mcp_probe_remotes_locked",
      "mcp_sandbox_introspection",
      "mcp_require_bundle_signature",
    ].sort();
    expect([...mcpKeysForRepoType("local")].sort()).toEqual(hosted);
    expect([...mcpKeysForRepoType("staging")].sort()).toEqual(hosted);
    expect([...mcpKeysForRepoType("remote")].sort()).toEqual(
      [
        "mcp_remote_posture",
        "mcp_remote_posture_locked",
        "mcp_remote_mode",
        "mcp_auto_approve_namespaces",
        "mcp_oci_floating_tag_policy",
        "mcp_server_deny",
        "mcp_require_oci_label",
        "mcp_require_namespace_grant",
        "mcp_probe_remotes",
        "mcp_probe_remotes_locked",
        "mcp_sandbox_introspection",
        "mcp_require_bundle_signature",
      ].sort(),
    );
    expect([...mcpKeysForRepoType("virtual")].sort()).toEqual(["mcp_require_oci_label", "mcp_server_deny"]);
    expect(mcpKeysForRepoType("other")).toEqual([]);
  });

  it("fills defaults for settings the repository does not carry", () => {
    const v = mcpConfigFromRepo({ mcp_namespace_allow: ["com.acme"], mcp_probe_remotes: "all" });
    expect(v.mcp_namespace_allow).toEqual(["com.acme"]);
    expect(v.mcp_probe_remotes).toBe("all");
    expect(v.mcp_package_policy).toBe("own-repos");
    expect(v.mcp_remote_posture).toBe("approval_required");
  });

  it("shows Phase 1 settings always and later ones only when reported", () => {
    expect([...mcpVisibleKeys(repo({}))].sort()).toEqual(
      ["mcp_namespace_allow", "mcp_package_policy", "mcp_package_repos"].sort(),
    );
    expect(mcpVisibleKeys(repo({ mcp_require_namespace_grant: false })).has("mcp_require_namespace_grant")).toBe(true);
    expect(mcpVisibleKeys(repo({ repo_type: "remote" })).size).toBe(0);
    const remote = mcpVisibleKeys(repo({ repo_type: "remote", mcp_remote_posture: "approval_required" }));
    expect([...remote]).toEqual(["mcp_remote_posture"]);
  });

  it("reports only changed keys, comparing backing maps without empty picks", () => {
    const base = mcpConfigFromRepo({ mcp_package_repos: { npm: "npm-local", oci: "docker-local" } });
    const keys = ["mcp_package_repos", "mcp_namespace_allow", "mcp_package_policy"] as const;
    expect(
      mcpChangedFields({ ...base, mcp_package_repos: { oci: "docker-local", npm: "npm-local", pypi: undefined } }, base, keys),
    ).toEqual({});
    expect(
      mcpChangedFields({ ...base, mcp_package_repos: { npm: undefined, oci: "docker-local" } }, base, keys),
    ).toEqual({ mcp_package_repos: { oci: "docker-local" } });
    expect(mcpChangedFields({ ...base, mcp_namespace_allow: ["com.acme"] }, base, keys)).toEqual({
      mcp_namespace_allow: ["com.acme"],
    });
    // A key outside the visible set is never sent.
    expect(mcpChangedFields({ ...base, mcp_probe_remotes: "all" }, base, keys)).toEqual({});
  });

  it("builds create fields per repository type", () => {
    expect(buildMcpCreateFields(EMPTY_MCP_CONFIG, "local")).toEqual({ mcp_package_policy: "own-repos" });
    expect(
      buildMcpCreateFields(
        {
          ...EMPTY_MCP_CONFIG,
          mcp_namespace_allow: ["com.acme"],
          mcp_package_repos: { npm: "npm-local", pypi: undefined },
          mcp_require_namespace_grant: true,
        },
        "staging",
      ),
    ).toEqual({
      mcp_package_policy: "own-repos",
      mcp_namespace_allow: ["com.acme"],
      mcp_package_repos: { npm: "npm-local" },
    });
    expect(mcpCreateKeys("local").has("mcp_require_namespace_grant")).toBe(false);
    expect(mcpCreateKeys("local").has("mcp_namespace_allow")).toBe(true);
    expect(
      buildMcpCreateFields({ ...EMPTY_MCP_CONFIG, mcp_package_policy: "open", mcp_package_repos: { npm: "x" } }, "local"),
    ).toEqual({ mcp_package_policy: "open" });
    expect(buildMcpCreateFields(EMPTY_MCP_CONFIG, "remote")).toEqual({});
    expect(buildMcpCreateFields({ ...EMPTY_MCP_CONFIG, mcp_probe_remotes: "hosted_only" }, "remote")).toEqual({
      mcp_probe_remotes: "hosted_only",
    });
    expect(buildMcpCreateFields(EMPTY_MCP_CONFIG, "virtual")).toEqual({});
    expect(
      buildMcpCreateFields(
        { ...EMPTY_MCP_CONFIG, mcp_server_deny: ["com.evil/*"], mcp_require_oci_label: true, mcp_probe_remotes: "all" },
        "virtual",
      ),
    ).toEqual({ mcp_server_deny: ["com.evil/*"], mcp_require_oci_label: true });
  });

  it("sends the later-phase settings only when changed and valid for the type", () => {
    const value: McpConfigValue = {
      ...EMPTY_MCP_CONFIG,
      mcp_remote_mode: "mirror",
      mcp_sandbox_introspection: "on",
      mcp_require_bundle_signature: true,
      mcp_require_oci_label: true,
    };
    expect(buildMcpCreateFields(value, "local")).toEqual({
      mcp_package_policy: "own-repos",
      mcp_sandbox_introspection: "on",
      mcp_require_bundle_signature: true,
      mcp_require_oci_label: true,
    });
    expect(buildMcpCreateFields(value, "remote")).toEqual({
      mcp_remote_mode: "mirror",
      mcp_sandbox_introspection: "on",
      mcp_require_bundle_signature: true,
      mcp_require_oci_label: true,
    });
  });

  it("sends a lock on create only for an instance administrator who set it", () => {
    const locked = { ...EMPTY_MCP_CONFIG, mcp_remote_posture_locked: true, mcp_probe_remotes_locked: true };
    expect(buildMcpCreateFields(locked, "remote")).toEqual({});
    expect(buildMcpCreateFields(locked, "remote", true)).toEqual({
      mcp_remote_posture_locked: true,
      mcp_probe_remotes_locked: true,
    });
    expect(buildMcpCreateFields(locked, "local", true)).toEqual({
      mcp_package_policy: "own-repos",
      mcp_probe_remotes_locked: true,
    });
    expect(buildMcpCreateFields(EMPTY_MCP_CONFIG, "remote", true)).toEqual({});
  });

  it("seeds the Remote wizard once, never over an operator's list", () => {
    expect(seedMcpRemoteConfig(EMPTY_MCP_CONFIG).mcp_auto_approve_namespaces).toEqual([MCP_OFFICIAL_NAMESPACE_GLOB]);
    const chosen = { ...EMPTY_MCP_CONFIG, mcp_auto_approve_namespaces: ["com.acme/*"] };
    expect(seedMcpRemoteConfig(chosen)).toBe(chosen);
  });

  it("validates glob patterns", () => {
    expect(validateMcpGlob("io.github.*/crypto-*")).toBeNull();
    expect(validateMcpGlob(" ")).toBe("Enter a pattern");
    expect(validateMcpGlob("a b")).toMatch(/\* wildcards/);
    // `?` is not part of the backend alphabet.
    expect(validateMcpGlob("com.acme/weathe?")).toMatch(/\* wildcards/);
    expect(validateMcpGlob("a".repeat(200))).toBeNull();
    expect(validateMcpGlob("a".repeat(201))).toBe("At most 200 characters");
  });
});

describe("McpConfigFields - hosted", () => {
  it("adds, rejects and removes namespace prefixes", async () => {
    const user = userEvent.setup();
    const seen = renderFields();
    const input = screen.getByLabelText("Namespace allowlist");
    expect(screen.getByText(/com\.acmecorp\/x/)).toBeTruthy();

    await user.type(input, "com.acme{Enter}");
    expect(seen.value.mcp_namespace_allow).toEqual(["com.acme"]);

    await user.type(input, "com.acme/x");
    await user.click(screen.getByRole("button", { name: "Add to Namespace allowlist" }));
    expect(screen.getByRole("alert").textContent).toMatch(/no slash/);

    await user.clear(input);
    await user.type(input, "io.modelcontextprotocol.x{Enter}");
    expect(screen.getByRole("alert").textContent).toMatch(/reserved/);

    await user.clear(input);
    await user.type(input, "com.acme{Enter}");
    expect(screen.getByRole("alert").textContent).toBe("Already in the list");

    await user.click(screen.getByRole("button", { name: "Remove com.acme" }));
    expect(seen.value.mcp_namespace_allow).toEqual([]);
  });

  it("lists only repositories whose format backs each registryType, plus none", () => {
    renderFields();
    const options = (type: string) =>
      Array.from(
        (within(screen.getByTestId(`mcp-backing-${type}`)).getByTestId("mock-select") as HTMLSelectElement).options,
      ).map((o) => o.textContent);
    expect(options("npm")).toEqual(["None", "npm-local (local)", "yarn-remote (remote)"]);
    expect(options("oci")).toEqual(["None", "docker-local (local)"]);
    expect(options("pypi")).toEqual(["None"]);
    expect(screen.getByText(/422 mcp_external_registry/)).toBeTruthy();
  });

  it("keeps a stored backing repository the list does not carry", () => {
    renderFields({}, { ...EMPTY_MCP_CONFIG, mcp_package_repos: { cargo: "cargo-hidden" } });
    const select = within(screen.getByTestId("mcp-backing-cargo")).getByTestId("mock-select") as HTMLSelectElement;
    expect(select.value).toBe("cargo-hidden");
  });

  it("picks and clears a backing repository", () => {
    const seen = renderFields();
    const select = within(screen.getByTestId("mcp-backing-npm")).getByTestId("mock-select");
    fireEvent.change(select, { target: { value: "npm-local" } });
    expect(seen.value.mcp_package_repos).toEqual({ npm: "npm-local" });
    fireEvent.change(select, { target: { value: "__none__" } });
    expect(seen.value.mcp_package_repos.npm).toBeUndefined();
  });

  it("hides the pickers and warns under the open policy", async () => {
    const user = userEvent.setup();
    const seen = renderFields();
    expect(screen.getByLabelText(/Own repositories/)).toHaveProperty("checked", true);
    expect(screen.getByText(/served with Artifact Keeper coordinates and gated/)).toBeTruthy();
    await user.click(screen.getByLabelText(/Open catalog: packages are not resolved or gated/));
    expect(seen.value.mcp_package_policy).toBe("open");
    expect(screen.queryByTestId("mcp-backing-npm")).toBeNull();
    expect(screen.getByRole("note").textContent).toMatch(/list of links/);
  });

  it("toggles the namespace-grant requirement and links to the grants", async () => {
    const user = userEvent.setup();
    const seen = renderFields({ repoKey: "mcp local" });
    await user.click(screen.getByLabelText("Require a namespace grant to publish"));
    expect(seen.value.mcp_require_namespace_grant).toBe(true);
    expect(screen.getByRole("link", { name: "Manage namespace grants" }).getAttribute("href")).toBe(
      "/permissions?mcp=mcp%20local",
    );
  });

  it("is read-only for users who cannot change settings", () => {
    renderFields({ readOnly: true }, { ...EMPTY_MCP_CONFIG, mcp_namespace_allow: ["com.acme"] });
    expect(screen.getByRole("list", { name: "Namespace allowlist entries" }).textContent).toBe("com.acme");
    expect(screen.queryByRole("button", { name: "Remove com.acme" })).toBeNull();
    expect(screen.queryAllByRole("button", { name: /^Add to / })).toHaveLength(0);
    expect((screen.getByLabelText(/Own repositories/) as HTMLInputElement).matches(":disabled")).toBe(true);
    expect(within(screen.getByTestId("mcp-backing-npm")).getByTestId("mock-select")).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Require a namespace grant to publish")).toHaveProperty("disabled", true);
  });

  it("renders only the visible settings", () => {
    renderFields({ visibleKeys: new Set(["mcp_namespace_allow"]) });
    expect(screen.getByLabelText("Namespace allowlist")).toBeTruthy();
    expect(screen.queryByText("Package policy")).toBeNull();
  });
});

describe("McpConfigFields - remote", () => {
  it("shows only the Remote settings for a Remote repository", () => {
    renderFields({ repoType: "remote" });
    expect(screen.queryByLabelText("Namespace allowlist")).toBeNull();
    expect(screen.getByText("Remote posture")).toBeTruthy();
    expect(screen.getByLabelText(/Deny by default/)).toHaveProperty("checked", true);
    expect(screen.getByLabelText("Deny")).toBeTruthy();
    expect(screen.getByText(/Deny always wins, even over approval/)).toBeTruthy();
    expect(screen.getByLabelText(/^Pin/)).toHaveProperty("checked", true);
    expect(screen.getByText(/never sends publisher-supplied headers/)).toBeTruthy();
  });

  it("changes posture, floating tags, probe and deny globs", async () => {
    const user = userEvent.setup();
    const seen = renderFields({ repoType: "remote" });
    await user.click(screen.getByLabelText(/Allow with gates/));
    await user.click(screen.getByLabelText(/^Hide/));
    fireEvent.change(within(screen.getByTestId("mcp-probe")).getByTestId("mock-select"), {
      target: { value: "hosted_only" },
    });
    await user.type(screen.getByLabelText("Deny"), "io.github.*/crypto-*{Enter}");
    expect(seen.value).toMatchObject({
      mcp_remote_posture: "allow_with_gates",
      mcp_oci_floating_tag_policy: "hide",
      mcp_probe_remotes: "hosted_only",
      mcp_server_deny: ["io.github.*/crypto-*"],
    });
  });

  it("disables locked settings and says why", () => {
    renderFields({ repoType: "remote", postureLocked: true, probeLocked: true });
    const locks = screen.getAllByTestId("mcp-lock-indicator");
    expect(locks).toHaveLength(2);
    expect(locks[0].getAttribute("aria-label")).toBe("Locked by an instance administrator");
    expect((screen.getByLabelText(/Allow with gates/) as HTMLInputElement).matches(":disabled")).toBe(true);
    expect(within(screen.getByTestId("mcp-probe")).getByTestId("mock-select")).toHaveProperty("disabled", true);
  });

  it("warns on a broad auto-approve glob and toggles the official preset", async () => {
    const user = userEvent.setup();
    const seen = renderFields({ repoType: "remote", offerOfficialPreset: true }, seedMcpRemoteConfig(EMPTY_MCP_CONFIG));
    const preset = screen.getByRole("checkbox", { name: /official reference servers/ });
    expect(preset).toHaveProperty("checked", true);
    expect(screen.queryByText("Broad")).toBeNull();

    await user.type(screen.getByLabelText("Auto-approve namespaces"), "io.github.*/x{Enter}");
    expect(screen.getByText("Broad")).toBeTruthy();

    await user.click(preset);
    expect(seen.value.mcp_auto_approve_namespaces).toEqual(["io.github.*/x"]);
    await user.click(preset);
    expect(seen.value.mcp_auto_approve_namespaces).toEqual(["io.github.*/x", MCP_OFFICIAL_NAMESPACE_GLOB]);
  });
});

describe("McpConfigFields - later-phase settings", () => {
  it("changes the sync scope, OCI label, sandbox and bundle signature", async () => {
    const user = userEvent.setup();
    const seen = renderFields({ repoType: "remote" });
    expect(screen.getByText("Sync scope")).toBeTruthy();
    expect(screen.getByLabelText(/^Allowlist: sync only the names that are approved/)).toHaveProperty("checked", true);
    await user.click(screen.getByLabelText(/^Mirror: sync every upstream name/));
    await user.click(screen.getByLabelText("Require the MCP name label on OCI images"));
    await user.click(screen.getByLabelText("Require signed MCPB bundles"));
    fireEvent.change(within(screen.getByTestId("mcp-sandbox")).getByTestId("mock-select"), {
      target: { value: "on" },
    });
    expect(seen.value).toMatchObject({
      mcp_remote_mode: "mirror",
      mcp_require_oci_label: true,
      mcp_require_bundle_signature: true,
      mcp_sandbox_introspection: "on",
    });
  });

  it("says where sandboxed runs happen", () => {
    renderFields();
    const note = within(screen.getByTestId("mcp-sandbox")).getByText(/isolated sandbox worker/);
    expect(note.textContent).toMatch(/install only from this instance/);
    expect(note.textContent).toMatch(/never run with real credentials/);
  });

  it("renders only the settings of the repository type", () => {
    renderFields({ repoType: "local" });
    expect(screen.queryByText("Sync scope")).toBeNull();
    expect(screen.queryByText("Remote posture")).toBeNull();
    expect(screen.getByLabelText("Require signed MCPB bundles")).toBeTruthy();
    cleanup();
    renderFields({ repoType: "virtual" });
    expect(screen.getByText(/policies live on each member/)).toBeTruthy();
    expect(screen.getByLabelText("Deny")).toBeTruthy();
    expect(screen.getByLabelText("Require the MCP name label on OCI images")).toBeTruthy();
    expect(screen.queryByTestId("mcp-sandbox")).toBeNull();
    expect(screen.queryByTestId("mcp-probe")).toBeNull();
    expect(screen.queryByLabelText("Require signed MCPB bundles")).toBeNull();
    expect(screen.queryByLabelText("Require a namespace grant to publish")).toBeNull();
  });

  it("disables every later-phase control when read-only", () => {
    renderFields({ repoType: "remote", readOnly: true });
    expect((screen.getByLabelText(/^Mirror/) as HTMLInputElement).matches(":disabled")).toBe(true);
    expect(screen.getByLabelText("Require the MCP name label on OCI images")).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Require signed MCPB bundles")).toHaveProperty("disabled", true);
    expect(within(screen.getByTestId("mcp-sandbox")).getByTestId("mock-select")).toHaveProperty("disabled", true);
  });
});

describe("McpConfigFields - instance locks", () => {
  it("offers no lock switch to anyone but an instance administrator", () => {
    renderFields({ repoType: "remote" });
    expect(screen.queryAllByLabelText("Lock for repository administrators")).toHaveLength(0);
  });

  it("lets an instance administrator lock posture and probe and still edit them", async () => {
    const user = userEvent.setup();
    const seen = renderFields({ repoType: "remote", canLock: true, postureLocked: true, probeLocked: true });
    const switches = screen.getAllByLabelText("Lock for repository administrators");
    expect(switches).toHaveLength(2);
    expect(screen.queryByTestId("mcp-lock-indicator")).toBeNull();
    expect((screen.getByLabelText(/Allow with gates/) as HTMLInputElement).matches(":disabled")).toBe(false);
    expect(within(screen.getByTestId("mcp-probe")).getByTestId("mock-select")).toHaveProperty("disabled", false);
    await user.click(switches[0]);
    expect(seen.value.mcp_remote_posture_locked).toBe(true);
    expect(seen.value.mcp_probe_remotes_locked).toBe(false);
    await user.click(switches[1]);
    expect(seen.value.mcp_probe_remotes_locked).toBe(true);
  });

  it("offers only the probe lock on a hosted repository", () => {
    renderFields({ repoType: "local", canLock: true });
    expect(screen.getAllByLabelText("Lock for repository administrators")).toHaveLength(1);
  });

  it("shows no lock switch for a lock the response does not report", () => {
    renderFields({ repoType: "remote", canLock: true, visibleKeys: new Set(["mcp_remote_posture"]) });
    expect(screen.queryAllByLabelText("Lock for repository administrators")).toHaveLength(0);
  });
});

describe("useMcpSettingsForm", () => {
  const remote = repo({
    repo_type: "remote",
    mcp_remote_posture: "approval_required",
    mcp_remote_posture_locked: false,
    mcp_probe_remotes: "off",
    mcp_probe_remotes_locked: true,
    mcp_remote_mode: "allowlist",
  });

  it("keeps the locks out of a non-administrator's form", () => {
    const { result } = renderHook(() => useMcpSettingsForm(remote));
    expect(result.current.visibleKeys.has("mcp_remote_posture_locked")).toBe(false);
    expect(result.current.visibleKeys.has("mcp_probe_remotes_locked")).toBe(false);
    act(() => result.current.onChange({ ...result.current.value, mcp_remote_posture_locked: true }));
    expect(result.current.changed).toBe(false);
  });

  it("sends a lock change for an instance administrator, and only when changed", () => {
    const { result } = renderHook(() => useMcpSettingsForm(remote, true));
    expect(result.current.visibleKeys.has("mcp_remote_posture_locked")).toBe(true);
    expect(result.current.changedFields).toEqual({});
    act(() =>
      result.current.onChange({ ...result.current.value, mcp_remote_posture_locked: true, mcp_remote_mode: "mirror" }),
    );
    expect(result.current.changedFields).toEqual({ mcp_remote_posture_locked: true, mcp_remote_mode: "mirror" });
    act(() => result.current.reset());
    expect(result.current.changed).toBe(false);
  });

  it("shows a later-phase setting only when the response reports it", () => {
    const { result } = renderHook(() => useMcpSettingsForm(repo({ mcp_sandbox_introspection: "off" })));
    expect(result.current.visibleKeys.has("mcp_sandbox_introspection")).toBe(true);
    expect(result.current.visibleKeys.has("mcp_require_bundle_signature")).toBe(false);
  });
});
