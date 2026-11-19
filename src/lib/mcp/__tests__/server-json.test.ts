import { describe, it, expect } from "vitest";
import {
  MCP_AK_RESOLVED_META_KEY,
  MCP_AK_SOURCE_META_KEY,
  MCP_OFFICIAL_META_KEY,
  type McpPackage,
  type McpServedEntry,
  type McpServerJson,
} from "@/types/mcp";
import {
  akSourceMeta,
  inputsOf,
  isPinnedVersion,
  isUnverifiedSource,
  isSafeHttpUrl,
  monogramOf,
  officialMeta,
  parseServedEntry,
  parseServerJson,
  parseServerList,
  parseStoredMetadata,
  resolvedMeta,
  runnerLabel,
  runnersOf,
  secretsOf,
  serverAlias,
  sourceKind,
  sourceKindOf,
  transportsOf,
} from "../server-json";

function server(overrides: Partial<McpServerJson> = {}): McpServerJson {
  return { name: "com.acme/weather", description: "Weather", version: "1.0.0", ...overrides };
}

function pkg(overrides: Partial<McpPackage> = {}): McpPackage {
  return { registryType: "npm", identifier: "@acme/weather", version: "1.0.0", transport: { type: "stdio" }, ...overrides };
}

function entryWithMeta(meta: Record<string, unknown> | undefined): McpServedEntry {
  return { server: server(), _meta: meta };
}

describe("parseServerJson", () => {
  it("passes unknown keys through at every level", () => {
    const raw = {
      ...server(),
      extraTop: 1,
      packages: [{ ...pkg(), extraPkg: true, transport: { type: "stdio", extraT: "t" } }],
      remotes: [{ type: "sse", url: "https://x", extraR: 2 }],
      repository: { url: "https://g", source: "github", extraRepo: "y" },
      icons: [{ src: "https://i", extraIcon: 3 }],
    };
    const parsed = parseServerJson(raw) as unknown as Record<string, unknown>;
    expect(parsed).not.toBeNull();
    expect(parsed.extraTop).toBe(1);
    const p = (parsed.packages as Record<string, unknown>[])[0];
    expect(p.extraPkg).toBe(true);
    expect((p.transport as Record<string, unknown>).extraT).toBe("t");
    expect((parsed.remotes as Record<string, unknown>[])[0].extraR).toBe(2);
    expect((parsed.repository as Record<string, unknown>).extraRepo).toBe("y");
    expect((parsed.icons as Record<string, unknown>[])[0].extraIcon).toBe(3);
  });

  it("parses nested input variables and rejects a mistyped one", () => {
    const header = { name: "Authorization", value: "Bearer {t}", variables: { t: { isSecret: true, extra: 1 } } };
    const ok = parseServerJson(server({ remotes: [{ type: "sse", headers: [header] }] }));
    expect(ok?.remotes?.[0].headers?.[0].variables?.t).toEqual({ isSecret: true, extra: 1 });
    const bad = { ...header, variables: { t: { isSecret: "yes" } } };
    expect(parseServerJson({ ...server(), remotes: [{ type: "sse", headers: [bad] }] })).toBeNull();
  });

  it("defaults description to an empty string", () => {
    expect(parseServerJson({ name: "a/b", version: "1" })?.description).toBe("");
  });

  it.each([
    ["null", null],
    ["a string", "server.json"],
    ["missing name", { version: "1", description: "" }],
    ["empty name", { name: "", version: "1" }],
    ["missing version", { name: "a/b" }],
    ["packages not an array", { name: "a/b", version: "1", packages: {} }],
  ])("rejects %s", (_label, raw) => {
    expect(parseServerJson(raw)).toBeNull();
  });
});

describe("parseServedEntry", () => {
  it("parses an entry and keeps _meta", () => {
    const e = parseServedEntry({ server: server(), _meta: { k: 1 } });
    expect(e?.server.name).toBe("com.acme/weather");
    expect(e?._meta).toEqual({ k: 1 });
  });

  it("rejects an entry without a valid server", () => {
    expect(parseServedEntry({ server: { name: "x" } })).toBeNull();
    expect(parseServedEntry(null)).toBeNull();
  });
});

