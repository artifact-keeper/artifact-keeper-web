import type { AbstractIntlMessages } from "next-intl";

/**
 * Per-route message loader.
 *
 * Catalogs are split by functional domain under `src/i18n/locales/{en,zh}/`,
 * so a route only loads the groups it needs and sends those to the client via
 * a nested `NextIntlClientProvider`. Groups are merged at the top level
 * (namespace keys never overlap across groups), so a shallow merge is
 * correct. The group names are the single source of truth — `MessageGroup`
 * is derived from the importers below.
 *
 * Group → route/module correspondence:
 *   core         every page (root + error pages): common, ui, errorPages,
 *                authError, severity, localeSwitcher
 *   auth         (auth) layout → /login, /callback (SSO), /change-password
 *   app          (app) layout = the authenticated app shell (sidebar, header,
 *                demo + password-expiry banners, instance switcher, skip-nav)
 *                plus the dashboard landing page (/)
 *   guides       RepoSetupGuide → the repositories detail "setup" tab AND the
 *                /setup page
 *   protected    (protected) layout → /access-tokens, /peers, /plugins,
 *                /profile, /replication, /webhooks
 *   admin        (admin) layout → every /admin/* page, nested under a single
 *                top-level `admin` key (useTranslations("admin.users") …)
 *   repositories /repositories and /repositories/[key] (list + every detail
 *                tab: artifacts, packages, security, SBOM, health, settings,
 *                labels, storage, members, tracks, routing rules, …)
 *   packages     /packages and /packages/[id]
 *   builds       /builds
 *   search       /search
 *   setup        /setup (setup-guide page shell)
 *   staging      /staging and /staging/[key]
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
};

/** Union of the loadable message group names. */
export type MessageGroup = keyof typeof importers;

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
