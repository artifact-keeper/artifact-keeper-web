import { describe, it, expect } from "vitest";
import { mcpSettingsBody, readMcpSettings } from "../mcp-settings";

describe("readMcpSettings", () => {
  it("returns {} for a non-MCP repository or nothing at all", () => {
    expect(readMcpSettings({ id: "r1", key: "npm-local", format: "npm" })).toEqual({});
    expect(readMcpSettings(null)).toEqual({});
    expect(readMcpSettings(undefined)).toEqual({});
  });

  it("reads every known field", () => {
    const raw = {
      mcp_package_policy: "open",
      mcp_package_repos: { npm: "npm-local", oci: "docker-local" },
      mcp_namespace_allow: ["com.acme"],
      mcp_server_deny: ["com.evil/*"],
      mcp_remote_posture: "allow_with_gates",
      mcp_remote_posture_locked: true,
      auto_approve_namespaces: ["io.github.modelcontextprotocol/*"],
      mcp_oci_floating_tag_policy: "hide",
      mcp_probe_remotes: "hosted_only",
      mcp_probe_remotes_locked: false,
      mcp_require_namespace_grant: true,
    };
    expect(readMcpSettings(raw)).toEqual(raw);
  });

  it("drops unknown enum values", () => {
    expect(
      readMcpSettings({
        mcp_package_policy: "everything",
        mcp_remote_posture: 1,
        mcp_oci_floating_tag_policy: "float",
        mcp_probe_remotes: "sometimes",
      }),
    ).toEqual({});
  });

  it("filters non-string list entries and rejects non-arrays", () => {
    expect(
      readMcpSettings({
        mcp_namespace_allow: ["com.acme", 3, null, "org.x"],
        mcp_server_deny: "com.evil/*",
        auto_approve_namespaces: [],
      }),
    ).toEqual({ mcp_namespace_allow: ["com.acme", "org.x"], auto_approve_namespaces: [] });
  });

  it("keeps only non-empty string values in the repo map", () => {
    expect(readMcpSettings({ mcp_package_repos: { npm: "npm-local", pypi: "", oci: 4, cargo: null } })).toEqual({
      mcp_package_repos: { npm: "npm-local" },
    });
  });

  it.each([[["npm-local"]], [null], ["npm-local"]])("rejects repo map %j", (v) => {
    expect(readMcpSettings({ mcp_package_repos: v })).toEqual({});
  });

  it("accepts booleans only for flags", () => {
    expect(
      readMcpSettings({
        mcp_remote_posture_locked: "true",
        mcp_probe_remotes_locked: 1,
        mcp_require_namespace_grant: false,
      }),
    ).toEqual({ mcp_require_namespace_grant: false });
  });
});

describe("mcpSettingsBody", () => {
  it("sends only the writable keys that are set", () => {
    expect(mcpSettingsBody({ mcp_package_policy: "own-repos", mcp_namespace_allow: [] })).toEqual({
      mcp_package_policy: "own-repos",
      mcp_namespace_allow: [],
    });
    expect(mcpSettingsBody({})).toEqual({});
  });

  it("never sends the locked flags", () => {
    const body = mcpSettingsBody({
      mcp_remote_posture: "approval_required",
      mcp_remote_posture_locked: true,
      mcp_probe_remotes: "off",
      mcp_probe_remotes_locked: true,
    });
    expect(body).toEqual({ mcp_remote_posture: "approval_required", mcp_probe_remotes: "off" });
    expect(body).not.toHaveProperty("mcp_remote_posture_locked");
    expect(body).not.toHaveProperty("mcp_probe_remotes_locked");
  });

  it("passes every writable key through, including false", () => {
    const input = {
      mcp_package_policy: "open" as const,
      mcp_package_repos: { npm: "npm-local" },
      mcp_namespace_allow: ["com.acme"],
      mcp_server_deny: ["x/*"],
      mcp_remote_posture: "allow_with_gates" as const,
      auto_approve_namespaces: ["y/*"],
      mcp_oci_floating_tag_policy: "pin" as const,
      mcp_probe_remotes: "all" as const,
      mcp_require_namespace_grant: false,
    };
    expect(mcpSettingsBody(input)).toEqual(input);
  });
});
