import type { McpInput, McpPackage, McpServerJson, McpTransport } from "@/types/mcp";
import { serverAlias, type McpRunner } from "@/lib/mcp/server-json";

/**
 * Install / Connect snippet generators (artifact-keeper#5253, section 6).
 *
 * Pure functions, no React: given a served server document (whose
 * `packages[]` already carry Artifact Keeper coordinates under `own-repos`),
 * a chosen runner and the values the user typed, produce one config per
 * client. Rules every generator follows:
 *
 * - A value typed into an input flagged `isSecret` is NEVER placed in a
 *   snippet. The snippet carries a placeholder the client expands at run
 *   time (`${NAME}` in a shell, `${env:NAME}` / `${input:id}` where the
 *   client supports it), and the panel says so.
 * - Non-secret values are inlined; an empty non-secret value falls back to
 *   the input's `default`, then to a `<name>` hint.
 * - The served coordinates are emitted as served: `registryBaseUrl` becomes
 *   the runner's registry flag, an OCI identifier is used verbatim (it is
 *   already `host/repo/path:tag@sha256:...`).
 *
 * Client flags were checked against each client's documentation at the time
 * of writing; each client is one function so a flag change is a one-line fix
 * with a test.
 */

export type McpClientId =
  | "claude-code"
  | "vscode"
  | "cursor"
  | "claude-desktop"
  | "windsurf"
  | "json";

export const MCP_CLIENTS: { id: McpClientId; label: string }[] = [
  { id: "claude-code", label: "Claude Code" },
  { id: "vscode", label: "VS Code" },
  { id: "cursor", label: "Cursor" },
  { id: "claude-desktop", label: "Claude Desktop" },
  { id: "windsurf", label: "Windsurf" },
  { id: "json", label: "JSON" },
];

export interface McpSnippet {
  id: string;
  label: string;
  /** Where the snippet goes, e.g. `.mcp.json`. */
  filename?: string;
  language: "bash" | "json";
  code: string;
  note?: string;
}

export interface McpSnippetContext {
  server: McpServerJson;
  runner: McpRunner;
  /** Values typed in the panel, keyed by input name. Never persisted. */
  values?: Record<string, string>;
  /** Emit `identifier@version` (default true). */
  pinVersion?: boolean;
  /** Client key override; defaults to `serverAlias(server.name)`. */
  alias?: string;
}