describe("parseServerList", () => {
  it("drops malformed entries and counts them", () => {
    const r = parseServerList({
      servers: [{ server: server() }, { server: null }, "garbage"],
      metadata: { nextCursor: "c2", count: 10 },
    });
    expect(r.servers).toHaveLength(1);
    expect(r.dropped).toBe(2);
    expect(r.nextCursor).toBe("c2");
    expect(r.count).toBe(10);
  });

  it("defaults count to the parsed length and cursor to undefined", () => {
    const r = parseServerList({ servers: [{ server: server() }, { server: server({ version: "2" }) }] });
    expect(r.count).toBe(2);
    expect(r.nextCursor).toBeUndefined();
    expect(r.dropped).toBe(0);
  });

  it.each([null, "x", [], { servers: "no" }])("returns an empty page for %j", (raw) => {
    expect(parseServerList(raw)).toEqual({ servers: [], count: 0, dropped: 0 });
  });
});

describe("parseStoredMetadata", () => {
  it("returns null for non-objects and missing server", () => {
    expect(parseStoredMetadata(null)).toBeNull();
    expect(parseStoredMetadata("x")).toBeNull();
    expect(parseStoredMetadata({ registry: {} })).toBeNull();
  });

  it("defaults registry.status to active and packages to []", () => {
    const m = parseStoredMetadata({ server: server(), packages: "nope", schema: 5 });
    expect(m?.registry.status).toBe("active");
    expect(m?.packages).toEqual([]);
    expect(m?.schema).toBeUndefined();
    expect(m?.policy).toBeUndefined();
    expect(m?.index).toBeUndefined();
    expect(m?.bundles).toEqual([]);
    expect(m?.resolution).toBeUndefined();
  });

  it("drops a bundles or resolution of the wrong type", () => {
    const m = parseStoredMetadata({ server: server(), bundles: { index: 0 }, resolution: "resolving" });
    expect(m?.bundles).toEqual([]);
    expect(m?.resolution).toBeUndefined();
  });

  it("keeps the stored fields", () => {
    const pins = [{ index: 0, registryType: "npm", submitted: { identifier: "x" }, resolved: { repository: "r" } }];
    const bundles = [{ index: 1, fileSha256: "ab", signature: { state: "valid", signer: "acme" }, manifest: null }];
    const resolution = { state: "resolving", attempts: 1, pending: [{ index: 0, registryType: "npm", identifier: "x" }] };
    const m = parseStoredMetadata({
      schema: "v1",
      server: server(),
      registry: { status: "deprecated", statusMessage: "old" },
      policy: { package: "open" },
      packages: pins,
      index: { namespace: "com.acme" },
      bundles,
      resolution,
    });
    expect(m).toMatchObject({
      bundles,
      resolution,
      schema: "v1",
      registry: { status: "deprecated", statusMessage: "old" },
      policy: { package: "open" },
      packages: pins,
      index: { namespace: "com.acme" },
    });
  });
});

describe("officialMeta", () => {
  it.each([
    ["active", "active"],
    ["deprecated", "deprecated"],
    ["deleted", "deleted"],
    ["held", "active"],
    [undefined, "active"],
  ])("normalises status %j to %j", (status, expected) => {
    const m = officialMeta(entryWithMeta({ [MCP_OFFICIAL_META_KEY]: { status, isLatest: true } }));
    expect(m?.status).toBe(expected);
    expect(m?.isLatest).toBe(true);
  });

  it("is undefined when the meta is missing or not an object", () => {
    expect(officialMeta(entryWithMeta(undefined))).toBeUndefined();
    expect(officialMeta(entryWithMeta({ [MCP_OFFICIAL_META_KEY]: "x" }))).toBeUndefined();
    expect(officialMeta(entryWithMeta({ [MCP_OFFICIAL_META_KEY]: [1] }))).toBeUndefined();
  });
});

