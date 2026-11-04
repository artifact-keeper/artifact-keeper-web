"use client";

/**
 * MCP registry repository options (artifact-keeper#5253, issue section 3.3),
 * shared by the create dialog and the Settings tab like the other groups in
 * `format-config-fields.tsx`.
 *
 * Which setting applies to which repository type follows the backend's
 * table (docs/mcp-registry.md, "Repository settings (Phase 2 and 3)"):
 * hosted repositories (Local, Staging) get the Phase 1 settings (namespace
 * allowlist, package policy, backing repository per registryType), Remote
 * repositories the curation settings, and every type that holds versions
 * itself the probe, sandbox, grant and signature settings. A Virtual takes
 * only the deny list and the OCI label rule. Phase 2/3 settings exist only on
 * a backend that reports them: the Settings tab shows a field only when the
 * repository response carries it, and the create dialog sends one only when
 * it was changed. The two instance locks are offered to an instance
 * administrator only; anyone else sees a locked setting disabled.
 */

import { useCallback, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Lock, Plus, X } from "lucide-react";

import type { Repository } from "@/types";
import type {
  McpOciFloatingTagPolicy,
  McpPackagePolicy,
  McpPackageRepos,
  McpProbeRemotes,
  McpRemoteMode,
  McpRemotePosture,
  McpRepositorySettings,
  McpSandboxIntrospection,
} from "@/types/mcp";
import {
  MCP_BACKABLE_REGISTRY_TYPES,
  MCP_BACKING_FORMATS,
  MCP_OFFICIAL_NAMESPACE_GLOB,
  hasMcpConfig,
  isBroadNamespaceGlob,
  validateNamespacePrefix,
} from "@/lib/mcp/format";
import { useRepositories } from "@/hooks/use-repositories";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Value shape and pure helpers
// ---------------------------------------------------------------------------

/** Every editable MCP setting, with its default filled in. */
export interface McpConfigValue {
  mcp_package_policy: McpPackagePolicy;
  mcp_package_repos: McpPackageRepos;
  mcp_namespace_allow: string[];
  mcp_require_namespace_grant: boolean;
  mcp_remote_posture: McpRemotePosture;
  mcp_remote_posture_locked: boolean;
  mcp_remote_mode: McpRemoteMode;
  mcp_server_deny: string[];
  mcp_auto_approve_namespaces: string[];
  mcp_oci_floating_tag_policy: McpOciFloatingTagPolicy;
  mcp_probe_remotes: McpProbeRemotes;
  mcp_probe_remotes_locked: boolean;
  mcp_require_oci_label: boolean;
  mcp_sandbox_introspection: McpSandboxIntrospection;
  mcp_require_bundle_signature: boolean;
}

export type McpConfigKey = keyof McpConfigValue;

/** The backend defaults (docs/mcp-registry.md): what an absent setting means. */
export const EMPTY_MCP_CONFIG: McpConfigValue = {
  mcp_package_policy: "own-repos",
  mcp_package_repos: {},
  mcp_namespace_allow: [],
  mcp_require_namespace_grant: false,
  mcp_remote_posture: "approval_required",
  mcp_remote_posture_locked: false,
  mcp_remote_mode: "allowlist",
  mcp_server_deny: [],
  mcp_auto_approve_namespaces: [],
  mcp_oci_floating_tag_policy: "pin",
  mcp_probe_remotes: "off",
  mcp_probe_remotes_locked: false,
  mcp_require_oci_label: false,
  mcp_sandbox_introspection: "off",
  mcp_require_bundle_signature: false,
};

/** The instance-administrator locks; nobody else may write them (403). */
export const MCP_LOCK_KEYS: ReadonlySet<McpConfigKey> = new Set<McpConfigKey>([
  "mcp_remote_posture_locked",
  "mcp_probe_remotes_locked",
]);

/** Settings every MCP repository type accepts, Virtual included. */
const MCP_ALL_TYPE_KEYS: readonly McpConfigKey[] = ["mcp_server_deny", "mcp_require_oci_label"];

