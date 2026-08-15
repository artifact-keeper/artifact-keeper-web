// Test-only merged English catalog.
//
// Component tests render translated text through useTranslations but have no
// layout hierarchy to provide per-route message groups, so they need the full
// catalog merged into a single object. Group files never overlap at the
// top-level namespace key, so a shallow merge reproduces the pre-split
// src/i18n/locales/en.json exactly.
//
// Only used by vitest setup/tests — not imported by app code.
/* eslint-disable @typescript-eslint/no-require-imports */
const en = {};
for (const group of [
  "core",
  "auth",
  "app",
  "guides",
  "protected",
  "admin",
  "repositories",
  "packages",
  "builds",
  "search",
  "setup",
  "staging",
]) {
  Object.assign(en, require(`./en/${group}.json`));
}

module.exports = en;
