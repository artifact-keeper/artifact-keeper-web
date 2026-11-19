import { describe, it, expect } from "vitest";
import type { McpInput, McpPackage, McpServerJson, McpTransport } from "@/types/mcp";
import { runnersOf } from "../server-json";
import {
  MCP_CLIENTS,
  buildClientSnippets,
  claudeCodeOneLiner,
  packageCommand,
  placeholderName,
  shellQuote,
  type McpClientId,
  type McpSnippetContext,
  type McpSnippetResult,
} from "../client-configs";

const TYPED_SECRET = "typed-s3cr3t-value";

function server(overrides: Partial<McpServerJson> = {}): McpServerJson {
  return { name: "com.acme/weather", description: "", version: "1.0.0", ...overrides };
}

function pkg(overrides: Partial<McpPackage> = {}): McpPackage {
  return { registryType: "npm", identifier: "@acme/weather", version: "1.0.0", transport: { type: "stdio" }, ...overrides };
}

function remote(overrides: Partial<McpTransport> = {}): McpTransport {
  return { type: "streamable-http", url: "https://mcp.acme.dev/mcp", ...overrides };
}

/** Context for the first runner of a server built from one package or remote. */
function ctxOf(
  runner: { pkg: McpPackage } | { remote: McpTransport },
  extra: Partial<Omit<McpSnippetContext, "server" | "runner">> = {},
): McpSnippetContext {
  const s = "pkg" in runner ? server({ packages: [runner.pkg] }) : server({ remotes: [runner.remote] });
  return { server: s, runner: runnersOf(s)[0], ...extra };
}

function build(client: McpClientId, ctx: McpSnippetContext): McpSnippetResult {
  return buildClientSnippets(client, ctx);
}

function codeOf(r: McpSnippetResult): string {
  return r.snippets.map((s) => s.code).join("\n");
}

/** The parsed `.mcp.json` entry Claude Code writes for the server. */
function fileEntry(ctx: McpSnippetContext): { command?: string; args?: string[]; env?: Record<string, string> } {
  const file = build("claude-code", ctx).snippets.find((s) => s.id === "claude-code-file");
  const parsed = JSON.parse(file?.code ?? "{}") as { mcpServers: Record<string, never> };
  return parsed.mcpServers[ctx.alias ?? "weather"];
}

const ALL_CLIENTS = MCP_CLIENTS.map((c) => c.id);

const FILENAMES: Record<McpClientId, string | undefined> = {
  "claude-code": ".mcp.json",
  vscode: ".vscode/mcp.json",
  cursor: ".cursor/mcp.json",
  "claude-desktop": "claude_desktop_config.json",
  windsurf: "~/.codeium/windsurf/mcp_config.json",
  json: undefined,
};

const RUNNER_CASES: { type: string; pkg: McpPackage; fragments: string[] }[] = [
  { type: "npm", pkg: pkg(), fragments: ["npx", "-y", "@acme/weather@1.0.0"] },
  {
    type: "pypi",
    pkg: pkg({ registryType: "pypi", identifier: "acme-weather" }),
    fragments: ["uvx", "acme-weather==1.0.0"],
  },
  {
    type: "oci",
    pkg: pkg({ registryType: "oci", identifier: "ghcr.io/acme/weather:1.0.0", version: "1.0.0" }),
    fragments: ["docker", "run", "-i", "--rm", "ghcr.io/acme/weather:1.0.0"],
  },
  {
    type: "nuget",
    pkg: pkg({ registryType: "nuget", identifier: "Acme.Weather" }),
    fragments: ["dnx", "Acme.Weather@1.0.0", "--yes"],
  },
  { type: "cargo", pkg: pkg({ registryType: "cargo", identifier: "acme-weather" }), fragments: ["acme-weather"] },
  {
    type: "unknown",
    pkg: pkg({ registryType: "gem", identifier: "acme-weather" }),
    fragments: ["acme-weather"],
  },
];