/**
 * Settings of the repositories that hold server versions themselves (Local,
 * Staging, Remote). A Virtual refuses them: it serves what its members serve.
 */
const MCP_NON_VIRTUAL_KEYS: readonly McpConfigKey[] = [
  "mcp_require_namespace_grant",
  "mcp_probe_remotes",
  "mcp_probe_remotes_locked",
  "mcp_sandbox_introspection",
  "mcp_require_bundle_signature",
];

/** Settings of a hosted (Local, Staging) MCP repository. */
export const MCP_HOSTED_KEYS: readonly McpConfigKey[] = [
  "mcp_namespace_allow",
  "mcp_package_policy",
  "mcp_package_repos",
  ...MCP_ALL_TYPE_KEYS,
  ...MCP_NON_VIRTUAL_KEYS,
];

/** Settings of a Remote MCP repository. */
export const MCP_REMOTE_KEYS: readonly McpConfigKey[] = [
  "mcp_remote_posture",
  "mcp_remote_posture_locked",
  "mcp_remote_mode",
  "mcp_auto_approve_namespaces",
  "mcp_oci_floating_tag_policy",
  ...MCP_ALL_TYPE_KEYS,
  ...MCP_NON_VIRTUAL_KEYS,
];

/** Settings of a Virtual MCP repository: the rest live on its members. */
export const MCP_VIRTUAL_KEYS: readonly McpConfigKey[] = MCP_ALL_TYPE_KEYS;

/**
 * Phase 1 settings, shown whether or not the response carries them: the
 * backend echoes only the stored allowlist and backing map, so an absent key
 * there means "not set", not "not supported".
 */
const MCP_PHASE1_KEYS: ReadonlySet<McpConfigKey> = new Set<McpConfigKey>([
  "mcp_namespace_allow",
  "mcp_package_policy",
  "mcp_package_repos",
]);

/**
 * The settings the backend accepts for a repository type; any other one is
 * refused with 400.
 */
export function mcpKeysForRepoType(repoType: string): readonly McpConfigKey[] {
  if (repoType === "local" || repoType === "staging") return MCP_HOSTED_KEYS;
  if (repoType === "remote") return MCP_REMOTE_KEYS;
  if (repoType === "virtual") return MCP_VIRTUAL_KEYS;
  return [];
}

/** The editable value of a repository's stored settings, defaults filled in. */
export function mcpConfigFromRepo(repo: McpRepositorySettings): McpConfigValue {
  const out = { ...EMPTY_MCP_CONFIG };
  for (const k of Object.keys(EMPTY_MCP_CONFIG) as McpConfigKey[]) {
    const v = repo[k];
    if (v !== undefined) (out as Record<McpConfigKey, unknown>)[k] = v;
  }
  return out;
}

/**
 * The settings the Settings tab renders for a repository: Phase 1 hosted
 * settings always, any later one only when the backend reported it.
 */
export function mcpVisibleKeys(repo: Repository): ReadonlySet<McpConfigKey> {
  return new Set(
    mcpKeysForRepoType(repo.repo_type).filter(
      (k) => MCP_PHASE1_KEYS.has(k) || repo[k] !== undefined,
    ),
  );
}

/** A backing map without the "none" picks. */
function pruneRepos(repos: McpPackageRepos): McpPackageRepos {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(repos)) if (v) out[k] = v;
  return out as McpPackageRepos;
}

function canonical(k: McpConfigKey, v: unknown): string {
  if (k === "mcp_package_repos") {
    const pruned = pruneRepos((v ?? {}) as McpPackageRepos);
    return JSON.stringify(Object.keys(pruned).sort().map((t) => [t, pruned[t as keyof McpPackageRepos]]));
  }
  return JSON.stringify(v);
}

/**
 * The settings among `keys` whose value differs from `baseline`, for an
 * update body: an unchanged setting is omitted so a save never rewrites what
 * the operator did not touch (and never sends a key an older backend
 * refuses).
 */
