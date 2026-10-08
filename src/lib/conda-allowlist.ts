/**
 * Package allowlist on a virtual conda channel (#971, backend
 * artifact-keeper#4576): entry validation that mirrors the backend limits,
 * the bulk-paste line format, and the lockfile extraction behind "the
 * lockfile is the allowlist".
 *
 * An entry is `{ name, version?, subdirs? }`: `name` is an exact conda package
 * name or a `*`/`?` glob (case-insensitive), `version` an optional conda
 * version spec, `subdirs` an optional platform restriction. The backend parses
 * version specs with rattler; the console only checks their length and leaves
 * the grammar to the backend, whose 400 names the entry (`entries[N]: ...`).
 */

import { parseCondaFilename } from "@/lib/conda";

export interface AllowlistEntry {
  name: string;
  /** Conda version spec. Omitted: every version. */
  version?: string;
  /** Platforms the entry applies to. Omitted or empty: every subdir. */
  subdirs?: string[];
}

/** Backend limits (`conda_allowlist.rs`). */
export const ALLOWLIST_LIMITS = {
  maxEntries: 10_000,
  maxNameBytes: 128,
  maxVersionBytes: 256,
  maxSubdirs: 32,
  maxSubdirBytes: 32,
} as const;

/** The audit action every allowlist change records. */
export const ALLOWLIST_AUDIT_ACTION = "REPOSITORY_ALLOWLIST_CHANGED";

const NAME_RE = /^[a-z0-9_.\-*?]+$/;
const SUBDIR_RE = /^[a-z0-9_-]+$/;

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * Why the backend would refuse this entry, or null when it would accept it
 * (as far as the console can tell: version-spec grammar is checked server
 * side). Mirrors `compile_entry`: the name is trimmed and lower-cased before
 * the character check, so `NumPy` is fine and `num py` is not.
 */
export function validateAllowlistEntry(entry: AllowlistEntry): string | null {
  const name = entry.name.trim().toLowerCase();
  if (!name) return "Name is required.";
  if (byteLength(name) > ALLOWLIST_LIMITS.maxNameBytes) {
    return `Name exceeds ${ALLOWLIST_LIMITS.maxNameBytes} bytes.`;
  }
  if (!NAME_RE.test(name)) {
    return "Conda names use a-z, 0-9, _ . - (plus * and ? as globs).";
  }
  const version = entry.version?.trim() ?? "";
  if (byteLength(version) > ALLOWLIST_LIMITS.maxVersionBytes) {
    return `Version exceeds ${ALLOWLIST_LIMITS.maxVersionBytes} bytes.`;
  }
  const subdirs = entry.subdirs ?? [];
  if (subdirs.length > ALLOWLIST_LIMITS.maxSubdirs) {
    return `At most ${ALLOWLIST_LIMITS.maxSubdirs} subdirs per entry.`;
  }
  for (const raw of subdirs) {
    const s = raw.trim();
    if (!s || byteLength(s) > ALLOWLIST_LIMITS.maxSubdirBytes || !SUBDIR_RE.test(s)) {
      return `"${raw}" is not a conda subdir (e.g. noarch, linux-64).`;
    }
  }
  return null;
}

/** Split a comma- or space-separated subdir field into its parts. */
export function splitSubdirs(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The entry as the API takes it: trimmed, `version` dropped when empty or
 * `*` (both mean every version), `subdirs` dropped when empty.
 */
export function normalizeAllowlistEntry(entry: AllowlistEntry): AllowlistEntry {
  const out: AllowlistEntry = { name: entry.name.trim() };
  const version = entry.version?.trim();
  if (version && version !== "*") out.version = version;
  const subdirs = (entry.subdirs ?? []).map((s) => s.trim()).filter(Boolean);
  if (subdirs.length > 0) out.subdirs = subdirs;
  return out;
}

export interface LineError {
  /** 1-based line number. */
  line: number;
  message: string;
}

/**
 * Parse the bulk-paste format: one `name[ version][ subdir,subdir]` per line.
 * Blank lines and `#` comments are skipped; `*` as the version means every
 * version, so `numpy * linux-64` restricts only the platform.
 */
export function parseAllowlistLines(text: string): {
  entries: AllowlistEntry[];
  errors: LineError[];
} {
  const entries: AllowlistEntry[] = [];
  const errors: LineError[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const parts = line.split(/\s+/);
    if (parts.length > 3) {
      errors.push({
        line: i + 1,
        message: "Expected `name [version] [subdir,subdir]`; a version spec takes no spaces.",
      });
      return;
    }
    const entry = normalizeAllowlistEntry({
      name: parts[0],
      version: parts[1],
      subdirs: parts[2] ? splitSubdirs(parts[2]) : undefined,
    });
    const problem = validateAllowlistEntry(entry);
    if (problem) {
      errors.push({ line: i + 1, message: problem });
      return;
    }
    entries.push(entry);
  });
  return { entries, errors };
}