describe("MCP_CLIENTS", () => {
  it("lists the six clients in order", () => {
    expect(ALL_CLIENTS).toEqual(["claude-code", "vscode", "cursor", "claude-desktop", "windsurf", "json"]);
  });
});

describe("client x package runner matrix", () => {
  const matrix = ALL_CLIENTS.flatMap((client) => RUNNER_CASES.map((rc) => ({ client, ...rc })));

  it.each(matrix)("$client / $type", ({ client, pkg: p, fragments }) => {
    const r = build(client, ctxOf({ pkg: p }));
    const code = codeOf(r);
    for (const f of fragments) expect(code).toContain(f);
    const filename = FILENAMES[client];
    if (filename) expect(r.snippets.map((s) => s.filename)).toContain(filename);
    expect(r.secrets).toEqual([]);
  });

  it("emits the Claude Code command line for npm", () => {
    const cli = build("claude-code", ctxOf({ pkg: pkg() })).snippets[0];
    expect(cli.id).toBe("claude-code-cli");
    expect(cli.language).toBe("bash");
    expect(cli.code).toBe("claude mcp add weather \\\n  -- npx -y @acme/weather@1.0.0");
  });

  it("uses the vscode stdio shape", () => {
    const file = JSON.parse(build("vscode", ctxOf({ pkg: pkg() })).snippets[0].code);
    expect(file).toEqual({ servers: { weather: { type: "stdio", command: "npx", args: ["-y", "@acme/weather@1.0.0"] } } });
  });

  it("serves the oci identifier verbatim even when pinned", () => {
    const p = pkg({ registryType: "oci", identifier: "ghcr.io/acme/w@sha256:abc", version: "2.0.0" });
    expect(fileEntry(ctxOf({ pkg: p })).args).toEqual(["run", "-i", "--rm", "ghcr.io/acme/w@sha256:abc"]);
  });

  it("passes oci env vars by name on argv", () => {
    const p = pkg({ registryType: "oci", identifier: "img", environmentVariables: [{ name: "REGION", default: "eu" }] });
    const e = fileEntry(ctxOf({ pkg: p }));
    expect(e.args).toEqual(["run", "-i", "--rm", "-e", "REGION", "img"]);
    expect(e.env).toEqual({ REGION: "eu" });
  });

  it("flags an unknown registry type with a note", () => {
    const r = build("claude-code", ctxOf({ pkg: pkg({ registryType: "gem", identifier: "x" }) }));
    expect(r.snippets[0].note).toBe('Unknown registry type "gem"; check the command before use.');
  });

  it("carries the cargo install note into each client", () => {
    const ctx = ctxOf({ pkg: pkg({ registryType: "cargo", identifier: "acme-weather" }) });
    const note = "Install the binary first: cargo install acme-weather --version 1.0.0";
    expect(build("claude-code", ctx).snippets[0].note).toBe(note);
    expect(build("vscode", ctx).snippets[0].note).toBe(note);
    expect(build("cursor", ctx).snippets[0].note).toBe(note);
    expect(build("windsurf", ctx).snippets[0].note).toBe(note);
    expect(build("claude-desktop", ctx).snippets[0].note).toBe(note);
  });
});

describe("mcpb bundles", () => {
  const ctx = ctxOf({ pkg: pkg({ registryType: "mcpb", identifier: "https://ak/b/weather.mcpb" }) });

  it("claude-desktop returns the bundle snippet", () => {
    const [s] = build("claude-desktop", ctx).snippets;
    expect(s.id).toBe("claude-desktop-bundle");
    expect(s.code).toContain("open https://ak/b/weather.mcpb");
  });

  it.each(["claude-code", "vscode", "cursor", "windsurf"] as McpClientId[])("%s returns no snippet", (client) => {
    expect(build(client, ctx).snippets).toEqual([]);
  });

  it("json returns only the served entry", () => {
    expect(build("json", ctx).snippets.map((s) => s.id)).toEqual(["json-entry"]);
  });

  it("has no Claude Code one-liner", () => {
    expect(claudeCodeOneLiner(ctx)).toBe("");
  });

  it("explains the bundle in packageCommand", () => {
    const cmd = packageCommand(ctx.runner.kind === "package" ? ctx.runner.pkg : pkg(), {}, (n) => n, new Set());
    expect(cmd.command).toBe("");
    expect(cmd.note).toContain(".mcpb");
  });
});