export interface McpSnippetResult {
  snippets: McpSnippet[];
  /** Secret names left as placeholders. */
  secrets: string[];
  /** Notes the panel shows under the snippets. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Value resolution
// ---------------------------------------------------------------------------

/** `ACME_API_KEY` from `acme-api-key` / `--acme-api-key`. */
export function placeholderName(name: string): string {
  const n = name.replace(/^-+/, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (n || "VALUE").toUpperCase();
}

type Placeholder = (name: string) => string;
const shellPlaceholder: Placeholder = (n) => `\${${n}}`;

interface Resolved {
  name: string;
  value: string;
  secret: boolean;
}

/**
 * Resolve one input to the text a snippet carries. `{var}` references in a
 * fixed `value` (the schema's `variables`) are substituted the same way.
 */
function resolveInput(
  input: McpInput,
  values: Record<string, string>,
  ph: Placeholder,
  secrets: Set<string>,
): Resolved | null {
  const name = input.name ?? "";
  const secret = input.isSecret === true;
  const key = placeholderName(name || input.valueHint || "value");
  let value: string;
  if (input.value !== undefined) {
    value = substituteVariables(input.value, input.variables, values, ph, secrets);
  } else if (secret) {
    secrets.add(key);
    value = ph(key);
  } else {
    const typed = values[name];
    if (typed !== undefined && typed !== "") value = typed;
    else if (input.default !== undefined) value = input.default;
    else if (input.isRequired) value = `<${input.valueHint ?? (name || "value")}>`;
    else return null;
  }
  return { name, value, secret };
}

function substituteVariables(
  template: string,
  variables: Record<string, McpInput> | undefined,
  values: Record<string, string>,
  ph: Placeholder,
  secrets: Set<string>,
): string {
  return template.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (whole, varName: string) => {
    const v = variables?.[varName];
    if (!v) return whole;
    const r = resolveInput({ ...v, name: v.name ?? varName }, values, ph, secrets);
    return r ? r.value : whole;
  });
}

/** argv from runtime/package arguments. */
function argv(
  args: McpInput[] | undefined,
  values: Record<string, string>,
  ph: Placeholder,
  secrets: Set<string>,
): string[] {
  const out: string[] = [];
  for (const a of args ?? []) {
    const r = resolveInput(a, values, ph, secrets);
    if (a.type === "named") {
      const flag = a.name ?? "";
      if (!r) continue;
      if (a.format === "boolean" && (r.value === "true" || r.value === "")) out.push(flag);
      else if (a.format === "boolean" && r.value === "false") continue;
      else out.push(flag, r.value);
    } else if (r) {
      out.push(r.value);
    }
  }
  return out;
}

function envOf(
  pkg: McpPackage,
  values: Record<string, string>,
  ph: Placeholder,
  secrets: Set<string>,
): [string, string][] {
  const out: [string, string][] = [];
  for (const e of pkg.environmentVariables ?? []) {
    if (!e.name) continue;
    // A secret env var is passed through by name, so the placeholder is the
    // variable itself rather than a derived name.
    if (e.isSecret && e.value === undefined) {
      secrets.add(e.name);
      out.push([e.name, ph(e.name)]);
      continue;
    }
    const r = resolveInput(e, values, ph, secrets);
    if (r) out.push([e.name, r.value]);
  }
  return out;
}

function headersOf(
  t: McpTransport,
  values: Record<string, string>,
  ph: Placeholder,
  secrets: Set<string>,
): [string, string][] {
  const out: [string, string][] = [];
  for (const h of t.headers ?? []) {
    if (!h.name) continue;
    const r = resolveInput(h, values, ph, secrets);
    if (r) out.push([h.name, r.value]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Command line of a package
// ---------------------------------------------------------------------------

export interface McpCommand {
  command: string;
  args: string[];
  env: [string, string][];
  note?: string;
}

function withVersion(pkg: McpPackage, pin: boolean, sep: string): string {
  return pin && pkg.version ? `${pkg.identifier}${sep}${pkg.version}` : pkg.identifier;
}

function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

/**
 * The command a client launches for a package. Registry overrides come from
 * the served `registryBaseUrl`, so a client installs through Artifact Keeper.
 */
export function packageCommand(
  pkg: McpPackage,
  values: Record<string, string>,
  ph: Placeholder,
  secrets: Set<string>,
  pin = true,
): McpCommand {
  const runtimeArgs = argv(pkg.runtimeArguments, values, ph, secrets);
  const pkgArgs = argv(pkg.packageArguments, values, ph, secrets);
  const env = envOf(pkg, values, ph, secrets);
  const base = pkg.registryBaseUrl ? trimSlash(pkg.registryBaseUrl) : undefined;
  switch (pkg.registryType) {
    case "npm": {
      const reg = base ? ["--registry", `${base}/`] : [];
      return {
        command: pkg.runtimeHint ?? "npx",
        args: ["-y", ...reg, ...runtimeArgs, withVersion(pkg, pin, "@"), ...pkgArgs],
        env,
      };
    }
    case "pypi": {
      const reg = base ? ["--index-url", `${base}/simple/`] : [];
      return {
        command: pkg.runtimeHint ?? "uvx",
        args: [...reg, ...runtimeArgs, withVersion(pkg, pin, "=="), ...pkgArgs],
        env,
      };
    }
    case "nuget": {
      const reg = base ? ["--source", base] : [];
      return {
        command: pkg.runtimeHint ?? "dnx",
        args: [...runtimeArgs, withVersion(pkg, pin, "@"), "--yes", ...reg, ...pkgArgs],
        env,
      };
    }
    case "cargo": {
      return {
        command: pkg.identifier,
        args: pkgArgs,
        env,
        note: base
          ? `Install the binary first: cargo install ${pkg.identifier}${pkg.version ? ` --version ${pkg.version}` : ""} --index sparse+${base}/`
          : `Install the binary first: cargo install ${pkg.identifier}${pkg.version ? ` --version ${pkg.version}` : ""}`,
      };
    }
    case "oci": {
      // `docker run -e NAME` passes the variable through from the client's
      // environment, so env values ride on `env` and only names go on argv.
      const envFlags = env.flatMap(([k]) => ["-e", k]);
      return {
        command: pkg.runtimeHint ?? "docker",
        args: ["run", "-i", "--rm", ...envFlags, ...runtimeArgs, pkg.identifier, ...pkgArgs],
        env,
      };
    }
    case "mcpb":
      return {
        command: "",
        args: [],
        env,
        note: "This is an MCP bundle (.mcpb): download it and open it with Claude Desktop, which installs it and asks for its settings.",
      };
    default:
      return {
        command: pkg.runtimeHint ?? pkg.identifier,
        args: [...runtimeArgs, ...pkgArgs],
        env,
        note: `Unknown registry type "${pkg.registryType}"; check the command before use.`,
      };
  }
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;
const PLACEHOLDER = /\$\{[A-Za-z0-9_]+\}/;

function singleQuote(word: string): string {
  return `'${word.replace(/'/g, `'\\''`)}'`;
}

/**
 * Quote a shell word unless it is plainly safe or a `${VAR}` placeholder.
 * Only the placeholders may expand: the rest of the word is publisher text
 * (a header's fixed `value`), so a `$(...)` or `$x` in it must stay literal.
 */
export function shellQuote(word: string): string {
  if (word === "") return "''";
  if (SHELL_SAFE.test(word)) return word;
  if (!PLACEHOLDER.test(word)) return singleQuote(word);
  const literal = word.replace(new RegExp(PLACEHOLDER.source, "g"), "");
  // Nothing in the literal text is special inside double quotes: one word.
  if (!/["\\`$]/.test(literal)) return `"${word}"`;
  // Otherwise quote each piece on its own: placeholders in double quotes,
  // literal runs in single quotes, concatenated into one shell word.
  return word
    .split(new RegExp(`(${PLACEHOLDER.source})`))
    .filter((p) => p !== "")
    .map((p) => (/^\$\{[A-Za-z0-9_]+\}$/.test(p) ? `"${p}"` : SHELL_SAFE.test(p) ? p : singleQuote(p)))
    .join("");
}

function json(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

function objectOf(pairs: [string, string][]): Record<string, string> | undefined {
  if (pairs.length === 0) return undefined;
  return Object.fromEntries(pairs);
}

function stripUndefined<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

function remoteTransportFlag(t: string): string {
  return t === "sse" ? "sse" : "http";
}

// ---------------------------------------------------------------------------
// Per-client generators
// ---------------------------------------------------------------------------

function claudeCode(ctx: Required<Pick<McpSnippetContext, "server" | "runner" | "values" | "pinVersion" | "alias">>, secrets: Set<string>): McpSnippet[] {
  const { runner, values, alias } = ctx;
  if (runner.kind === "remote") {
    const headers = headersOf(runner.remote, values, shellPlaceholder, secrets);
    const flags = headers.map(([k, v]) => `--header ${shellQuote(`${k}: ${v}`)}`);
    const cli = [
      `claude mcp add --transport ${remoteTransportFlag(runner.remote.type)} ${alias} ${shellQuote(runner.remote.url ?? "")}`,
      ...flags,
    ].join(" \\\n  ");
    const file = {
      mcpServers: {
        [alias]: stripUndefined({
          type: remoteTransportFlag(runner.remote.type),
          url: runner.remote.url,
          headers: objectOf(headers),
        }),
      },
    };
    return [
      { id: "claude-code-cli", label: "Command line", language: "bash", code: cli },
      {
        id: "claude-code-file",
        label: "Project config",
        filename: ".mcp.json",
        language: "json",
        code: json(file),
        note: "Claude Code expands ${VAR} from your environment when it reads .mcp.json.",
      },
    ];
  }
  const cmd = packageCommand(runner.pkg, values, shellPlaceholder, secrets, ctx.pinVersion);
  if (!cmd.command) return [];
  const envFlags = cmd.env.map(([k, v]) => `-e ${k}=${shellQuote(v)}`);
  const cli = [
    [`claude mcp add ${alias}`, ...envFlags].join(" "),
    `-- ${[cmd.command, ...cmd.args].map(shellQuote).join(" ")}`,
  ].join(" \\\n  ");
  const file = {
    mcpServers: {
      [alias]: stripUndefined({ command: cmd.command, args: cmd.args, env: objectOf(cmd.env) }),
    },
  };
  return [
    { id: "claude-code-cli", label: "Command line", language: "bash", code: cli, note: cmd.note },
    {
      id: "claude-code-file",
      label: "Project config",
      filename: ".mcp.json",
      language: "json",
      code: json(file),
      note: "Claude Code expands ${VAR} from your environment when it reads .mcp.json.",
    },
  ];
}

function vscode(ctx: Required<Pick<McpSnippetContext, "server" | "runner" | "values" | "pinVersion" | "alias">>, secrets: Set<string>): McpSnippet[] {
  const { runner, values, alias } = ctx;
  // VS Code prompts for `${input:<id>}` values and stores them in its secret
  // storage when the input is `password: true`.
  const inputs: { type: "promptString"; id: string; description: string; password: true }[] = [];
  const ph: Placeholder = (n) => {
    const id = n.toLowerCase().replace(/_/g, "-");
    if (!inputs.some((i) => i.id === id)) {
      inputs.push({ type: "promptString", id, description: n, password: true });
    }
    return `\${input:${id}}`;
  };
  let entry: Record<string, unknown>;
  let note: string | undefined;
  if (runner.kind === "remote") {
    const headers = headersOf(runner.remote, values, ph, secrets);
    entry = stripUndefined({
      type: remoteTransportFlag(runner.remote.type),
      url: runner.remote.url,
      headers: objectOf(headers),
    });
  } else {
    const cmd = packageCommand(runner.pkg, values, ph, secrets, ctx.pinVersion);
    if (!cmd.command) return [];
    entry = stripUndefined({ type: "stdio", command: cmd.command, args: cmd.args, env: objectOf(cmd.env) });
    note = cmd.note;
  }
  const file = stripUndefined({
    inputs: inputs.length ? inputs : undefined,
    servers: { [alias]: entry },
  });
  return [
    {
      id: "vscode-file",
      label: "Workspace config",
      filename: ".vscode/mcp.json",
      language: "json",
      code: json(file),
      note: note ?? (inputs.length ? "VS Code prompts for each input once and keeps it in its secret storage." : undefined),
    },
  ];
}

function mcpServersJson(
  ctx: Required<Pick<McpSnippetContext, "server" | "runner" | "values" | "pinVersion" | "alias">>,
  secrets: Set<string>,
  ph: Placeholder,
  remoteUrlKey: "url" | "serverUrl",
): { file: Record<string, unknown>; note?: string } | null {
  const { runner, values, alias } = ctx;
  if (runner.kind === "remote") {
    const headers = headersOf(runner.remote, values, ph, secrets);
    return {
      file: {
        mcpServers: {
          [alias]: stripUndefined({ [remoteUrlKey]: runner.remote.url, headers: objectOf(headers) }),
        },
      },
    };
  }
  const cmd = packageCommand(runner.pkg, values, ph, secrets, ctx.pinVersion);
  if (!cmd.command) return null;
  return {
    file: {
      mcpServers: {
        [alias]: stripUndefined({ command: cmd.command, args: cmd.args, env: objectOf(cmd.env) }),
      },
    },
    note: cmd.note,
  };
}

const envPlaceholder: Placeholder = (n) => `\${env:${n}}`;

function cursor(ctx: Parameters<typeof claudeCode>[0], secrets: Set<string>): McpSnippet[] {
  const r = mcpServersJson(ctx, secrets, envPlaceholder, "url");
  if (!r) return [];
  return [
    {
      id: "cursor-file",
      label: "Project config",
      filename: ".cursor/mcp.json",
      language: "json",
      code: json(r.file),
      note: r.note ?? "Cursor reads ${env:NAME} from the environment it was started in.",
    },
  ];
}

function windsurf(ctx: Parameters<typeof claudeCode>[0], secrets: Set<string>): McpSnippet[] {
  const r = mcpServersJson(ctx, secrets, envPlaceholder, "serverUrl");
  if (!r) return [];
  return [
    {
      id: "windsurf-file",
      label: "User config",
      filename: "~/.codeium/windsurf/mcp_config.json",
      language: "json",
      code: json(r.file),
      note: r.note ?? "Windsurf reads ${env:NAME} from the environment it was started in.",
    },
  ];
}

function claudeDesktop(ctx: Parameters<typeof claudeCode>[0], secrets: Set<string>): McpSnippet[] {
  const { runner, values, alias } = ctx;
  // Claude Desktop does not expand variables in its config. Secrets stay as
  // a visible `<SET_LOCALLY:NAME>` marker the user replaces on their own
  // machine; the value is never written here.
  const ph: Placeholder = (n) => `<SET_LOCALLY:${n}>`;
  if (runner.kind === "remote") {
    // Remote servers are added through Settings > Connectors; the config file
    // reaches them through the `mcp-remote` stdio bridge.
    const headers = headersOf(runner.remote, values, ph, secrets);
    const args = ["-y", "mcp-remote", runner.remote.url ?? ""];
    for (const [k, v] of headers) args.push("--header", `${k}:${v}`);
    const file = { mcpServers: { [alias]: { command: "npx", args } } };
    return [
      {
        id: "claude-desktop-file",
        label: "Config file",
        filename: "claude_desktop_config.json",
        language: "json",
        code: json(file),
        note: "Or add the URL under Settings > Connectors. The file form bridges the remote through mcp-remote. Replace each <SET_LOCALLY:...> marker on your own machine.",
      },
    ];
  }
  const r = mcpServersJson(ctx, secrets, ph, "url");
  if (!r) {
    return [
      {
        id: "claude-desktop-bundle",
        label: "MCP bundle",
        language: "bash",
        code: `# Download the .mcpb bundle and open it with Claude Desktop\nopen ${shellQuote(runner.pkg.identifier)}`,
        note: "Claude Desktop installs the bundle and asks for its settings.",
      },
    ];
  }
  return [
    {
      id: "claude-desktop-file",
      label: "Config file",
      filename: "claude_desktop_config.json",
      language: "json",
      code: json(r.file),
      note: r.note ?? (secrets.size ? "Claude Desktop does not expand variables: replace each <SET_LOCALLY:...> marker on your own machine, never in a shared file." : undefined),
    },
  ];
}

function genericJson(ctx: Parameters<typeof claudeCode>[0], secrets: Set<string>): McpSnippet[] {
  const { runner } = ctx;
  const block = runner.kind === "remote" ? runner.remote : runner.pkg;
  const r = mcpServersJson(ctx, secrets, shellPlaceholder, "url");
  const out: McpSnippet[] = [
    {
      id: "json-entry",
      label: runner.kind === "remote" ? "server.json remote" : "server.json package",
      language: "json",
      code: json(block),
      note: "The entry exactly as this registry serves it.",
    },
  ];
  if (r) out.push({ id: "json-mcpservers", label: "mcpServers", language: "json", code: json(r.file) });
  return out;
}

const GENERATORS: Record<McpClientId, (ctx: Parameters<typeof claudeCode>[0], secrets: Set<string>) => McpSnippet[]> = {
  "claude-code": claudeCode,
  vscode,
  cursor,
  "claude-desktop": claudeDesktop,
  windsurf,
  json: genericJson,
};

/** Snippets for one client. */
export function buildClientSnippets(client: McpClientId, ctx: McpSnippetContext): McpSnippetResult {
  const full = {
    server: ctx.server,
    runner: ctx.runner,
    values: ctx.values ?? {},
    pinVersion: ctx.pinVersion ?? true,
    alias: ctx.alias ?? serverAlias(ctx.server.name),
  };
  const secrets = new Set<string>();
  const snippets = GENERATORS[client](full, secrets);
  const notes: string[] = [];
  if (secrets.size > 0) {
    notes.push(
      `${secrets.size} secret${secrets.size === 1 ? " is" : "s are"} left as a placeholder (${[...secrets].join(", ")}). Set ${secrets.size === 1 ? "it" : "them"} in your environment; values you type here are never put in a snippet.`,
    );
  }
  if (ctx.runner.kind === "package" && ctx.runner.pkg.registryBaseUrl) {
    notes.push(
      `The package installs through Artifact Keeper (${ctx.runner.pkg.registryBaseUrl}). A private repository needs your client to be logged in to it.`,
    );
  }
  return { snippets, secrets: [...secrets], notes };
}

/** The Claude Code one-liner for a runner, for copy buttons on lists. */
export function claudeCodeOneLiner(ctx: McpSnippetContext): string {
  return buildClientSnippets("claude-code", ctx).snippets[0]?.code ?? "";
}
