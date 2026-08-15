/**
 * Validate the split i18n message catalogs under src/i18n/locales/{en,zh}/:
 *
 *  1. Every group file exists for both locales.
 *  2. Namespace keys never overlap across group files.
 *  3. en/zh catalogs are deep-key identical (no missing/mismatched keys).
 *  4. Prints per-group and total payload sizes.
 *
 * Usage: node scripts/check-i18n.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LOCALES_DIR = join("src", "i18n", "locales");
const locales = ["en", "zh"];

function loadGroups(locale) {
  const dir = join(LOCALES_DIR, locale);
  const groups = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    groups[file.replace(/\.json$/, "")] = JSON.parse(
      readFileSync(join(dir, file), "utf8"),
    );
  }
  return groups;
}

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error("FAIL: " + msg);
};

const enGroups = loadGroups("en");
const zhGroups = loadGroups("zh");

// 1. Group file parity.
const enNames = Object.keys(enGroups).sort();
const zhNames = Object.keys(zhGroups).sort();
if (JSON.stringify(enNames) !== JSON.stringify(zhNames)) {
  fail(
    `group file mismatch: en=${enNames.join(",")} zh=${zhNames.join(",")}`,
  );
}

// 2. Namespace overlap + 3. en/zh deep-key parity.
const seen = new Set();
for (const group of enNames) {
  const en = enGroups[group];
  const zh = zhGroups[group];
  for (const ns of Object.keys(en)) {
    if (seen.has(ns)) fail(`namespace "${ns}" appears in multiple groups`);
    seen.add(ns);
  }
  const missing = Object.keys(en).filter((k) => !(k in zh));
  const extra = Object.keys(zh).filter((k) => !(k in en));
  if (missing.length || extra.length) {
    fail(
      `group "${group}" en/zh top-level mismatch: en-only=${missing.join(",")} zh-only=${extra.join(",")}`,
    );
  }
  for (const ns of Object.keys(en)) {
    const a = en[ns];
    const b = zh[ns];
    if (typeof a === "object" && typeof b === "object") {
      const aKeys = JSON.stringify(Object.keys(a).sort());
      const bKeys = JSON.stringify(Object.keys(b).sort());
      if (aKeys !== bKeys) {
        fail(`group "${group}" namespace "${ns}" nested keys differ`);
      }
    }
  }
}

// 4. Sizes.
const bytes = (locale) =>
  readdirSync(join(LOCALES_DIR, locale))
    .filter((f) => f.endsWith(".json"))
    .reduce((sum, f) => sum + readFileSync(join(LOCALES_DIR, locale, f)).length, 0);

console.log("groups: " + enNames.join(", "));
console.log("namespaces: " + seen.size);
console.log("en total: " + (bytes("en") / 1024).toFixed(1) + " KB");
console.log("zh total: " + (bytes("zh") / 1024).toFixed(1) + " KB");
for (const group of enNames) {
  const size = (bytes2("en", group) / 1024).toFixed(1);
  console.log(`  ${group}: ${size} KB (${Object.keys(enGroups[group]).length} ns)`);
}
function bytes2(locale, group) {
  return readFileSync(join(LOCALES_DIR, locale, `${group}.json`)).length;
}

if (failed) {
  process.exit(1);
}
console.log("OK: catalogs are consistent and complete.");