describe("remote runners", () => {
  it.each([
    ["streamable-http", "http"],
    ["sse", "sse"],
  ])("Claude Code maps %s to --transport %s", (type, flag) => {
    const r = build("claude-code", ctxOf({ remote: remote({ type }) }));
    expect(r.snippets[0].code).toBe(`claude mcp add --transport ${flag} weather https://mcp.acme.dev/mcp`);
    expect(JSON.parse(r.snippets[1].code).mcpServers.weather).toEqual({ type: flag, url: "https://mcp.acme.dev/mcp" });
  });

  it("uses each client's remote shape", () => {
    const ctx = ctxOf({ remote: remote({ type: "sse" }) });
    expect(JSON.parse(build("vscode", ctx).snippets[0].code)).toEqual({
      servers: { weather: { type: "sse", url: "https://mcp.acme.dev/mcp" } },
    });
    expect(JSON.parse(build("cursor", ctx).snippets[0].code).mcpServers.weather).toEqual({
      url: "https://mcp.acme.dev/mcp",
    });
    expect(JSON.parse(build("windsurf", ctx).snippets[0].code).mcpServers.weather).toEqual({
      serverUrl: "https://mcp.acme.dev/mcp",
    });
    expect(JSON.parse(build("claude-desktop", ctx).snippets[0].code).mcpServers.weather).toEqual({
      command: "npx",
      args: ["-y", "mcp-remote", "https://mcp.acme.dev/mcp"],
    });
    const json = build("json", ctx).snippets;
    expect(json.map((s) => s.label)).toEqual(["server.json remote", "mcpServers"]);
  });

  it("quotes an empty remote url", () => {
    const ctx = ctxOf({ remote: remote({ url: undefined }) });
    expect(build("claude-code", ctx).snippets[0].code).toBe("claude mcp add --transport http weather ''");
    expect(JSON.parse(build("claude-desktop", ctx).snippets[0].code).mcpServers.weather.args).toEqual([
      "-y",
      "mcp-remote",
      "",
    ]);
  });

  it("inlines non-secret headers and skips unnamed or valueless ones", () => {
    const headers: McpInput[] = [{ name: "X-Region", default: "eu" }, { value: "x" }, { name: "X-Opt" }];
    const r = build("claude-code", ctxOf({ remote: remote({ headers }) }));
    expect(r.snippets[0].code).toContain("--header 'X-Region: eu'");
    expect(JSON.parse(r.snippets[1].code).mcpServers.weather.headers).toEqual({ "X-Region": "eu" });
  });

  it("names the generic json package entry", () => {
    expect(build("json", ctxOf({ pkg: pkg() })).snippets[0].label).toBe("server.json package");
  });
});

// ---------------------------------------------------------------------------
// Secrets are never inlined
// ---------------------------------------------------------------------------

function placeholderFor(client: McpClientId, name: string): string {
  switch (client) {
    case "vscode":
      return `\${input:${name.toLowerCase().replace(/_/g, "-")}}`;
    case "cursor":
    case "windsurf":
      return `\${env:${name}}`;
    case "claude-desktop":
      return `<SET_LOCALLY:${name}>`;
    default:
      return `\${${name}}`;
  }
}