export function mcpChangedFields(
  value: McpConfigValue,
  baseline: McpConfigValue,
  keys: Iterable<McpConfigKey>,
): Partial<McpRepositorySettings> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (canonical(k, value[k]) === canonical(k, baseline[k])) continue;
    out[k] = k === "mcp_package_repos" ? pruneRepos(value[k]) : value[k];
  }
  return out as Partial<McpRepositorySettings>;
}

/**
 * Settings the create dialog offers for a repository type. The namespace
 * grant requirement (Phase 3) is left to the Settings tab: the backend
 * ignores request fields it does not know, so on a backend that predates it
 * the switch would be accepted and silently not applied. Settings shows it
 * only when the repository response reports the field.
 */
export function mcpCreateKeys(repoType: string): ReadonlySet<McpConfigKey> {
  return new Set(mcpKeysForRepoType(repoType).filter((k) => k !== "mcp_require_namespace_grant"));
}

/**
 * The MCP fields of a create request, limited to what the backend accepts for
 * the type. A hosted repository always states its package policy (explicit
 * beats the server default in an audit trail) and sends the backing map only
 * under `own-repos`, where it means something. Everything else is sent only
 * when it differs from the default, so a backend that predates a setting is
 * not asked to store it; the locks only when an instance administrator set
 * them (anyone else gets 403).
 */
export function buildMcpCreateFields(
  value: McpConfigValue,
  repoType: string,
  isInstanceAdmin = false,
): Partial<McpRepositorySettings> {
  const hosted = repoType === "local" || repoType === "staging";
  const keys = [...mcpCreateKeys(repoType)].filter(
    (k) => !MCP_PHASE1_KEYS.has(k) && (isInstanceAdmin || !MCP_LOCK_KEYS.has(k)),
  );
  const out: Partial<McpRepositorySettings> = mcpChangedFields(value, EMPTY_MCP_CONFIG, keys);
  if (!hosted) return out;
  out.mcp_package_policy = value.mcp_package_policy;
  if (value.mcp_namespace_allow.length > 0) out.mcp_namespace_allow = value.mcp_namespace_allow;
  const repos = pruneRepos(value.mcp_package_repos);
  if (value.mcp_package_policy === "own-repos" && Object.keys(repos).length > 0) {
    out.mcp_package_repos = repos;
  }
  return out;
}

/**
 * Seed the Remote creation wizard: the official reference servers are
 * pre-approved (section 8, Phase 2) unless the operator already chose a list.
 */
export function seedMcpRemoteConfig(value: McpConfigValue): McpConfigValue {
  if (value.mcp_auto_approve_namespaces.length > 0) return value;
  return { ...value, mcp_auto_approve_namespaces: [MCP_OFFICIAL_NAMESPACE_GLOB] };
}

/** Longest glob the backend stores (`MAX_GLOB_LEN`). */
const MCP_GLOB_MAX_LEN = 200;

// Validation for a deny / auto-approve glob such as io.github.*/crypto-*,
// with the backend's alphabet (`validate_globs`): `*` is the only wildcard.
export function validateMcpGlob(glob: string): string | null {
  const g = glob.trim();
  if (!g) return "Enter a pattern";
  if (g.length > MCP_GLOB_MAX_LEN) return `At most ${MCP_GLOB_MAX_LEN} characters`;
  if (!/^[A-Za-z0-9.*/_-]+$/.test(g)) {
    return "Use letters, digits, dots, hyphens, underscores, slashes and * wildcards";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const LOCKED_TEXT = "Locked by an instance administrator";

function LockIndicator() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          role="img"
          aria-label={LOCKED_TEXT}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground"
          data-testid="mcp-lock-indicator"
        >
          <Lock className="size-3.5" aria-hidden="true" />
          Locked
        </span>
      </TooltipTrigger>
      <TooltipContent>{LOCKED_TEXT}</TooltipContent>
    </Tooltip>
  );
}

function AmberNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300"
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

interface ChipListEditorProps {
  id: string;
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  validate: (value: string) => string | null;
  placeholder: string;
  help: ReactNode;
  readOnly?: boolean;
  /** A warning shown on a chip (text, not colour only), or null. */
  warnFor?: (value: string) => string | null;
}

