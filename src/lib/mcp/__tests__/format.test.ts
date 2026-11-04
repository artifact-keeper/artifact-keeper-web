import { describe, it, expect } from "vitest";
import type { FormatHandler } from "@/lib/api/format-handlers";
import type { Repository } from "@/types";
import {
  MCP_BACKABLE_REGISTRY_TYPES,
  MCP_BACKING_FORMATS,
  backendSupportsMcp,
  hasMcpConfig,
  isBroadNamespaceGlob,
  isHostedMcpRepo,
  isMcpFormat,
  isRemoteMcpRepo,
  mcpArtifactPath,
  mcpCreatableRepoTypes,
  mcpGlobMatches,
  mcpRegistryBaseUrl,
  mcpRepoTypeSupport,
  namespaceAdmits,
  splitServerName,
  validateNamespacePattern,
  validateNamespacePrefix,
} from "../format";
import { mcpKeys } from "../query-keys";

function handler(overrides: Partial<FormatHandler> = {}): FormatHandler {
  return {
    id: "h1",
    format_key: "mcp",
    display_name: "MCP",
    description: null,
    extensions: [],
    handler_type: "Core",
    is_enabled: true,
    priority: 0,
    plugin_id: null,
    capabilities: null,
    ...overrides,
  };
}

function repo(format: string, repo_type: string): Pick<Repository, "format" | "repo_type"> {
  return { format, repo_type } as Pick<Repository, "format" | "repo_type">;
}

describe("isMcpFormat / hasMcpConfig", () => {
  it("accepts only the mcp format", () => {
    expect(isMcpFormat("mcp")).toBe(true);
    expect(isMcpFormat("npm")).toBe(false);
    expect(isMcpFormat(null)).toBe(false);
    expect(isMcpFormat(undefined)).toBe(false);
    expect(hasMcpConfig("mcp")).toBe(true);
    expect(hasMcpConfig("docker")).toBe(false);
  });
});

describe("backendSupportsMcp", () => {
  it("is false while the handler list is loading", () => {
    expect(backendSupportsMcp(undefined)).toBe(false);
    expect(backendSupportsMcp(null)).toBe(false);
  });

  it("is false when the mcp handler is disabled or absent", () => {
    expect(backendSupportsMcp([handler({ is_enabled: false })])).toBe(false);
    expect(backendSupportsMcp([handler({ format_key: "npm" })])).toBe(false);
  });

  it("is true when an enabled mcp handler is listed", () => {
    expect(backendSupportsMcp([handler({ format_key: "npm" }), handler()])).toBe(true);
  });
});

describe("mcpRepoTypeSupport / mcpCreatableRepoTypes", () => {
  it("offers every type when the handler does not advertise repo_types", () => {
    expect(mcpRepoTypeSupport(undefined)).toEqual({ hosted: true, proxy: true });
    expect(mcpRepoTypeSupport([handler()])).toEqual({ hosted: true, proxy: true });
    expect(mcpRepoTypeSupport([handler({ capabilities: { other: 1 } })]).proxy).toBe(true);
    // Not a list: not an advertisement either.
    expect(mcpRepoTypeSupport([handler({ capabilities: { repo_types: "remote" } })]).proxy).toBe(true);
  });

  it("restricts to hosted only when repo_types is advertised without remote or virtual", () => {
    expect(mcpRepoTypeSupport([handler({ capabilities: { repo_types: ["local", "remote"] } })]).proxy).toBe(true);
    expect(mcpRepoTypeSupport([handler({ capabilities: { repo_types: ["virtual"] } })]).proxy).toBe(true);
    expect(mcpRepoTypeSupport([handler({ capabilities: { repo_types: ["local"] } })]).proxy).toBe(false);
    expect(mcpRepoTypeSupport([handler({ capabilities: { repo_types: [] } })]).proxy).toBe(false);
  });

  it("believes repository_types first, over capabilities.repo_types", () => {
    expect(mcpRepoTypeSupport([handler({ repository_types: ["local", "staging", "remote", "virtual"] })]).proxy).toBe(
      true,
    );
    expect(mcpRepoTypeSupport([handler({ repository_types: ["virtual"] })]).proxy).toBe(true);
    expect(mcpRepoTypeSupport([handler({ repository_types: ["local", "staging"] })]).proxy).toBe(false);
    expect(
      mcpRepoTypeSupport([
        handler({ repository_types: ["local"], capabilities: { repo_types: ["local", "remote"] } }),
      ]).proxy,
    ).toBe(false);
    expect(
      mcpRepoTypeSupport([handler({ repository_types: ["remote"], capabilities: { repo_types: ["local"] } })]).proxy,
    ).toBe(true);
  });

  it("ignores repository_types of another format", () => {
    expect(mcpRepoTypeSupport([handler({ format_key: "npm", repository_types: ["local"] })]).proxy).toBe(true);
  });

  it("offers proxy types only when supported", () => {
    expect(mcpCreatableRepoTypes({ hosted: true, proxy: false })).toEqual(["local", "staging"]);
    expect(mcpCreatableRepoTypes({ hosted: true, proxy: true })).toEqual(["local", "staging", "remote", "virtual"]);
  });
});