const SECRET_CASES: { kind: string; ctx: McpSnippetContext; secret: string }[] = [
  {
    kind: "env var",
    secret: "API_KEY",
    ctx: ctxOf(
      { pkg: pkg({ environmentVariables: [{ name: "API_KEY", isSecret: true }] }) },
      { values: { API_KEY: TYPED_SECRET } },
    ),
  },
  {
    kind: "header",
    secret: "X_API_KEY",
    ctx: ctxOf(
      { remote: remote({ headers: [{ name: "X-Api-Key", isSecret: true }] }) },
      { values: { "X-Api-Key": TYPED_SECRET } },
    ),
  },
  {
    kind: "variable inside a fixed value",
    secret: "TOKEN",
    ctx: ctxOf(
      {
        remote: remote({
          headers: [{ name: "Authorization", value: "Bearer {token}", variables: { token: { isSecret: true } } }],
        }),
      },
      { values: { token: TYPED_SECRET, Authorization: TYPED_SECRET } },
    ),
  },
  {
    kind: "argument",
    secret: "API_TOKEN",
    ctx: ctxOf(
      { pkg: pkg({ runtimeArguments: [{ type: "named", name: "--api-token", isSecret: true }] }) },
      { values: { "--api-token": TYPED_SECRET } },
    ),
  },
];

describe("secrets", () => {
  const matrix = ALL_CLIENTS.flatMap((client) => SECRET_CASES.map((sc) => ({ client, ...sc })));

  it.each(matrix)("$client never inlines a secret $kind", ({ client, ctx, secret }) => {
    const r = build(client, ctx);
    const code = codeOf(r);
    expect(code).not.toContain(TYPED_SECRET);
    expect(code).toContain(placeholderFor(client, secret));
    expect(r.secrets).toEqual([secret]);
  });

  it("shell-quotes placeholders in the Claude Code command line", () => {
    const [envCli] = build("claude-code", SECRET_CASES[0].ctx).snippets;
    expect(envCli.code).toContain('-e API_KEY="${API_KEY}"');
    const [hdrCli] = build("claude-code", SECRET_CASES[1].ctx).snippets;
    expect(hdrCli.code).toContain('--header "X-Api-Key: ${X_API_KEY}"');
    const [varCli] = build("claude-code", SECRET_CASES[2].ctx).snippets;
    expect(varCli.code).toContain('--header "Authorization: Bearer ${TOKEN}"');
  });

  it("declares vscode inputs as passwords, once each", () => {
    const ctx = ctxOf({
      pkg: pkg({
        environmentVariables: [{ name: "API_KEY", isSecret: true }],
        packageArguments: [{ type: "named", name: "--key", value: "{k}", variables: { k: { name: "API_KEY", isSecret: true } } }],
      }),
    });
    const [s] = build("vscode", ctx).snippets;
    const file = JSON.parse(s.code);
    expect(file.inputs).toEqual([{ type: "promptString", id: "api-key", description: "API_KEY", password: true }]);
    expect(file.servers.weather.env).toEqual({ API_KEY: "${input:api-key}" });
    expect(file.servers.weather.args).toContain("${input:api-key}");
    expect(s.note).toBe("VS Code prompts for each input once and keeps it in its secret storage.");
  });

  it("explains the markers in the Claude Desktop note only when secrets exist", () => {
    expect(build("claude-desktop", SECRET_CASES[0].ctx).snippets[0].note).toContain("<SET_LOCALLY:...>");
    expect(build("claude-desktop", ctxOf({ pkg: pkg() })).snippets[0].note).toBeUndefined();
    expect(build("vscode", ctxOf({ pkg: pkg() })).snippets[0].note).toBeUndefined();
  });

  it("bridges remote headers through mcp-remote for Claude Desktop", () => {
    const args = JSON.parse(build("claude-desktop", SECRET_CASES[2].ctx).snippets[0].code).mcpServers.weather.args;
    expect(args).toEqual(["-y", "mcp-remote", "https://mcp.acme.dev/mcp", "--header", "Authorization:Bearer <SET_LOCALLY:TOKEN>"]);
  });

  it("keeps a secret env var with a fixed value as that value", () => {
    const p = pkg({ environmentVariables: [{ name: "MODE", isSecret: true, value: "fixed" }] });
    expect(fileEntry(ctxOf({ pkg: p })).env).toEqual({ MODE: "fixed" });
  });

  it("names a secret positional argument by its value hint", () => {
    const p = pkg({ packageArguments: [{ type: "positional", valueHint: "auth token", isSecret: true }] });
    const r = build("claude-code", ctxOf({ pkg: p }));
    expect(r.secrets).toEqual(["AUTH_TOKEN"]);
    expect(fileEntry(ctxOf({ pkg: p })).args).toEqual(["-y", "@acme/weather@1.0.0", "${AUTH_TOKEN}"]);
  });
});

