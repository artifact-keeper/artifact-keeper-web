import type { AbstractIntlMessages } from "next-intl";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Message loader.
 *
 * Catalogs live under `src/i18n/locales/{en,zh}/`, mirroring the source tree:
 * every `page.tsx` under `src/app` has a matching `page.json` at the same
 * route-group path, and every component under `src/components` or an app
 * `_components/` folder has its own `*.json` at the mirrored path. Each file
 * is flat (its keys are the message keys directly), and a page/component's
 * namespace is its locale-relative path with route-group parens dropped
 * (`(app)/(admin)/migration/page.json` → `useTranslations("app/admin/migration")`,
 * `(app)/repositories/_components/repo-detail-content.json` →
 * `useTranslations("app/repositories/_components/repo-detail-content")`).
 *
 * `loadMessages(locale, roots)` loads every message file under the given
 * locale-relative roots (directories or single files) — no namespace lists,
 * no aggregators. The shared set is loaded globally via `CORE_ROOTS` (shared
 * components + severity + the root special files); each route layout composes
 * it with its own route directory(s). Because nested providers REPLACE (not
 * merge) messages, a nested provider must include every root its ancestors
 * provided. When a directory is loaded, directories that are themselves
 * child routes (route groups like `(admin)`, or the named sub-routes under
 * `(app)`) are excluded — they own their messages via their own layout. The
 * `locales/` tree contains ONLY JSON and is read directly from disk
 * (server-only: layouts + request.ts), parsed once per process in production
 * and re-scanned on every call in dev, so adding a message file needs no
 * regeneration step.
 */

/** Globally loaded message roots: shared components, severity and the root
 * special files (not-found, root error, global-error, metadata layout). */
export const CORE_ROOTS = [
  "components",
  "core",
  "error",
  "not-found.json",
  "error.json",
  "global-error.json",
  "layout.json",
] as const;

/** Directories under `(app)` that are their own routes (own layout/provider)
 * and therefore own their message subtree — `(app)` must exclude them. */
const APP_CHILD_ROUTES = new Set([
  "(admin)",
  "(protected)",
  "builds",
  "packages",
  "repositories",
  "search",
  "setup",
  "staging",
]);

type MessageMap = Record<string, unknown>;

/** Locate the catalogs dir in dev and in the standalone production build. */
function resolveLocalesDir(): string {
  const candidates: string[] = [
    join(process.cwd(), "src", "i18n", "locales"), // dev + docker (cwd = standalone root)
  ];
  if (typeof __dirname === "string") {
    candidates.push(join(__dirname, "locales")); // dev: this file lives at src/i18n/
    candidates.push(
      join(__dirname, "..", "..", "..", "src", "i18n", "locales"), // standalone compiled chunk
    );
  }
  return candidates.find((c) => existsSync(join(c, "en"))) ?? candidates[0];
}

const LOCALES_DIR = resolveLocalesDir();

function walkJson(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walkJson(p, out);
    else if (entry.endsWith(".json")) out.push(p);
  }
  return out;
}

/** Namespace from a locale-relative path (mirrors for-tests.cjs / check-i18n). */
function nsFromPath(rel: string): string {
  const noExt = rel.replace(/\.json$/, "");
  const base = noExt.slice(noExt.lastIndexOf("/") + 1);
  if (rel.startsWith("core/")) return "core/" + base;
  return noExt.replace(/[()]/g, "").replace(/\/page$/, "");
}

/** Read every message file for a locale: rel path + parsed object. */
function loadAll(locale: string): Array<{ rel: string; ns: string; obj: unknown }> {
  const root = join(LOCALES_DIR, locale);
  const out: Array<{ rel: string; ns: string; obj: unknown }> = [];
  for (const abs of walkJson(root)) {
    const rel = abs.slice(root.length + 1).replace(/\\/g, "/");
    out.push({ rel, ns: nsFromPath(rel), obj: JSON.parse(readFileSync(abs, "utf8")) });
  }
  return out;
}

// Parsed once per process in production; re-scanned on every call in dev so
// newly added message files are picked up without regenerating anything.
let prodCatalog: Record<string, Array<{ rel: string; ns: string; obj: unknown }>> | null = null;

function allFor(locale: string): Array<{ rel: string; ns: string; obj: unknown }> {
  if (process.env.NODE_ENV === "production") {
    if (!prodCatalog) {
      prodCatalog = {};
      for (const loc of ["en", "zh"]) prodCatalog[loc] = loadAll(loc);
    }
    return prodCatalog[locale] ?? [];
  }
  return loadAll(locale);
}

/** Is this subdirectory a child route that owns its own message subtree? */
function isChildRoute(parentDir: string, seg: string): boolean {
  if (seg.startsWith("(")) return true; // route-group dirs are always separate routes
  return parentDir === "(app)" && APP_CHILD_ROUTES.has(seg);
}

/** Namespaces owned by a root (a locale-relative dir, or a single file). */
function namespacesUnder(root: string, files: Array<{ rel: string; ns: string }>): string[] {
  if (root.endsWith(".json")) {
    const f = files.find((x) => x.rel === root);
    return f ? [f.ns] : [];
  }
  const prefix = root ? root + "/" : "";
  const out: string[] = [];
  for (const f of files) {
    if (!f.rel.startsWith(prefix)) continue;
    const segs = f.rel.slice(prefix.length).split("/");
    let dir = root;
    let skip = false;
    for (const seg of segs.slice(0, -1)) {
      if (isChildRoute(dir, seg)) {
        skip = true;
        break;
      }
      dir = dir ? dir + "/" + seg : seg;
    }
    if (!skip) out.push(f.ns);
  }
  return out;
}

/**
 * Load every namespace under the given locale-relative roots and merge them at
 * the top level (namespace keys never overlap, so a shallow merge is correct).
 *
 * @example
 *   const messages = loadMessages(locale, [...CORE_ROOTS, "(app)", "(app)/(admin)"]);
 */
export function loadMessages(
  locale: string,
  roots: readonly string[],
): AbstractIntlMessages {
  const files = allFor(locale);
  const out: MessageMap = {};
  for (const root of roots) {
    for (const ns of namespacesUnder(root, files)) {
      const f = files.find((x) => x.ns === ns);
      if (f) out[ns] = f.obj;
    }
  }
  return out as AbstractIntlMessages;
}