/** Add/remove list of short strings (namespaces, globs) shown as chips. */
function ChipListEditor({
  id,
  label,
  values,
  onChange,
  validate,
  placeholder,
  help,
  readOnly = false,
  warnFor,
}: ChipListEditorProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const v = draft.trim();
    const problem = validate(v) ?? (values.includes(v) ? "Already in the list" : null);
    setError(problem);
    if (problem) return;
    onChange([...values, v]);
    setDraft("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter adds the entry instead of submitting the surrounding form.
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  return (
    <div className="space-y-2">
      {/* Read-only renders no input, so there is nothing for a label to name. */}
      {readOnly ? <p className="text-sm font-medium">{label}</p> : <Label htmlFor={id}>{label}</Label>}
      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${label} entries`}>
          {values.map((v) => {
            const warning = warnFor?.(v) ?? null;
            return (
              <li
                key={v}
                className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-xs"
              >
                {v}
                {warning && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 font-sans text-amber-800 dark:text-amber-300"
                    title={warning}
                  >
                    <AlertTriangle className="size-3" aria-hidden="true" />
                    {warning}
                  </span>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    className="rounded text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${v}`}
                    onClick={() => onChange(values.filter((x) => x !== v))}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">None</p>
      )}
      {!readOnly && (
        <div className="flex gap-2">
          <Input
            id={id}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={onKeyDown}
            aria-invalid={!!error}
            aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="button" variant="outline" size="sm" onClick={add} aria-label={`Add to ${label}`}>
            <Plus className="size-3.5" aria-hidden="true" />
            Add
          </Button>
        </div>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div id={`${id}-help`} className="text-xs text-muted-foreground">
        {help}
      </div>
    </div>
  );
}

interface RadioOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface RadioFieldProps<T extends string> {
  name: string;
  legend: string;
  options: RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  locked?: boolean;
  children?: ReactNode;
}

function RadioField<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  disabled = false,
  locked = false,
  children,
}: RadioFieldProps<T>) {
  return (
    <fieldset className="space-y-2" disabled={disabled || locked}>
      <legend className="mb-1 flex items-center gap-2 text-sm font-medium">
        {legend}
        {locked && <LockIndicator />}
      </legend>
      {options.map((o) => (
        <label key={o.value} className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            aria-describedby={o.hint ? `${name}-${o.value}-hint` : undefined}
            className="mt-1 accent-primary"
          />
          <span>
            {o.label}
            {o.hint && (
              <span id={`${name}-${o.value}-hint`} className="block text-xs text-muted-foreground">
                {o.hint}
              </span>
            )}
          </span>
        </label>
      ))}
      {children}
    </fieldset>
  );
}

const POLICY_OPTIONS: RadioOption<McpPackagePolicy>[] = [
  {
    value: "own-repos",
    label: "Own repositories (recommended)",
    hint: "Every package must be hosted or proxied by this instance; served with Artifact Keeper coordinates and gated.",
  },
  {
    value: "open",
    label: "Open catalog: packages are not resolved or gated",
    hint: "packages[] is stored and served as published.",
  },
];

const POSTURE_OPTIONS: RadioOption<McpRemotePosture>[] = [
  {
    value: "approval_required",
    label: "Deny by default: an upstream server is invisible until approved",
  },
  {
    value: "allow_with_gates",
    label: "Allow with gates: lint, backing-scan, age and typosquat gates still run",
  },
];

const FLOATING_OPTIONS: RadioOption<McpOciFloatingTagPolicy>[] = [
  {
    value: "pin",
    label: "Pin",
    hint: "An upstream image named by latest or by no tag is pinned to the digest seen at sync, with a warning.",
  },
  { value: "hide", label: "Hide", hint: "Such entries are not served." },
];

const PROBE_OPTIONS: { value: McpProbeRemotes; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "hosted_only", label: "Hosted servers only" },
  { value: "all", label: "All remote servers" },
];