describe("notes", () => {
  it("uses singular wording for one secret", () => {
    expect(build("cursor", SECRET_CASES[0].ctx).notes).toEqual([
      "1 secret is left as a placeholder (API_KEY). Set it in your environment; values you type here are never put in a snippet.",
    ]);
  });

  it("uses plural wording for several secrets", () => {
    const p = pkg({ environmentVariables: [{ name: "A", isSecret: true }, { name: "B", isSecret: true }] });
    const [note] = build("cursor", ctxOf({ pkg: p })).notes;
    expect(note).toContain("2 secrets are left as a placeholder (A, B). Set them");
  });

  it("adds the registry note for a package with registryBaseUrl", () => {
    const r = build("cursor", ctxOf({ pkg: pkg({ registryBaseUrl: "https://ak/npm/" }) }));
    expect(r.notes).toEqual([
      "The package installs through Artifact Keeper (https://ak/npm/). A private repository needs your client to be logged in to it.",
    ]);
    expect(build("cursor", ctxOf({ pkg: pkg() })).notes).toEqual([]);
    expect(build("cursor", ctxOf({ remote: remote() })).notes).toEqual([]);
  });

  it("defaults the cursor and windsurf notes", () => {
    expect(build("cursor", ctxOf({ pkg: pkg() })).snippets[0].note).toContain("${env:NAME}");
    expect(build("windsurf", ctxOf({ remote: remote() })).snippets[0].note).toContain("Windsurf");
  });
});

// ---------------------------------------------------------------------------
// Registry overrides, version pinning, alias
// ---------------------------------------------------------------------------

describe("registry override from registryBaseUrl", () => {
  it.each([
    ["npm", "@acme/weather", ["-y", "--registry", "https://ak/api/npm/r/", "@acme/weather@1.0.0"]],
    ["pypi", "acme-weather", ["--index-url", "https://ak/api/pypi/r/simple/", "acme-weather==1.0.0"]],
    ["nuget", "Acme.Weather", ["Acme.Weather@1.0.0", "--yes", "--source", "https://ak/api/nuget/r"]],
  ])("%s trims the trailing slash", (registryType, identifier, args) => {
    const p = pkg({ registryType, identifier, registryBaseUrl: "https://ak/api/" + registryType + "/r//" });
    expect(fileEntry(ctxOf({ pkg: p })).args).toEqual(args);
  });

  it.each([
    ["npm", ["-y", "@acme/weather@1.0.0"]],
    ["pypi", ["@acme/weather==1.0.0"]],
    ["nuget", ["@acme/weather@1.0.0", "--yes"]],
  ])("%s has no registry flag without a base", (registryType, args) => {
    expect(fileEntry(ctxOf({ pkg: pkg({ registryType }) })).args).toEqual(args);
  });

  it("puts the cargo sparse index in the install note", () => {
    const p = pkg({ registryType: "cargo", identifier: "acme", registryBaseUrl: "https://ak/api/cargo/r/" });
    const cmd = packageCommand(p, {}, (n) => n, new Set());
    expect(cmd.note).toBe("Install the binary first: cargo install acme --version 1.0.0 --index sparse+https://ak/api/cargo/r/");
    const unversioned = packageCommand({ ...p, version: undefined }, {}, (n) => n, new Set());
    expect(unversioned.note).toBe("Install the binary first: cargo install acme --index sparse+https://ak/api/cargo/r/");
    const plain = packageCommand({ ...p, version: undefined, registryBaseUrl: undefined }, {}, (n) => n, new Set());
    expect(plain.note).toBe("Install the binary first: cargo install acme");
  });

  it("honours runtimeHint over the default runner", () => {
    expect(fileEntry(ctxOf({ pkg: pkg({ runtimeHint: "bunx" }) })).command).toBe("bunx");
    expect(packageCommand(pkg({ registryType: "gem", runtimeHint: "ruby" }), {}, (n) => n, new Set()).command).toBe("ruby");
  });
});