describe("mcpRegistryBaseUrl", () => {
  it("trims trailing slashes and encodes the key", () => {
    expect(mcpRegistryBaseUrl("https://ak.example//", "mcp-local")).toBe("https://ak.example/mcp/mcp-local");
    expect(mcpRegistryBaseUrl("https://ak.example", "a b/c")).toBe("https://ak.example/mcp/a%20b%2Fc");
  });
});

describe("isHostedMcpRepo / isRemoteMcpRepo", () => {
  it.each([
    ["mcp", "local", true, false],
    ["mcp", "staging", true, false],
    ["mcp", "remote", false, true],
    ["mcp", "virtual", false, false],
    ["npm", "local", false, false],
    ["npm", "remote", false, false],
  ])("%s/%s -> hosted=%s remote=%s", (format, type, hosted, remote) => {
    expect(isHostedMcpRepo(repo(format, type))).toBe(hosted);
    expect(isRemoteMcpRepo(repo(format, type))).toBe(remote);
  });
});

describe("MCP_BACKABLE_REGISTRY_TYPES", () => {
  it("lists every backing format key and excludes mcpb", () => {
    expect(MCP_BACKABLE_REGISTRY_TYPES).toEqual(Object.keys(MCP_BACKING_FORMATS));
    expect(MCP_BACKABLE_REGISTRY_TYPES).not.toContain("mcpb");
    expect(MCP_BACKABLE_REGISTRY_TYPES).toEqual(expect.arrayContaining(["npm", "pypi", "nuget", "cargo", "oci"]));
  });
});

describe("mcpArtifactPath / splitServerName", () => {
  it("builds the artifact path", () => {
    expect(mcpArtifactPath("com.acme/weather", "1.0.0")).toBe("servers/com.acme/weather/1.0.0/server.json");
  });

  it("splits on the first slash", () => {
    expect(splitServerName("com.acme/weather")).toEqual({ namespace: "com.acme", shortName: "weather" });
    expect(splitServerName("com.acme/a/b")).toEqual({ namespace: "com.acme", shortName: "a/b" });
    expect(splitServerName("noslash")).toEqual({ namespace: "", shortName: "noslash" });
  });
});

describe("namespaceAdmits", () => {
  it.each([
    ["com.acme", "com.acme/x", true],
    ["com.acme", "com.acme.team/x", true],
    [" com.acme ", "com.acme/x", true],
    ["com.acme", "com.acmecorp/x", false],
    ["com.acme", "org.other/x", false],
    ["", "com.acme/x", false],
    ["   ", "com.acme/x", false],
  ])("%j admits %j: %s", (prefix, name, expected) => {
    expect(namespaceAdmits(prefix, name)).toBe(expected);
  });
});

describe("mcpGlobMatches", () => {
  it.each([
    ["io.github.*", "io.github.foo/bar", true],
    ["com.acme/*", "com.acme/weather", true],
    ["com.acme/*", "xcom.acme/weather", false],
    // `?` is literal, as in the backend (there is no single-character wildcard).
    ["com.acme/weathe?", "com.acme/weather", false],
    ["com.acme/weathe?", "com.acme/weathe?", true],
    ["com.acme/weather", "com.acme/weather/extra", false],
    // `*` crosses `/`.
    ["com.*", "com.acme/weather", true],
    ["*/weather", "com.acme/team/weather", true],
    ["*", "anything/at/all", true],
    ["io.github.*/crypto-*", "io.github.x/y/crypto-z", true],
    ["a**b", "axyzb", true],
    ["*.typo/*", "com.typo/x", true],
    // ASCII case-insensitive, both ways.
    ["com.evil/*", "Com.Evil/x", true],
    ["COM.EVIL/X", "com.evil/x", true],
    // `.` is literal, not "any character".
    ["com.acme/x", "comXacme/x", false],
    ["a+b(c)/[d]$", "a+b(c)/[d]$", true],
    ["", "anything", false],
    ["  ", "anything", false],
    // The backend's own cases (mcp_settings.rs).
    ["com.evil/*", "com.evil/x", true],
    ["com.evil/*", "Com.Evil/X", true],
    ["*.typo/*", "io.github.typo/y", true],
    ["io.github.acme-*", "io.github.acme-labs", true],
    ["a/b", "a/b", true],
    ["a/b", "a/bc", false],
    ["com.evil/*", "com.evilx/y", false],
    ["***", "", true],
    // An empty pattern matches only the empty name, and nothing is trimmed.
    ["", "", true],
    [" a/b", "a/b", false],
    // Only ASCII letters fold.
    ["\u00c9/x", "\u00e9/x", false],
    ["\u00e9/*", "\u00e9/x", true],
    // A line break in a name is a character like any other.
    ["a*b", "a\nb", true],
  ])("%j vs %j -> %s", (glob, name, expected) => {
    expect(mcpGlobMatches(glob, name)).toBe(expected);
  });
});