const REMOTE_MODE_OPTIONS: RadioOption<McpRemoteMode>[] = [
  {
    value: "allowlist",
    label: "Allowlist: sync only the names that are approved",
    hint: "Upstream names outside the approved and auto-approved namespaces are not ingested.",
  },
  {
    value: "mirror",
    label: "Mirror: sync every upstream name",
    hint: "Every name is ingested; serving is still curated by the posture above.",
  },
];

const SANDBOX_OPTIONS: { value: McpSandboxIntrospection; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
];

interface SwitchFieldProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  help: ReactNode;
}

/** A labelled switch with its explanation, the shape of every boolean setting. */
function SwitchField({ id, label, checked, onChange, disabled = false, help }: SwitchFieldProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {help}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-describedby={`${id}-help`}
      />
    </div>
  );
}

const LOCK_SWITCH_LABEL = "Lock for repository administrators";

const REGISTRY_TYPE_LABEL: Record<(typeof MCP_BACKABLE_REGISTRY_TYPES)[number], string> = {
  npm: "npm",
  pypi: "PyPI",
  nuget: "NuGet",
  cargo: "Cargo",
  oci: "OCI images",
};

const NONE = "__none__";

interface BackingPickerProps {
  idPrefix: string;
  type: (typeof MCP_BACKABLE_REGISTRY_TYPES)[number];
  selected: string | undefined;
  repositories: Repository[];
  onChange: (key: string | undefined) => void;
  readOnly: boolean;
}