describe("pinVersion and alias", () => {
  it("drops the version when pinVersion is false", () => {
    expect(fileEntry(ctxOf({ pkg: pkg() }, { pinVersion: false })).args).toEqual(["-y", "@acme/weather"]);
    const py = pkg({ registryType: "pypi", identifier: "acme" });
    expect(fileEntry(ctxOf({ pkg: py }, { pinVersion: false })).args).toEqual(["acme"]);
  });

  it("drops the version when the package has none", () => {
    expect(fileEntry(ctxOf({ pkg: pkg({ version: undefined }) })).args).toEqual(["-y", "@acme/weather"]);
  });

  it("keys the config by an alias override", () => {
    const ctx = ctxOf({ pkg: pkg() }, { alias: "my-alias" });
    expect(build("claude-code", ctx).snippets[0].code).toMatch(/^claude mcp add my-alias /);
    expect(fileEntry(ctx).command).toBe("npx");
    expect(Object.keys(JSON.parse(build("windsurf", ctx).snippets[0].code).mcpServers)).toEqual(["my-alias"]);
  });
});

// ---------------------------------------------------------------------------
// Value resolution
// ---------------------------------------------------------------------------

function argsFor(packageArguments: McpInput[], values: Record<string, string> = {}): string[] | undefined {
  return fileEntry(ctxOf({ pkg: pkg({ packageArguments }) }, { values })).args?.slice(2);
}

describe("value resolution", () => {
  it("inlines typed non-secret env values, else the default, else omits", () => {
    const p = pkg({
      environmentVariables: [
        { name: "REGION", default: "us" },
        { name: "ZONE", default: "z1" },
        { name: "OPTIONAL" },
        { name: "NEEDED", isRequired: true },
        { default: "unnamed" },
      ],
    });
    expect(fileEntry(ctxOf({ pkg: p }, { values: { REGION: "eu", ZONE: "" } })).env).toEqual({
      REGION: "eu",
      ZONE: "z1",
      NEEDED: "<NEEDED>",
    });
  });

  it("emits a hint for required values without one", () => {
    expect(argsFor([{ type: "positional", valueHint: "path", isRequired: true }])).toEqual(["<path>"]);
    expect(argsFor([{ type: "positional", isRequired: true }])).toEqual(["<value>"]);
  });

  it("omits optional arguments without a value", () => {
    expect(argsFor([{ type: "named", name: "--verbose" }, { type: "positional", valueHint: "x" }])).toEqual([]);
  });

  it("emits named arguments as flag and value", () => {
    expect(argsFor([{ type: "named", name: "--port", default: "80" }], { "--port": "8080" })).toEqual(["--port", "8080"]);
  });

  it.each([
    ["true", ["--debug"]],
    ["false", []],
  ])("named boolean %s", (value, expected) => {
    expect(argsFor([{ type: "named", name: "--debug", format: "boolean" }], { "--debug": value })).toEqual(expected);
  });

  it("treats an empty fixed boolean value as the bare flag", () => {
    expect(argsFor([{ type: "named", name: "--flag", format: "boolean", value: "" }])).toEqual(["--flag"]);
  });

  it("emits positional arguments in order", () => {
    const args = [
      { type: "positional", name: "src" },
      { type: "positional", name: "dst", default: "/tmp/out" },
    ];
    expect(argsFor(args, { src: "/data" })).toEqual(["/data", "/tmp/out"]);
  });

  it("substitutes variables in fixed values and leaves unknown ones", () => {
    const args: McpInput[] = [
      { type: "positional", value: "--level={lvl}", variables: { lvl: { default: "3" } } },
      { type: "positional", value: "{missing}-{opt}", variables: { opt: {} } },
      { type: "positional", value: "{lvl}" },
    ];
    expect(argsFor(args)).toEqual(["--level=3", "{missing}-{opt}", "{lvl}"]);
  });

  it("puts runtime arguments before the package and package arguments after", () => {
    const p = pkg({
      runtimeArguments: [{ type: "named", name: "--node-arg", value: "x" }],
      packageArguments: [{ type: "positional", value: "serve" }],
    });
    expect(fileEntry(ctxOf({ pkg: p })).args).toEqual(["-y", "--node-arg", "x", "@acme/weather@1.0.0", "serve"]);
  });
});

