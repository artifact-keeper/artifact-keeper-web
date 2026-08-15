import type { AbstractIntlMessages } from "next-intl";
import type { MessageGroup } from "./groups";

/**
 * Per-route message loader.
 *
 * Catalogs are split by functional domain (see src/i18n/groups.ts), so a
 * route only loads the groups it needs and sends those to the client via a
 * nested `NextIntlClientProvider`. Groups are merged at the top level
 * (namespace keys never overlap across groups), so a shallow merge is
 * correct.
 *
 * Each importer uses a single-variable dynamic import (like request.ts) so
 * the bundler can resolve the locale at build time.
 */
const importers = {
  core: (locale: string) => import(`./locales/${locale}/core.json`),
  auth: (locale: string) => import(`./locales/${locale}/auth.json`),
  app: (locale: string) => import(`./locales/${locale}/app.json`),
  guides: (locale: string) => import(`./locales/${locale}/guides.json`),
  protected: (locale: string) =>
    import(`./locales/${locale}/protected.json`),
  admin: (locale: string) => import(`./locales/${locale}/admin.json`),
  repositories: (locale: string) =>
    import(`./locales/${locale}/repositories.json`),
  packages: (locale: string) => import(`./locales/${locale}/packages.json`),
  builds: (locale: string) => import(`./locales/${locale}/builds.json`),
  search: (locale: string) => import(`./locales/${locale}/search.json`),
  setup: (locale: string) => import(`./locales/${locale}/setup.json`),
  staging: (locale: string) => import(`./locales/${locale}/staging.json`),
} satisfies Record<MessageGroup, (locale: string) => Promise<unknown>>;

/**
 * Load and merge the given message groups for a locale.
 *
 * @example
 *   const messages = await loadMessages(locale, ["core", "app", "repositories"]);
 */
export async function loadMessages(
  locale: string,
  groups: readonly MessageGroup[],
): Promise<AbstractIntlMessages> {
  const mods = await Promise.all(
    groups.map((group) => importers[group](locale)),
  );
  return Object.assign(
    {},
    ...mods.map((mod) => (mod as { default: AbstractIntlMessages }).default),
  );
}
