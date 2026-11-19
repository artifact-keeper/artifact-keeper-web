import { describe, it, expect } from "vitest";
import { mcpGlobSaveError, mcpSettingsBody, readMcpSettings } from "../mcp-settings";

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
      mcp_auto_approve_namespaces: ["io.github.modelcontextprotocol/*"],
      mcp_oci_floating_tag_policy: "hide",
      mcp_remote_mode: "mirror",
      mcp_probe_remotes: "hosted_only",
      mcp_probe_remotes_locked: false,
      mcp_require_oci_label: true,
      mcp_require_namespace_grant: true,
      mcp_sandbox_introspection: "on",
      mcp_require_bundle_signature: false,
      mcp_caller_can_lock: true,
    };
    expect(readMcpSettings(raw)).toEqual(raw);
  });

  it("ignores the pre-release auto_approve_namespaces spelling", () => {
    expect(readMcpSettings({ auto_approve_namespaces: ["x/*"] })).toEqual({});
  });

  it("drops unknown enum values", () => {
    expect(
      readMcpSettings({
        mcp_package_policy: "everything",
        mcp_remote_posture: 1,
        mcp_oci_floating_tag_policy: "float",
        mcp_probe_remotes: "sometimes",
        mcp_remote_mode: "everything",
        mcp_sandbox_introspection: true,
      }),
    ).toEqual({});
  });

  it("filters non-string list entries and rejects non-arrays", () => {
    expect(
      readMcpSettings({
        mcp_namespace_allow: ["com.acme", 3, null, "org.x"],
        mcp_server_deny: "com.evil/*",
        mcp_auto_approve_namespaces: [],
      }),
    ).toEqual({ mcp_namespace_allow: ["com.acme", "org.x"], mcp_auto_approve_namespaces: [] });
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
        mcp_require_oci_label: "yes",
        mcp_require_bundle_signature: null,
        mcp_require_namespace_grant: false,
        mcp_caller_can_lock: "true",
      }),
    ).toEqual({ mcp_require_namespace_grant: false });
    expect(readMcpSettings({ mcp_caller_can_lock: false })).toEqual({ mcp_caller_can_lock: false });
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

  it("sends the lock flags only when the caller set them", () => {
    expect(mcpSettingsBody({ mcp_remote_posture: "approval_required" })).not.toHaveProperty("mcp_remote_posture_locked");
    expect(mcpSettingsBody({ mcp_remote_posture_locked: true, mcp_probe_remotes_locked: false })).toEqual({
      mcp_remote_posture_locked: true,
      mcp_probe_remotes_locked: false,
    });
  });

  it("never sends the response-only mcp_caller_can_lock", () => {
    expect(mcpSettingsBody({ mcp_caller_can_lock: true, mcp_remote_mode: "mirror" })).toEqual({
      mcp_remote_mode: "mirror",
    });
  });

  it("passes every writable key through, including false", () => {
    const input = {
      mcp_package_policy: "open" as const,
      mcp_package_repos: { npm: "npm-local" },
      mcp_namespace_allow: ["com.acme"],
      mcp_server_deny: ["x/*"],
      mcp_remote_posture: "allow_with_gates" as const,
      mcp_remote_posture_locked: false,
      mcp_auto_approve_namespaces: ["y/*"],
      mcp_oci_floating_tag_policy: "pin" as const,
      mcp_remote_mode: "allowlist" as const,
      mcp_probe_remotes: "all" as const,
      mcp_probe_remotes_locked: true,
      mcp_require_oci_label: true,
      mcp_require_namespace_grant: false,
      mcp_sandbox_introspection: "off" as const,
      mcp_require_bundle_signature: true,
    };
    expect(mcpSettingsBody(input)).toEqual(input);
  });
});

describe("mcpGlobSaveError", () => {
  const BARE = "mcp_auto_approve_namespaces: `com.acme` matches no server name (patterns match the full name `namespace/name`); use `com.acme/*` for every server in the namespace";

  it("maps a 422 bare-namespace refusal to its setting", () => {
    expect(mcpGlobSaveError({ code: "UNPROCESSABLE_ENTITY", message: BARE })).toEqual({
      key: "mcp_auto_approve_namespaces",
      status: 422,
      message: BARE,
    });
    expect(mcpGlobSaveError({ status: 422, body: { message: ` ${BARE} ` } })).toMatchObject({ status: 422, message: BARE });
  });

  it("maps a 400 syntax refusal, from the status or the code", () => {
    expect(mcpGlobSaveError({ status: 400, message: "mcp_server_deny: `a b` is not a valid pattern" })).toMatchObject({
      key: "mcp_server_deny",
      status: 400,
    });
    expect(mcpGlobSaveError({ code: "VALIDATION_ERROR", error: "mcp_server_deny accepts at most 64 entries" })).toMatchObject({
      key: "mcp_server_deny",
      status: 400,
    });
  });

  it("ignores other errors", () => {
    expect(mcpGlobSaveError(undefined)).toBeNull();
    expect(mcpGlobSaveError("mcp_server_deny: x")).toBeNull();
    expect(mcpGlobSaveError({ status: 400, message: "name is required" })).toBeNull();
    expect(mcpGlobSaveError({ status: 400, message: "mcp_server_denylist: x" })).toBeNull();
    expect(mcpGlobSaveError({ status: 500, message: "mcp_server_deny: boom" })).toBeNull();
    expect(mcpGlobSaveError({ status: 422, message: "   " })).toBeNull();
  });
});
