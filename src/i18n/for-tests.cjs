// Test-only merged English catalog.
//
// Component tests render translated text through useTranslations but have no
// layout hierarchy to provide per-route message groups, so they need the full
// catalog merged into a single object keyed by namespace. The catalog is one
// flat JSON file per page/component, mirrored under src/app and src/components:
// a page's namespace is its route path with parens dropped (e.g.
// (app)/(admin)/migration/page.json -> "app/admin/migration"), a component's
// namespace is its mirrored path ((app)/repositories/_components/repo-detail-content.json
// -> "app/repositories/_components/repo-detail-content", components/ui/button.json
// -> "components/ui/button"). This file derives each namespace from its
// relative path and merges them.
//
// Only used by vitest setup/tests — not imported by app code.
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

function nsFromPath(rel) {
  const noExt = rel.replace(/\.json$/, "");
  const base = noExt.slice(noExt.lastIndexOf("/") + 1);
  if (rel.startsWith("core/")) return "core/" + base;
  return noExt.replace(/[()]/g, "").replace(/\/page$/, "");
}

const EN_DIR = path.join(__dirname, "locales", "en");
const en = {};
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith(".json")) {
      const fullRel = path.relative(EN_DIR, p).replace(/\\/g, "/");
      en[nsFromPath(fullRel)] = require(p);
    }
  }
})(EN_DIR);

module.exports = en;
