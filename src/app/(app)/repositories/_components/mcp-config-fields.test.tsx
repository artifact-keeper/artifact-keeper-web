// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Repository } from "@/types";
import { MCP_OFFICIAL_NAMESPACE_GLOB } from "@/lib/mcp/format";
import {
  EMPTY_MCP_CONFIG,
  McpConfigFields,
  buildMcpCreateFields,
  mcpChangedFields,
  mcpConfigFromRepo,
  mcpKeysForRepoType,
  mcpVisibleKeys,
  seedMcpRemoteConfig,
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
    expect(mcpKeysForRepoType("local")).toContain("mcp_namespace_allow");
    expect(mcpKeysForRepoType("staging")).toContain("mcp_package_policy");
    expect(mcpKeysForRepoType("remote")).toContain("mcp_remote_posture");
    expect(mcpKeysForRepoType("virtual")).toEqual([]);
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
      mcp_require_namespace_grant: true,
    });
    expect(
      buildMcpCreateFields({ ...EMPTY_MCP_CONFIG, mcp_package_policy: "open", mcp_package_repos: { npm: "x" } }, "local"),
    ).toEqual({ mcp_package_policy: "open" });
    expect(buildMcpCreateFields(EMPTY_MCP_CONFIG, "remote")).toEqual({});
    expect(buildMcpCreateFields({ ...EMPTY_MCP_CONFIG, mcp_probe_remotes: "hosted_only" }, "remote")).toEqual({
      mcp_probe_remotes: "hosted_only",
    });
    expect(buildMcpCreateFields(EMPTY_MCP_CONFIG, "virtual")).toEqual({});
  });

  it("seeds the Remote wizard once, never over an operator's list", () => {
    expect(seedMcpRemoteConfig(EMPTY_MCP_CONFIG).auto_approve_namespaces).toEqual([MCP_OFFICIAL_NAMESPACE_GLOB]);
    const chosen = { ...EMPTY_MCP_CONFIG, auto_approve_namespaces: ["com.acme/*"] };
    expect(seedMcpRemoteConfig(chosen)).toBe(chosen);
  });

  it("validates glob patterns", () => {
    expect(validateMcpGlob("io.github.*/crypto-*")).toBeNull();
    expect(validateMcpGlob(" ")).toBe("Enter a pattern");
    expect(validateMcpGlob("a b")).toMatch(/wildcards/);
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
    await user.click(screen.getByRole("button", { name: "Add" }));
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
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
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
    expect(seen.value.auto_approve_namespaces).toEqual(["io.github.*/x"]);
    await user.click(preset);
    expect(seen.value.auto_approve_namespaces).toEqual(["io.github.*/x", MCP_OFFICIAL_NAMESPACE_GLOB]);
  });
});