/** One entry as a bulk-paste line (the inverse of `parseAllowlistLines`). */
export function formatAllowlistLine(entry: AllowlistEntry): string {
  const parts = [entry.name];
  const subdirs = entry.subdirs ?? [];
  if (entry.version || subdirs.length > 0) parts.push(entry.version || "*");
  if (subdirs.length > 0) parts.push(subdirs.join(","));
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Lockfiles
// ---------------------------------------------------------------------------

export type LockfileKind = "pixi.lock" | "conda-lock.yml";

export interface LockfileImport {
  kind: LockfileKind;
  /** One entry per (name, exact version), subdirs merged and sorted. */
  entries: AllowlistEntry[];
  /** Conda packages read, before grouping (a package locked for two platforms counts twice). */
  packages: number;
  /** Entries per subdir, e.g. `{ "linux-64": 31, noarch: 12 }`. */
  subdirCounts: Record<string, number>;
}

function unquote(v: string): string {
  const s = v.trim();
  if (s.length >= 2 && (s[0] === "'" || s[0] === '"') && s[s.length - 1] === s[0]) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * The scalar fields of each item in the top-level YAML list under `key`
 * (`packages:` in pixi.lock, `package:` in conda-lock.yml). The item's own
 * keys sit two columns right of its `-`; nested mappings and lists are
 * skipped. Enough YAML for the two lockfile formats, which tools write in
 * block style, without a YAML dependency.
 */
function topLevelListItems(text: string, key: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trimEnd() === `${key}:`);
  if (start < 0) return [];
  const items: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  let dashIndent = -1;
  const field = (s: string, into: Record<string, string>) => {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(s);
    if (m && m[2] !== "") into[m[1]] = unquote(m[2]);
  };
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    // The next top-level key ends the list.
    if (indent === 0 && !line.startsWith("-")) break;
    const body = line.trimStart();
    if (body.startsWith("- ") && (dashIndent < 0 || indent === dashIndent)) {
      dashIndent = indent;
      current = {};
      items.push(current);
      field(body.slice(2), current);
    } else if (current && indent === dashIndent + 2) {
      field(body, current);
    }
  }
  return items;
}