describe("isBroadNamespaceGlob", () => {
  it.each([
    ["*", true],
    ["io.github.*", true],
    ["io.github.*/x", true],
    ["com.*/weather", true],
    ["com.acme/*", false],
    ["com.acme/weather", false],
    // `*` crosses `/`, so a wildcard anywhere in the namespace part (or a
    // glob without a slash) admits other publishers.
    ["com.acme*", true],
    ["io.github.acme-*", true],
    ["IO.GITHUB.*/x", true],
    ["com.acme/x*", false],
  ])("%j -> %s", (glob, expected) => {
    expect(isBroadNamespaceGlob(glob)).toBe(expected);
  });
});

describe("validateNamespacePrefix", () => {
  it.each([
    ["", "Enter a namespace"],
    ["   ", "Enter a namespace"],
    ["com.acme/x", "A namespace has no slash: enter com.acme, not com.acme/x"],
    ["com acme", "Use letters, digits, dots and hyphens only"],
    ["com_acme", "Use letters, digits, dots and hyphens only"],
    ["io.modelcontextprotocol", "The io.modelcontextprotocol namespace is reserved"],
    ["io.modelcontextprotocol.sub", "The io.modelcontextprotocol namespace is reserved"],
    ["io.modelcontextprotocolx", null],
    [" com.acme-1 ", null],
  ])("%j -> %j", (prefix, expected) => {
    expect(validateNamespacePrefix(prefix)).toBe(expected);
  });
});

describe("validateNamespacePattern", () => {
  it.each([
    ["", "Enter a namespace or pattern"],
    ["  ", "Enter a namespace or pattern"],
    ["a".repeat(201), "At most 200 characters"],
    ["a/b/c", "At most one slash"],
    ["io.github.{Owner}/*", "A {claim} is lowercase letters, digits and underscores"],
    ["io.github.{}/*", "A {claim} is lowercase letters, digits and underscores"],
    ["io.github.{repository_owner/*", "Unbalanced { }"],
    ["io.github.repository_owner}/*", "Unbalanced { }"],
    ["com acme", "Use letters, digits, dots, hyphens, underscores, *, / and {claim} only"],
    ["com.acme/x?", "Use letters, digits, dots, hyphens, underscores, *, / and {claim} only"],
    ["com.acme", null],
    [" com.acme/* ", null],
    ["*", null],
    ["io.github.{repository_owner}/*", null],
    ["io.github.{repository_owner}-{ref_1}/mcp_x", null],
    ["a".repeat(200), null],
  ])("%j -> %j", (pattern, expected) => {
    expect(validateNamespacePattern(pattern)).toBe(expected);
  });
});

describe("mcpKeys", () => {
  it("prefixes every key with mcp and defaults optional parts", () => {
    expect(mcpKeys.all).toEqual(["mcp"]);
    expect(mcpKeys.servers("r")).toEqual(["mcp", "servers", "r", {}]);
    expect(mcpKeys.servers("r", { q: 1 })).toEqual(["mcp", "servers", "r", { q: 1 }]);
    expect(mcpKeys.versions("r", "n")).toEqual(["mcp", "versions", "r", "n"]);
    expect(mcpKeys.version("r", "n", "1")).toEqual(["mcp", "version", "r", "n", "1"]);
    expect(mcpKeys.stored("r", "n", "1")).toEqual(["mcp", "stored", "r", "n", "1"]);
    expect(mcpKeys.reviews("r")).toEqual(["mcp", "reviews", "r", "all"]);
    expect(mcpKeys.reviews("r", "queue")).toEqual(["mcp", "reviews", "r", "queue"]);
    expect(mcpKeys.upstream("r")).toEqual(["mcp", "upstream", "r", {}]);
    expect(mcpKeys.holds("r", { a: 1 })).toEqual(["mcp", "holds", "r", { a: 1 }]);
    expect(mcpKeys.holds("r")).toEqual(["mcp", "holds", "r", {}]);
    expect(mcpKeys.pendingCount).toEqual(["mcp", "pending-count"]);
    expect(mcpKeys.capabilities("r", "n", "1")).toEqual(["mcp", "capabilities", "r", "n", "1"]);
    expect(mcpKeys.health("r", "n", "1")).toEqual(["mcp", "health", "r", "n", "1"]);
    expect(mcpKeys.grants("r")).toEqual(["mcp", "grants", "r"]);
    expect(mcpKeys.catalog()).toEqual(["mcp", "catalog", {}]);
    expect(mcpKeys.catalog({ s: "x" })).toEqual(["mcp", "catalog", { s: "x" }]);
  });
});