describe("akSourceMeta / resolvedMeta / sourceKind", () => {
  it("reads the AK source meta", () => {
    const e = entryWithMeta({ [MCP_AK_SOURCE_META_KEY]: { repository: "mcp-local", artifactId: "a1" } });
    expect(akSourceMeta(e)).toEqual({ repository: "mcp-local", artifactId: "a1" });
    expect(akSourceMeta(entryWithMeta(undefined))).toBeUndefined();
  });

  it("reads the resolved pin meta of a package", () => {
    expect(resolvedMeta(pkg({ _meta: { [MCP_AK_RESOLVED_META_KEY]: { digest: "sha256:1" } } }))).toEqual({
      digest: "sha256:1",
    });
    expect(resolvedMeta(pkg())).toBeUndefined();
  });

  it.each([
    ["no meta", undefined, "unknown"],
    ["hosted (no origin: a backend before Remotes)", { repository: "r" }, "hosted"],
    ["hosted origin", { repository: "r", origin: "hosted", upstreamVerified: false }, "hosted"],
    ["hosted ignores upstreamVerified", { repository: "r", origin: "hosted", upstreamVerified: true }, "hosted"],
    ["remote verified", { repository: "r", origin: "remote", kind: "upstream", upstreamVerified: true }, "remote-verified"],
    ["remote unverified", { repository: "r", origin: "remote", upstreamVerified: false }, "remote"],
    ["mirror verified", { repository: "r", origin: "mirror", upstreamVerified: true }, "mirror-verified"],
    ["mirror without upstreamVerified", { repository: "r", origin: "mirror" }, "mirror"],
    ["remote with a truthy non-boolean", { repository: "r", origin: "remote", upstreamVerified: "true" }, "remote"],
    ["an unknown origin", { repository: "r", origin: "upstream" }, "unknown"],
  ])("%s -> %s", (_label, src, expected) => {
    const e = entryWithMeta(src ? { [MCP_AK_SOURCE_META_KEY]: src } : undefined);
    expect(sourceKind(e)).toBe(expected);
  });
});

describe("sourceKindOf / isUnverifiedSource", () => {
  it("maps origin and upstreamVerified", () => {
    expect(sourceKindOf("hosted", false)).toBe("hosted");
    expect(sourceKindOf("remote", true)).toBe("remote-verified");
    expect(sourceKindOf("mirror", false)).toBe("mirror");
    expect(sourceKindOf(undefined, true)).toBe("unknown");
    expect(sourceKindOf(3, undefined)).toBe("unknown");
  });

  it.each([
    ["remote", true],
    ["mirror", true],
    ["remote-verified", false],
    ["mirror-verified", false],
    ["hosted", false],
    ["unknown", false],
    [undefined, false],
  ] as const)("%s -> %s", (kind, expected) => {
    expect(isUnverifiedSource(kind)).toBe(expected);
  });
});

describe("transportsOf", () => {
  it("dedups and labels package and remote transports", () => {
    const s = server({
      packages: [
        pkg(),
        pkg({ identifier: "other" }),
        pkg({ registryType: "pypi" }),
        pkg({ transport: { type: "streamable-http" } }),
        pkg({ registryType: "oci", transport: undefined as unknown as McpPackage["transport"] }),
      ],
      remotes: [
        { type: "streamable-http", url: "https://a" },
        { type: "streamable-http", url: "https://b" },
        { type: "sse", url: "https://c" },
      ],
    });
    expect(transportsOf(s)).toEqual([
      { key: "stdio:npm", label: "stdio·npm", kind: "package", local: true },
      { key: "stdio:pypi", label: "stdio·pypi", kind: "package", local: true },
      { key: "streamable-http:npm", label: "http·npm", kind: "package", local: true },
      { key: "stdio:oci", label: "stdio·oci", kind: "package", local: true },
      { key: "remote:streamable-http", label: "http", kind: "remote", local: false },
      { key: "remote:sse", label: "sse", kind: "remote", local: false },
    ]);
  });

  it("is empty for a server with neither", () => {
    expect(transportsOf(server())).toEqual([]);
  });
});

