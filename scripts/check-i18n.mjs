/**
 * Validate the path-based i18n message catalogs under src/i18n/locales/{en,zh}/:
 *
 *  0. The locales tree contains ONLY .json translation files (aggregators and
 *     test helpers live outside it, under src/i18n/).
 *  1. Both locales have the same set of relative JSON files.
 *  2. Every file derives a unique namespace (route path with parens dropped;
 *     components/ and _components/ files keep their mirrored path).
 *  3. en/zh are recursively key-identical for every namespace.
 *  4. Prints per-locale and per-route-group payload sizes.
 *
 * Usage: node scripts/check-i18n.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const LOCALES_DIR = join("src", "i18n", "locales");
const locales = ["en", "zh"];

function walkAll(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walkAll(p, out);
    else out.push(p);
  }
  return out;
}

function walkJson(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walkJson(p, out);
    else if (entry.endsWith(".json")) out.push(p);
  }
  return out;
}

function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Derive a namespace from a locale-relative path (mirrors for-tests.cjs). */
function nsFromPath(rel) {
  const noExt = rel.replace(/\.json$/, "");
  const base = noExt.slice(noExt.lastIndexOf("/") + 1);
  if (rel.startsWith("core/")) return "core/" + base;
  return noExt.replace(/[()]/g, "").replace(/\/page$/, "");
}

function checkKeyParity(en, zh, pathLabel) {
  const enKeys = Object.keys(en);
  const zhKeys = Object.keys(zh);
  const onlyEn = enKeys.filter((k) => !(k in zh));
  const onlyZh = zhKeys.filter((k) => !(k in en));
  if (onlyEn.length || onlyZh.length) {
    return `key parity at "${pathLabel}": en-only=${onlyEn.join(",")} zh-only=${onlyZh.join(",")}`;
  }
  for (const key of enKeys) {
    if (isObj(en[key]) && isObj(zh[key])) {
      const err = checkKeyParity(en[key], zh[key], pathLabel ? `${pathLabel}.${key}` : key);
      if (err) return err;
    }
  }
  return null;
}

const filesByLocale = {};
for (const locale of locales) {
  filesByLocale[locale] = walkJson(join(LOCALES_DIR, locale))
    .map((p) => relative(join(LOCALES_DIR, locale), p).replace(/\\/g, "/"))
    .sort();
}

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error("FAIL: " + msg);
};

// 0. The locales tree contains ONLY json translation files.
for (const locale of locales) {
  const nonJson = walkAll(join(LOCALES_DIR, locale)).filter(
    (p) => !p.endsWith(".json"),
  );
  if (nonJson.length) {
    fail(
      `non-JSON file(s) under locales/${locale}: ` +
        nonJson.map((p) => relative(join(LOCALES_DIR, locale), p)).join(", "),
    );
  }
}

// 1. File-structure parity.
if (JSON.stringify(filesByLocale.en) !== JSON.stringify(filesByLocale.zh)) {
  fail("file list mismatch between locales");
  const enOnly = filesByLocale.en.filter((f) => !filesByLocale.zh.includes(f));
  const zhOnly = filesByLocale.zh.filter((f) => !filesByLocale.en.includes(f));
  if (enOnly.length) console.error("  en-only: " + enOnly.join(", "));
  if (zhOnly.length) console.error("  zh-only: " + zhOnly.join(", "));
}

// 2. Namespace uniqueness + 3. per-namespace en/zh parity.
function catalogFor(locale) {
  const catalog = {};
  for (const rel of filesByLocale[locale]) {
    const ns = nsFromPath(rel);
    if (catalog[ns] !== undefined) fail(`duplicate namespace "${ns}" (${rel})`);
    catalog[ns] = JSON.parse(readFileSync(join(LOCALES_DIR, locale, rel), "utf8"));
  }
  return catalog;
}
const enAll = catalogFor("en");
const zhAll = catalogFor("zh");

const onlyEnNs = Object.keys(enAll).filter((k) => !(k in zhAll));
const onlyZhNs = Object.keys(zhAll).filter((k) => !(k in enAll));
if (onlyEnNs.length || onlyZhNs.length) {
  fail(`namespace set mismatch: en-only=${onlyEnNs.join(",")} zh-only=${onlyZhNs.join(",")}`);
}
for (const ns of Object.keys(enAll)) {
  if (!(ns in zhAll)) continue;
  const err = checkKeyParity(enAll[ns], zhAll[ns], ns);
  if (err) fail(err);
}

// 4. Sizes.
const bytes = (locale) =>
  walkJson(join(LOCALES_DIR, locale)).reduce(
    (sum, f) => sum + statSync(f).size,
    0,
  );
const groupSize = (locale, dir) =>
  walkJson(join(LOCALES_DIR, locale, dir)).reduce(
    (sum, f) => sum + statSync(f).size,
    0,
  );

// 5. Coverage — every message file must be loaded by at least one layout root
//    (CORE_ROOTS + the route dirs the layouts pass). Mirrors load-messages.ts
//    so a new file that no route loads (or a root that loads nothing) fails.
const CORE_ROOTS = [
  "components",
  "core",
  "error",
  "not-found.json",
  "error.json",
  "global-error.json",
  "layout.json",
];
const ROUTE_ROOTS = [
  "(auth)",
  "(app)",
  "(app)/(admin)",
  "(app)/(protected)",
  "(app)/builds",
  "(app)/packages",
  "(app)/repositories",
  "(app)/search",
  "(app)/setup",
  "(app)/staging",
];
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
const isChildRoute = (parentDir, seg) =>
  seg.startsWith("(") || (parentDir === "(app)" && APP_CHILD_ROUTES.has(seg));
function namespacesUnder(root, files) {
  if (root.endsWith(".json")) {
    const f = files.find((x) => x.rel === root);
    return f ? [f.ns] : [];
  }
  const prefix = root ? root + "/" : "";
  const out = [];
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
const covered = new Set();
const enFiles = filesByLocale.en.map((rel) => ({ rel, ns: nsFromPath(rel) }));
for (const root of [...CORE_ROOTS, ...ROUTE_ROOTS]) {
  for (const ns of namespacesUnder(root, enFiles)) covered.add(ns);
}
const uncovered = Object.keys(enAll).filter((ns) => !covered.has(ns));
if (uncovered.length) {
  fail("namespaces not loaded by any layout root (CORE_ROOTS + route dirs): " + uncovered.join(", "));
}

console.log("files: en=" + filesByLocale.en.length + " zh=" + filesByLocale.zh.length);
console.log("namespaces: " + Object.keys(enAll).length);
console.log("en total: " + (bytes("en") / 1024).toFixed(1) + " KB");
console.log("zh total: " + (bytes("zh") / 1024).toFixed(1) + " KB");
for (const dir of ["core", "error", "(auth)", "(app)", "(app)/(protected)", "(app)/(admin)", "(app)/repositories", "(app)/packages", "(app)/builds", "(app)/search", "(app)/setup", "(app)/staging", "components"]) {
  const label = dir.replace("(app)/", "").replace("(app)", "app") || "(root)";
  console.log(`  ${label}: ${(groupSize("en", dir) / 1024).toFixed(1)} KB`);
}

if (failed) process.exit(1);
console.log("OK: catalogs are structurally consistent and en/zh key-parity holds.");