function urlParts(url: string | undefined): { file?: string; subdir?: string } {
  if (!url) return {};
  const segs = url.split(/[?#]/)[0].split("/").filter(Boolean);
  return { file: segs[segs.length - 1], subdir: segs[segs.length - 2] };
}

interface LockedPackage {
  name: string;
  version: string;
  subdir?: string;
}

/**
 * The conda packages a lock pins, from the package's URL (the file name is
 * `<name>-<version>-<build>.conda|.tar.bz2`, the parent directory its
 * subdir), with explicit `name`, `version` and `subdir` fields taking
 * precedence when the lock carries them. The parent directory wins over a
 * `platform` field: conda-lock lists a noarch package under each platform it
 * was solved for.
 */
function lockedPackage(fields: Record<string, string>, url: string | undefined): LockedPackage | null {
  const { file, subdir } = urlParts(url);
  const parsed = file ? parseCondaFilename(file) : undefined;
  const name = fields.name ?? parsed?.name;
  const version = fields.version ?? parsed?.version;
  if (!name || !version) return null;
  return { name, version, subdir: fields.subdir ?? subdir ?? fields.platform };
}

function pixiPackages(text: string): LockedPackage[] {
  const out: LockedPackage[] = [];
  for (const item of topLevelListItems(text, "packages")) {
    // pixi.lock v6+: `- conda: <url>`; v4/v5: `- kind: conda` with `url:`.
    const url = item.conda ?? (item.kind === "conda" ? item.url : undefined);
    if (url === undefined) continue; // pypi and source packages
    const pkg = lockedPackage(item, url);
    if (pkg) out.push(pkg);
  }
  return out;
}

function condaLockPackages(text: string): LockedPackage[] {
  const out: LockedPackage[] = [];
  for (const item of topLevelListItems(text, "package")) {
    if ((item.manager ?? "conda") !== "conda") continue;
    const pkg = lockedPackage(item, item.url);
    if (pkg) out.push(pkg);
  }
  return out;
}

/** Which lockfile this is, from its file name and then its content. */
export function detectLockfile(text: string, filename?: string): LockfileKind | null {
  const base = filename?.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (base.endsWith(".lock") && base.includes("pixi")) return "pixi.lock";
  if (/^package:\s*$/m.test(text)) return "conda-lock.yml";
  if (/^packages:\s*$/m.test(text)) return "pixi.lock";
  return null;
}

/**
 * Group locked packages into allowlist entries the way the walkthrough's
 * `allowlist/from-lock.sh` does: one entry per (name, exact version), with
 * the subdirs it was locked for, sorted by name then version.
 */
export function entriesFromLockedPackages(pkgs: LockedPackage[]): AllowlistEntry[] {
  const groups = new Map<string, { name: string; version: string; subdirs: Set<string> }>();
  for (const p of pkgs) {
    const k = `${p.name}\u0000${p.version}`;
    let g = groups.get(k);
    if (!g) {
      g = { name: p.name, version: p.version, subdirs: new Set() };
      groups.set(k, g);
    }
    if (p.subdir) g.subdirs.add(p.subdir);
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...groups.values()]
    .sort((a, b) => cmp(a.name, b.name) || cmp(a.version, b.version))
    .map((g) =>
      normalizeAllowlistEntry({ name: g.name, version: g.version, subdirs: [...g.subdirs].sort() }),
    );
}

/**
 * Read a `pixi.lock` or `conda-lock.yml` and return the allowlist entries for
 * the conda packages it locks (PyPI packages are skipped). Null when the text
 * is neither format.
 */
export function parseLockfile(text: string, filename?: string): LockfileImport | null {
  const kind = detectLockfile(text, filename);
  if (!kind) return null;
  const pkgs = kind === "pixi.lock" ? pixiPackages(text) : condaLockPackages(text);
  const entries = entriesFromLockedPackages(pkgs);
  const subdirCounts: Record<string, number> = {};
  for (const e of entries) {
    for (const s of e.subdirs ?? []) subdirCounts[s] = (subdirCounts[s] ?? 0) + 1;
  }
  return { kind, entries, packages: pkgs.length, subdirCounts };
}

// ---------------------------------------------------------------------------
// Merging and backend messages
// ---------------------------------------------------------------------------

function entryKey(e: AllowlistEntry): string {
  return `${e.name.trim().toLowerCase()}\u0000${e.version?.trim() ?? ""}`;
}

/**
 * Add `incoming` to `existing`. An incoming entry with the same name and
 * version as an existing one widens its subdirs instead of adding a row (an
 * entry without subdirs already admits every subdir and stays that way).
 */
export function mergeAllowlistEntries(
  existing: AllowlistEntry[],
  incoming: AllowlistEntry[],
): { entries: AllowlistEntry[]; added: number; updated: number } {
  const entries = existing.map((e) => ({ ...e }));
  const index = new Map<string, number>();
  entries.forEach((e, i) => {
    if (!index.has(entryKey(e))) index.set(entryKey(e), i);
  });
  let added = 0;
  let updated = 0;
  for (const raw of incoming) {
    const e = normalizeAllowlistEntry(raw);
    const at = index.get(entryKey(e));
    if (at === undefined) {
      index.set(entryKey(e), entries.length);
      entries.push(e);
      added++;
      continue;
    }
    const cur = entries[at];
    const curSubdirs = cur.subdirs ?? [];
    const newSubdirs = e.subdirs ?? [];
    if (curSubdirs.length === 0) continue;
    if (newSubdirs.length === 0) {
      delete cur.subdirs;
      updated++;
      continue;
    }
    const union = [...new Set([...curSubdirs, ...newSubdirs])];
    if (union.length !== curSubdirs.length) {
      cur.subdirs = union;
      updated++;
    }
  }
  return { entries, added, updated };
}

/** The entry index a backend refusal names (`entries[3]: ...`), if any. */
export function backendEntryIndex(message: string | null | undefined): number | null {
  const m = /entries\[(\d+)\]/.exec(message ?? "");
  return m ? Number(m[1]) : null;
}

/** "on, 43 entries" style summary of a list's state. */
export function allowlistStateLabel(enabled: boolean, count: number): string {
  return `${enabled ? "on" : "off"}, ${count} ${count === 1 ? "entry" : "entries"}`;
}

function auditSide(v: unknown): string | null {
  if (v === null || v === undefined) return "none";
  if (typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (r.unusable === true) return "unreadable";
  if (typeof r.enabled !== "boolean" || typeof r.entry_count !== "number") return null;
  return allowlistStateLabel(r.enabled, r.entry_count);
}

/**
 * One-line rendering of a `REPOSITORY_ALLOWLIST_CHANGED` audit event's
 * details (`{repository, previous, current}`, each side `{enabled,
 * entry_count}`, `{unusable: true}` or null), e.g.
 * `conda-virtual: off, 43 → on, 43 entries`. Null when the details do
 * not have that shape.
 */
export function describeAllowlistAudit(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;
  if (!("previous" in d) || !("current" in d)) return null;
  const prev = auditSide(d.previous);
  const cur = auditSide(d.current);
  if (prev === null || cur === null) return null;
  const repo = typeof d.repository === "string" ? `${d.repository}: ` : "";
  if (d.current === null) return `${repo}allowlist removed (was ${prev})`;
  // Both sides counted: name the unit once so the line fits the column.
  const counted = /^(on|off), (\d+) entr(?:y|ies)$/;
  const p = counted.exec(prev);
  const c = counted.exec(cur);
  if (p && c) return `${repo}${p[1]}, ${p[2]} → ${c[1]}, ${c[2]} ${c[2] === "1" ? "entry" : "entries"}`;
  return `${repo}${prev} → ${cur}`;
}
