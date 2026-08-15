/**
 * i18n message group manifest.
 *
 * Message catalogs live under src/i18n/locales/{en,zh}/<group>.json and are
 * split by functional domain so each route only loads the groups it needs
 * (per-route lazy loading via NextIntlClientProvider — see
 * src/i18n/load-messages.ts). The mapping below is the correspondence between
 * each group and the routes/modules that consume it.
 *
 *   core           Always loaded on EVERY page (root provider + all routes).
 *                  - common          → shared components: data tables +
 *                    pagination, file browser/viewer/upload, confirm dialogs,
 *                    quarantine banners/badges, quick search, password-policy
 *                    hint, auth guards (require-auth/admin), error page, …
 *                  - ui              → shadcn base components aria labels
 *                    (dialog / sheet / sidebar / command / breadcrumb)
 *                  - errorPages      → /error/403, /error/500
 *                  - authError       → (auth)/error boundary
 *                  - severity        → severity labels shared by the
 *                    dashboard, repositories security tab and admin pages
 *                  - localeSwitcher  → language switcher (app header + login)
 *
 *   auth           (auth) layout → /login, /callback (SSO), /change-password
 *
 *   app            (app) layout = the authenticated app shell: sidebar,
 *                  header, demo banner, password-expiry banner, instance
 *                  switcher, skip-nav link — plus the dashboard landing page
 *                  (app)/page.tsx (no own layout)
 *
 *   guides         RepoSetupGuide component → the repositories detail "setup"
 *                  tab AND the /setup page (loaded by both layouts)
 *
 *   protected      (protected) layout → /access-tokens, /peers, /plugins,
 *                  /profile, /replication, /webhooks
 *
 *   admin          (admin) layout → every /admin/* page
 *
 *   repositories   /repositories (list) and /repositories/[key] (detail):
 *                  detail dialogs, settings, labels, storage/folder storage,
 *                  artifact browser/versions/scans/tree, docker tags, Maven
 *                  components, package dependencies/metadata, format config,
 *                  PyPI tracks, release target, virtual members, routing
 *                  rules, notifications, security, SBOM, packages tab, health
 *
 *   packages       /packages (list) and /packages/[id] (detail)
 *
 *   builds         /builds
 *
 *   search         /search
 *
 *   setup          /setup (setup-guide page shell; the RepoSetupGuide content
 *                  itself lives in the `guides` group)
 *
 *   staging        /staging and /staging/[key]: list, detail, promote/reject
 *                  dialogs, promotion history
 */
export const messageGroups = {
  "core": [
    "common",
    "ui",
    "errorPages",
    "authError",
    "severity",
    "localeSwitcher"
  ],
  "auth": [
    "login",
    "ssoCallback",
    "changePassword"
  ],
  "app": [
    "sidebar",
    "header",
    "demoBanner",
    "passwordExpiry",
    "instanceSwitcher",
    "skipNav",
    "dashboard"
  ],
  "guides": [
    "setupGuide"
  ],
  "protected": [
    "accessTokens",
    "peers",
    "plugins",
    "profile",
    "replication",
    "webhooks"
  ],
  "admin": [
    "adminAgeGate",
    "adminAnalytics",
    "adminApprovals",
    "adminAudit",
    "adminBackups",
    "adminBlastRadius",
    "adminCuration",
    "adminCurationRules",
    "adminDownloads",
    "adminDtProjectDetail",
    "adminDtProjects",
    "adminError",
    "adminFormatHandlers",
    "adminGroups",
    "adminLicensePolicies",
    "adminLifecycle",
    "adminMigration",
    "adminMonitoring",
    "adminPermissions",
    "adminPromotionRules",
    "adminQualityChecks",
    "adminQualityGates",
    "adminRateLimits",
    "adminScanDetail",
    "adminScans",
    "adminSecurity",
    "adminSecurityPolicies",
    "adminServiceAccounts",
    "adminSettings",
    "adminSettingsSso",
    "adminSigning",
    "adminSyncPolicies",
    "adminSystemHealth",
    "adminTelemetry",
    "adminUsers"
  ],
  "repositories": [
    "repositories",
    "repoDetail",
    "repoDialogs",
    "repoSettings",
    "repoLabels",
    "folderStorage",
    "artifactBrowser",
    "artifactScans",
    "artifactVersions",
    "artifactTree",
    "mavenComponents",
    "dockerTags",
    "packageDependencies",
    "packageMetadata",
    "formatConfig",
    "pypiTracks",
    "releaseTarget",
    "virtualMembers",
    "routingRules",
    "notifications",
    "securityTab",
    "sbom",
    "packagesTab",
    "health",
    "storage"
  ],
  "packages": [
    "packages",
    "packageDetail"
  ],
  "builds": [
    "builds"
  ],
  "search": [
    "search"
  ],
  "setup": [
    "setup"
  ],
  "staging": [
    "staging",
    "rejection",
    "promotion",
    "promotionHistory"
  ]
} as const;

export type MessageGroup = keyof typeof messageGroups;

/** All group names, for test setups that need the full catalog. */
export const ALL_GROUPS = Object.keys(messageGroups) as MessageGroup[];