describe("shellQuote", () => {
  it.each([
    ["", "''"],
    ["abc-1.2/x@y:z,w=%+_", "abc-1.2/x@y:z,w=%+_"],
    ["${VAR}", '"${VAR}"'],
    ["Authorization: Bearer ${TOKEN}", '"Authorization: Bearer ${TOKEN}"'],
    ["it's", "'it'\\''s'"],
    ["two words", "'two words'"],
    ["$HOME", "'$HOME'"],
    ['say "${X}"', `'say "'"\${X}"'"'`],
    // Publisher text around a placeholder never expands, only the placeholder.
    ["pa$s-${TOKEN}", `'pa$s-'"\${TOKEN}"`],
    ["X: $(id) ${T}", `'X: $(id) '"\${T}"`],
    ["${A}`id`${B}", '"${A}"\'`id`\'"${B}"'],
    ["${A}/x", '"${A}/x"'],
  ])("%j -> %j", (word, expected) => {
    expect(shellQuote(word)).toBe(expected);
  });

  it("keeps a publisher's $(...) in a header literal on the command line", () => {
    const remote = {
      type: "streamable-http",
      url: "https://x.example/mcp",
      headers: [{ name: "X", value: "$(id) {t}", variables: { t: { isSecret: true } } }],
    };
    const server = { name: "com.acme/r", description: "", version: "1.0.0", remotes: [remote] };
    const cli = buildClientSnippets("claude-code", { server, runner: runnersOf(server)[0] }).snippets[0].code;
    expect(cli).toContain(`--header 'X: $(id) '"\${T}"`);
    expect(cli).not.toContain('"X: $(id)');
  });

  it("quotes words in the Claude Code command line", () => {
    const p = pkg({ packageArguments: [{ type: "positional", value: "it's here" }] });
    expect(claudeCodeOneLiner(ctxOf({ pkg: p }))).toContain("@acme/weather@1.0.0 'it'\\''s here'");
  });
});

describe("placeholderName", () => {
  it.each([
    ["acme-api-key", "ACME_API_KEY"],
    ["--acme-api-key", "ACME_API_KEY"],
    ["a.b c", "A_B_C"],
    ["_x_", "X"],
    ["", "VALUE"],
    ["---", "VALUE"],
  ])("%j -> %j", (name, expected) => {
    expect(placeholderName(name)).toBe(expected);
  });
});

describe("claudeCodeOneLiner", () => {
  it("returns the Claude Code command line", () => {
    const ctx = ctxOf({ pkg: pkg({ environmentVariables: [{ name: "REGION", default: "eu" }] }) });
    expect(claudeCodeOneLiner(ctx)).toBe("claude mcp add weather -e REGION=eu \\\n  -- npx -y @acme/weather@1.0.0");
    expect(claudeCodeOneLiner(ctxOf({ remote: remote() }))).toBe(
      "claude mcp add --transport http weather https://mcp.acme.dev/mcp",
    );
  });
});