describe("inputsOf / secretsOf", () => {
  const withInputs = pkg({
    environmentVariables: [{ name: "API_KEY", isSecret: true }, { name: "REGION" }],
    runtimeArguments: [{ type: "named", name: "--token", isSecret: true }],
    packageArguments: [{ type: "positional", valueHint: "path" }],
    transport: { type: "streamable-http", headers: [{ name: "X-Auth", isSecret: true }] },
  });

  it("concatenates env, runtime args, package args and headers", () => {
    expect(inputsOf(withInputs).map((i) => i.name ?? i.valueHint)).toEqual([
      "API_KEY",
      "REGION",
      "--token",
      "path",
      "X-Auth",
    ]);
    expect(inputsOf(pkg({ transport: undefined as unknown as McpPackage["transport"] }))).toEqual([]);
  });

  it("collects distinct secret names from packages and remotes", () => {
    const s = server({
      packages: [withInputs, pkg({ environmentVariables: [{ name: "API_KEY", isSecret: true }] })],
      remotes: [
        { type: "sse", headers: [{ name: "Authorization", isSecret: true }, { name: "X-Plain" }] },
        { type: "sse" },
      ],
    });
    expect(secretsOf(s)).toEqual(["API_KEY", "--token", "X-Auth", "Authorization"]);
    expect(secretsOf(server({ packages: [pkg({ environmentVariables: [{ isSecret: true }] })] }))).toEqual([]);
  });
});

describe("runnersOf / runnerLabel", () => {
  it("lists packages then remotes with stable ids", () => {
    const s = server({ packages: [pkg()], remotes: [{ type: "sse", url: "https://r" }, { type: "streamable-http" }] });
    const runners = runnersOf(s);
    expect(runners.map((r) => r.id)).toEqual(["package-0", "remote-0", "remote-1"]);
    expect(runners.map(runnerLabel)).toEqual([
      "npm @acme/weather (stdio)",
      "remote sse https://r",
      "remote streamable-http",
    ]);
    expect(runnersOf(server())).toEqual([]);
  });

  it("defaults the package transport label to stdio", () => {
    const [r] = runnersOf(server({ packages: [pkg({ transport: undefined as unknown as McpPackage["transport"] })] }));
    expect(runnerLabel(r)).toBe("npm @acme/weather (stdio)");
  });
});

describe("isSafeHttpUrl", () => {
  it.each([
    ["https://example.com", true],
    ["http://example.com/x", true],
    ["javascript:alert(1)", false],
    ["data:text/html,hi", false],
    ["/relative/path", false],
    [null, false],
    [undefined, false],
  ])("%j -> %s", (url, expected) => {
    expect(isSafeHttpUrl(url)).toBe(expected);
  });
});

describe("monogramOf / serverAlias", () => {
  it.each([
    ["com.acme/weather", "W"],
    ["com.acme/_9lives", "9"],
    ["plain", "P"],
    ["com.acme/---", "?"],
  ])("monogram of %j is %j", (name, expected) => {
    expect(monogramOf(name)).toBe(expected);
  });

  it.each([
    ["com.acme/Weather Server", "weather-server"],
    ["com.acme/--x.y--", "x-y"],
    ["Plain_Name", "plain_name"],
    ["com.acme/!!!", "mcp-server"],
  ])("alias of %j is %j", (name, expected) => {
    expect(serverAlias(name)).toBe(expected);
  });
});

describe("isPinnedVersion", () => {
  it.each([
    ["1.2.3", true],
    ["1.2.3-beta.1", true],
    ["latest", false],
    ["^1", false],
    ["~1", false],
    ["1.x", false],
    ["1.X.0", false],
    ["x", false],
    ["*", false],
    [">=1", false],
    ["<2", false],
    ["1 || 2", false],
    ["", false],
    [undefined, false],
    [null, false],
  ])("%j -> %s", (v, expected) => {
    expect(isPinnedVersion(v)).toBe(expected);
  });
});