function BackingPicker({ idPrefix, type, selected, repositories, onChange, readOnly }: BackingPickerProps) {
  const id = `${idPrefix}-mcp-backing-${type}`;
  const formats = MCP_BACKING_FORMATS[type];
  const options = repositories.filter((r) => formats.includes(r.format));
  // A stored mapping may name a repository this list does not carry (no read
  // grant, or past the first page); keep it selectable instead of blanking it.
  const missing = selected && !options.some((r) => r.key === selected);
  return (
    <div className="space-y-1" data-testid={`mcp-backing-${type}`}>
      <Label htmlFor={id}>{REGISTRY_TYPE_LABEL[type]}</Label>
      <Select
        value={selected ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? undefined : v)}
        disabled={readOnly}
      >
        <SelectTrigger id={id} className="w-full" aria-label={`${REGISTRY_TYPE_LABEL[type]} backing repository`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {missing && <SelectItem value={selected}>{selected}</SelectItem>}
          {options.map((r) => (
            <SelectItem key={r.key} value={r.key}>
              {`${r.key} (${r.repo_type})`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The field group
// ---------------------------------------------------------------------------

export interface McpConfigFieldsProps {
  idPrefix: string;
  repoType: string;
  value: McpConfigValue;
  onChange: (next: McpConfigValue) => void;
  /** Candidate backing repositories (filtered per registryType here). */
  repositories: Repository[];
  /** Settings to render; defaults to every setting of the repository type. */
  visibleKeys?: ReadonlySet<McpConfigKey>;
  /** Stored lock on the posture (read from the repository, not the form). */
  postureLocked?: boolean;
  /** Stored lock on the probe setting. */
  probeLocked?: boolean;
  /**
   * The viewer is an instance administrator: they may change a locked
   * setting and get the lock switches. Anyone else sees a locked setting
   * disabled with the lock indicator.
   */
  canLock?: boolean;
  readOnly?: boolean;
  /** Set on an existing repository: links to its namespace grants. */
  repoKey?: string;
  /** Remote creation wizard: offer the official reference servers pre-ticked. */
  offerOfficialPreset?: boolean;
}

export function McpConfigFields({
  idPrefix,
  repoType,
  value,
  onChange,
  repositories,
  visibleKeys,
  postureLocked = false,
  probeLocked = false,
  canLock = false,
  readOnly = false,
  repoKey,
  offerOfficialPreset = false,
}: McpConfigFieldsProps) {
  const keys = visibleKeys ?? new Set(mcpKeysForRepoType(repoType));
  const shows = (k: McpConfigKey) => keys.has(k);
  const set = (patch: Partial<McpConfigValue>) => onChange({ ...value, ...patch });
  const fid = (name: string) => `${idPrefix}-mcp-${name}`;
  // The backend refuses a locked setting from anyone but an instance
  // administrator (403), so for everyone else it is read-only.
  const postureBlocked = postureLocked && !canLock;
  const probeBlocked = probeLocked && !canLock;
  const lockSwitch = (key: "mcp_remote_posture_locked" | "mcp_probe_remotes_locked", name: string) =>
    canLock && shows(key) ? (
      <SwitchField
        id={fid(name)}
        label={LOCK_SWITCH_LABEL}
        checked={value[key]}
        onChange={(v) => set({ [key]: v } as Partial<McpConfigValue>)}
        disabled={readOnly}
        help="While locked, only an instance administrator can change this setting."
      />
    ) : null;

  const virtualNote =
    repoType === "virtual" ? (
      <p className="text-xs text-muted-foreground">
        A Virtual MCP repository merges the servers of its members; the
        policies live on each member.
      </p>
    ) : null;

  if (keys.size === 0) return virtualNote;

  const presetTicked = value.mcp_auto_approve_namespaces.includes(MCP_OFFICIAL_NAMESPACE_GLOB);

  return (
    <div className="space-y-5">
      {virtualNote}
      {shows("mcp_namespace_allow") && (
        <ChipListEditor
          id={fid("namespace-allow")}
          label="Namespace allowlist"
          values={value.mcp_namespace_allow}
          onChange={(v) => set({ mcp_namespace_allow: v })}
          validate={validateNamespacePrefix}
          placeholder="com.acme"
          readOnly={readOnly}
          help={
            <>
              <code>com.acme</code> admits <code>com.acme/x</code> and{" "}
              <code>com.acme.team/x</code>, not <code>com.acmecorp/x</code>.
              Empty admits any schema-valid name. <code>io.modelcontextprotocol</code>{" "}
              is reserved.
            </>
          }
        />
      )}

      {shows("mcp_package_policy") && (
        <RadioField
          name={fid("policy")}
          legend="Package policy"
          options={POLICY_OPTIONS}
          value={value.mcp_package_policy}
          onChange={(v) => set({ mcp_package_policy: v })}
          disabled={readOnly}
        >
          {value.mcp_package_policy === "open" && (
            <AmberNote>
              An open catalog is a list of links, not a control: nothing is
              resolved, rewritten or gated, so a held or vulnerable package
              does not hide its server.
            </AmberNote>
          )}
        </RadioField>
      )}

      {shows("mcp_package_repos") && value.mcp_package_policy === "own-repos" && (
        <div className="space-y-3" role="group" aria-labelledby={fid("backing-heading")}>
          <p id={fid("backing-heading")} className="text-sm font-medium">
            Backing repositories
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {MCP_BACKABLE_REGISTRY_TYPES.map((type) => (
              <BackingPicker
                key={type}
                idPrefix={idPrefix}
                type={type}
                selected={value.mcp_package_repos[type]}
                repositories={repositories}
                readOnly={readOnly}
                onChange={(key) =>
                  set({ mcp_package_repos: { ...value.mcp_package_repos, [type]: key } })
                }
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            A server whose package uses a registryType with no backing
            repository is refused at publish (422 mcp_external_registry).
            mcpb bundles cannot be resolved until bundle support ships.
          </p>
        </div>
      )}

      {shows("mcp_require_namespace_grant") && (
        <SwitchField
          id={fid("require-grant")}
          label="Require a namespace grant to publish"
          checked={value.mcp_require_namespace_grant}
          onChange={(v) => set({ mcp_require_namespace_grant: v })}
          disabled={readOnly}
          help={
            <>
              Plain repository write is not enough; publishers need a namespace grant.
              {repoKey && (
                <>
                  {" "}
                  <Link
                    href={`/permissions?mcp=${encodeURIComponent(repoKey)}`}
                    className="underline underline-offset-2"
                  >
                    Manage namespace grants
                  </Link>
                </>
              )}
            </>
          }
        />
      )}

      {shows("mcp_remote_posture") && (
        <RadioField
          name={fid("posture")}
          legend="Remote posture"
          options={POSTURE_OPTIONS}
          value={value.mcp_remote_posture}
          onChange={(v) => set({ mcp_remote_posture: v })}
          disabled={readOnly}
          locked={postureBlocked}
        />
      )}
      {lockSwitch("mcp_remote_posture_locked", "posture-locked")}

      {shows("mcp_remote_mode") && (
        <RadioField
          name={fid("remote-mode")}
          legend="Sync scope"
          options={REMOTE_MODE_OPTIONS}
          value={value.mcp_remote_mode}
          onChange={(v) => set({ mcp_remote_mode: v })}
          disabled={readOnly}
        />
      )}

      {shows("mcp_server_deny") && (
        <ChipListEditor
          id={fid("deny")}
          label="Deny"
          values={value.mcp_server_deny}
          onChange={(v) => set({ mcp_server_deny: v })}
          validate={validateMcpGlob}
          placeholder="io.github.*/crypto-*"
          readOnly={readOnly}
          help="Globs on the full server name. Deny always wins, even over approval."
        />
      )}

      {shows("mcp_auto_approve_namespaces") && (
        <div className="space-y-2">
          {offerOfficialPreset && !readOnly && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={presetTicked}
                onChange={(e) =>
                  set({
                    mcp_auto_approve_namespaces: e.target.checked
                      ? [...value.mcp_auto_approve_namespaces, MCP_OFFICIAL_NAMESPACE_GLOB]
                      : value.mcp_auto_approve_namespaces.filter((g) => g !== MCP_OFFICIAL_NAMESPACE_GLOB),
                  })
                }
                className="mt-1 accent-primary"
              />
              <span>Approve the official reference servers ({MCP_OFFICIAL_NAMESPACE_GLOB})</span>
            </label>
          )}
          <ChipListEditor
            id={fid("auto-approve")}
            label="Auto-approve namespaces"
            values={value.mcp_auto_approve_namespaces}
            onChange={(v) => set({ mcp_auto_approve_namespaces: v })}
            validate={validateMcpGlob}
            placeholder="io.github.acme/*"
            readOnly={readOnly}
            warnFor={(g) => (isBroadNamespaceGlob(g) ? "Broad" : null)}
            help="Servers under these namespace globs are approved without review; the gates still run. A wildcard in the namespace approves a whole family of publishers."
          />
        </div>
      )}

      {shows("mcp_oci_floating_tag_policy") && (
        <RadioField
          name={fid("floating")}
          legend="OCI floating tags"
          options={FLOATING_OPTIONS}
          value={value.mcp_oci_floating_tag_policy}
          onChange={(v) => set({ mcp_oci_floating_tag_policy: v })}
          disabled={readOnly}
        />
      )}

      {shows("mcp_probe_remotes") && (
        <div className="space-y-1" data-testid="mcp-probe">
          <div className="flex items-center gap-2">
            <Label htmlFor={fid("probe")}>Remote probe</Label>
            {probeBlocked && <LockIndicator />}
          </div>
          <Select
            value={value.mcp_probe_remotes}
            onValueChange={(v) => set({ mcp_probe_remotes: v as McpProbeRemotes })}
            disabled={readOnly || probeBlocked}
          >
            <SelectTrigger id={fid("probe")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROBE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Probing lists a remote server&apos;s tools from an isolated worker.
            It never calls a tool and never sends publisher-supplied headers.
          </p>
        </div>
      )}
      {lockSwitch("mcp_probe_remotes_locked", "probe-locked")}

      {shows("mcp_sandbox_introspection") && (
        <div className="space-y-1" data-testid="mcp-sandbox">
          <Label htmlFor={fid("sandbox")}>Sandboxed introspection</Label>
          <Select
            value={value.mcp_sandbox_introspection}
            onValueChange={(v) => set({ mcp_sandbox_introspection: v as McpSandboxIntrospection })}
            disabled={readOnly}
          >
            <SelectTrigger id={fid("sandbox")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SANDBOX_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Starts stdio servers to list their tools. Runs happen in an
            isolated sandbox worker, install only from this instance and never
            run with real credentials.
          </p>
        </div>
      )}

      {shows("mcp_require_oci_label") && (
        <SwitchField
          id={fid("require-oci-label")}
          label="Require the MCP name label on OCI images"
          checked={value.mcp_require_oci_label}
          onChange={(v) => set({ mcp_require_oci_label: v })}
          disabled={readOnly}
          help="Refuse an OCI package whose image lacks a matching io.modelcontextprotocol.server.name label. Off: publishing warns instead."
        />
      )}

      {shows("mcp_require_bundle_signature") && (
        <SwitchField
          id={fid("require-bundle-signature")}
          label="Require signed MCPB bundles"
          checked={value.mcp_require_bundle_signature}
          onChange={(v) => set({ mcp_require_bundle_signature: v })}
          disabled={readOnly}
          help="Refuse a bundle whose signature does not verify. Off: unsigned bundles are accepted and labelled unsigned; an invalid signature is always refused."
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings tab wiring
// ---------------------------------------------------------------------------

export interface McpSettingsForm {
  value: McpConfigValue;
  onChange: (next: McpConfigValue) => void;
  visibleKeys: ReadonlySet<McpConfigKey>;
  /** The update-body fields that differ from the stored settings. */
  changedFields: Partial<McpRepositorySettings>;
  changed: boolean;
  reset: () => void;
}

/**
 * Override-based form state for the Settings tab, like its npm and Debian
 * groups: the tab's save bar folds `changedFields` into the one
 * `repositoriesApi.update` call and calls `reset` after a save or discard.
 */
export function useMcpSettingsForm(repository: Repository, isInstanceAdmin = false): McpSettingsForm {
  const isMcp = hasMcpConfig(repository.format);
  const baseline = useMemo(() => mcpConfigFromRepo(repository), [repository]);
  // The locks are writable by an instance administrator only (403 for anyone
  // else), so for everyone else they are not part of the form at all.
  const visibleKeys = useMemo(
    () =>
      isMcp
        ? new Set([...mcpVisibleKeys(repository)].filter((k) => isInstanceAdmin || !MCP_LOCK_KEYS.has(k)))
        : new Set<McpConfigKey>(),
    [isMcp, repository, isInstanceAdmin],
  );
  const [override, setOverride] = useState<McpConfigValue | null>(null);
  const value = override ?? baseline;
  const changedFields = useMemo(
    () => mcpChangedFields(value, baseline, visibleKeys),
    [value, baseline, visibleKeys],
  );
  const reset = useCallback(() => setOverride(null), []);
  return {
    value,
    onChange: setOverride,
    visibleKeys,
    changedFields,
    changed: Object.keys(changedFields).length > 0,
    reset,
  };
}

interface McpSettingsSectionProps {
  repository: Repository;
  form: McpSettingsForm;
  readOnly: boolean;
  /** Instance administrator: may change locked settings and the locks. */
  canLock?: boolean;
}

/** The MCP section of the Settings tab; non-administrators see it read-only. */
export function McpSettingsSection({ repository, form, readOnly, canLock = false }: McpSettingsSectionProps) {
  const pickers = form.visibleKeys.has("mcp_package_repos");
  const { data } = useRepositories({ per_page: 1000 }, { enabled: pickers });
  return (
    <section aria-labelledby="settings-mcp-heading">
      <div className="mb-4">
        <h3 id="settings-mcp-heading" className="text-base font-semibold">
          MCP Registry
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {readOnly
            ? "Only an administrator can change these settings."
            : "Who may publish which server names, and where their packages must live."}
        </p>
      </div>
      <McpConfigFields
        idPrefix="settings"
        repoType={repository.repo_type}
        value={form.value}
        onChange={form.onChange}
        repositories={data?.items ?? []}
        visibleKeys={form.visibleKeys}
        postureLocked={repository.mcp_remote_posture_locked === true}
        probeLocked={repository.mcp_probe_remotes_locked === true}
        canLock={canLock}
        readOnly={readOnly}
        repoKey={repository.key}
      />
    </section>
  );
}
