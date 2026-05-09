# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **`release/1.1.x` maintenance branch + `:1.1-dev` Docker tag rule** (#331) - mirrors `artifact-keeper#890`; pushes to `release/1.1.x` now publish `ghcr.io/artifact-keeper/artifact-keeper-web:1.1-dev` so the v1.1.x release-gate can test a true v1.1.x web/backend pair.

### Changed
- **Type-safe API layer — extend #206 hardening to telemetry** (#359 batch 3) - replaced all 9 `as never` casts in `src/lib/api/telemetry.ts` with adapter functions, `assertData` guards, and explicit body forwarding. CrashReport's optional+nullable fields (`stack_trace`, `os_info`, `uptime_seconds`, `submitted_at`, `submission_error`) now normalize undefined → null. Pages that consume this API are unchanged.
- **Type-safe API layer — extend #206 hardening to webhooks + analytics** (#359 batch 2) - replaced all 9 `as never` casts in `src/lib/api/webhooks.ts` and all 11 in `src/lib/api/analytics.ts` with adapter functions, `assertData` guards, and `narrowEnum` for the `WebhookEvent` string-to-union narrowing. Webhook events that the web doesn't model yet now fall back to `artifact_uploaded` with a console warning instead of crashing render code expecting a known event. Pages that consume these APIs are unchanged.
- **Type-safe API layer — extend #206 hardening to monitoring + lifecycle** (#359 batch 1) - replaced all `as never` casts in `src/lib/api/monitoring.ts` and `src/lib/api/lifecycle.ts` with adapter functions and `assertData` guards. Adapters normalize the SDK's `?: string | null` (optional + nullable) shape to the local types' `: string | null` (required + nullable) shape so callers see a stable contract. Two `as unknown as` casts remain in `lifecycle.ts` and are commented inline: the SDK incorrectly types `createLifecyclePolicy` / `updateLifecyclePolicy` bodies as the security-policy request shape rather than the lifecycle request shape — to be removed when the generator is rebuilt against the corrected OpenAPI spec. Pages that consume these APIs are unchanged.
- **Admin Settings page now issues one HTTP call instead of three** (#349) - the page used to call `/api/v1/admin/settings` three times via separate `useQuery` hooks (one each for `password-policy`, `storage-settings`, `smtp-config`). Replaced with a single `admin-settings` query backed by new `settingsApi.getAllSettings()` and the `useAdminSettings()` hook. The SMTP tab consumes the same hook so react-query dedups it. Public per-getter API (`getPasswordPolicy` / `getStorageSettings` / `getSmtpConfig`) preserved for non-page consumers (e.g. the inline `PasswordPolicyHint`). Cuts settings page network round trips by 67%. **Behavioral note**: with one shared query, a malformed slice of the response (e.g. bad SMTP fields) now fails the whole bundle — Storage and Password Policy rows show "Unavailable" alongside the SMTP error, even though their fields parsed fine. Pre-PR these would have parsed independently. The trade-off is acceptable because all three slices come from the same endpoint and a malformed bundle is almost always a backend-wide problem; per-slice fault isolation is filed as a follow-up.
- **`toUserMessage` truncates user-untrusted error text at 240 chars** (#356) - prevents a 50KB stack trace or HTML 500 page from rendering as a wall of text in a toast. Truncated output is suffixed with `… [truncated, <n> more chars]` so it's clear the message was clipped. Author-controlled fallback strings are not truncated.
- **`toUserMessage` prefixes fallback with HTTP status code** (#355) - when an error carries an HTTP status (`.status` / `.statusCode` / `.body.status`) but the body has no useful message, the fallback now reads "(HTTP 409) Failed to create permission" instead of just "Failed to create permission" so a 409 Conflict differentiates from a 500 Internal Server Error in toast text. Backend-provided messages stay unchanged (no double-decoration). Closes the deferred half of #207.
- **Extract `mutationErrorToast` helper to deduplicate ~125 mutation `onError` callsites** (#354) - the pattern `onError: (err) => toast.error(toUserMessage(err, "Failed to <action>"))` was repeated across most pages; collapsed to `onError: mutationErrorToast("Failed to <action>")` in 36 files (-145 LOC). Centralizes future tweaks (HTTP status prefix, truncation, telemetry) to one place. User-visible toast strings are unchanged.
- **Type-safe API layer — replace double-casts with adapters and zod** (#206) - removed all `as unknown as T` and `as never` casts in 15 of `src/lib/api/*.ts` files. Each SDK call now goes through an adapter function or a Set-backed narrowing helper that warns on unknown enum values. `assertData` (new in `fetch.ts`) rejects empty body responses with a contextual error. `settings.ts` uses zod `.safeParse()` at the trust boundary for `getPasswordPolicy`/`getSmtpConfig`. Public `xxxApi` return types unchanged so consumer code is untouched.

### Fixed
- **Surface load failures in `getPasswordPolicy` and `getSmtpConfig` instead of silently falling back to defaults** (#347) - both getters previously caught any SDK error or schema mismatch and returned baked-in defaults, so a backend outage rendered as plausible-looking placeholder values on the admin Settings page (same failure mode as #334). Now the getters throw on SDK error / unparseable response, and the page renders explicit "Unavailable" states (Password Policy row + SMTP tab error alert) so an operator can tell something's actually wrong.
- **`formatBytes` returns "--" for NaN/Infinity/negative input** (#348) - previously these inputs produced nonsense strings like "NaN undefined" or "Infinity undefined" visible on the admin Settings → Storage tab. Now returns the same `--` sentinel already used elsewhere in the package/search rendering paths. Also clamps the unit index for >TB values so multi-PB byte counts render as "<n> TB" rather than indexing past the units table.
- **SSO login button reads "Sign in with SSO" instead of generic provider names like "default"** (#351) - when an admin's SSO provider is named `default` / `primary` / `main` / `sso` (or empty/whitespace), the button now falls back to a protocol-aware label (`Sign in with SSO (OIDC)` / `(SAML)`) so users see what they're actually clicking. Real provider names like "Corp SSO" are preserved unchanged.
- **Login page hides username/password fields when only redirect SSO is configured** (#350) - previously the form rendered even when the only available auth method was OIDC/SAML, leaving the fields with no consumer. The form now hides when SSO providers exist and no LDAP provider is configured. Setup mode and the `?fallback=local` query param keep the form available for first-time setup and operator recovery. A loading skeleton during the SSO providers fetch prevents the form from briefly flashing visible. Heuristic stopgap until the backend exposes a public `local_auth_enabled` flag.
- **Migration Add Connection now lets users pick the source repository manager type** (#319) - the form previously had no Source Type field, so the backend silently defaulted every connection to Artifactory. Adds a Source Type Select with Artifactory + Nexus options (the two values the SDK currently accepts), threaded through types, the API adapter, the form state, and the create-connection mutation body. Default remains Artifactory to preserve prior behavior.
- **Setup Guide now shows correct client snippets for Gradle and SBT repos** (#333) - JVM-format repos (maven / gradle / sbt) previously rendered only Maven `pom.xml` / `settings.xml`. The dialog now offers Maven, Gradle (Groovy), Gradle (Kotlin), and SBT tabs with the correct credential and dependency snippets per client. Default tab tracks the repo's declared format so a Gradle repo opens on Gradle (Groovy).
- **Mutation errors now surface backend details instead of generic placeholders** (#207) - audited every TanStack Query `useMutation` and replaced opaque `onError: () => toast.error("Failed to ...")` callbacks with `toUserMessage(err, fallback)`-driven toasts. 91 callsites across 27 files. Also adds `onError` to 8 previously-silent mutations (security/policies/scans + repo-selector preview), and disambiguates the SSO toggle toasts per provider (OIDC/LDAP/SAML). `toUserMessage` now also reads FastAPI-style `.detail` fields so plugin-install errors (and any other FastAPI-shaped backend error) surface their server-side message.

### Accessibility
- **Aria attribute coverage on admin pages** (#208) - replaced `title` with `aria-label` on icon-only buttons (lifecycle, monitoring, quality-gates, sso, telemetry, groups, security/scans, file-viewer); paired form inputs with labels via `htmlFor`/`id`; added accessible names to `Switch` components. Per-row table action buttons (SSO providers, quality gates, lifecycle policies, telemetry crash reports, users, monitoring suppress) now interpolate the row's identifying name into the aria-label so screen readers can disambiguate. Newly accessible-named `Refresh` buttons on approvals, security, and migration pages.

### Security
- **Pin third-party GitHub Actions to commit SHAs** (#205) - every third-party `uses:` line in `codeql.yml`, `dependency-review.yml`, `docker-publish.yml`, and `stale.yml` is now pinned to a specific commit SHA (with a version comment) so an upstream tag rewrite cannot silently swap action code. `ci.yml` was already pinned and is the model. The same-org reusable workflow `artifact-keeper/artifact-keeper-test/.github/workflows/release-gate.yml@main` (docker-publish.yml line 191) is intentionally tracked on `main` — same-org workflows inherit the org's branch-protection trust boundary, and pinning a reusable workflow to a SHA is operationally heavier. Dependabot is configured for `github-actions`, so bumps continue to flow through review.

### Notes
- **v1.1.8 web image is permanently unavailable** (#320) - the web release process stopped at v1.1.3 while the backend continued through v1.1.8. There is no v1.1.8 source ref to rebuild from; backfilling would falsify provenance. See [docs/release-history/v1.1.8-web-postmortem.md](docs/release-history/v1.1.8-web-postmortem.md). Recurrence is prevented by `artifact-keeper#882` (image-publish gate).

## [1.1.0] - 2026-04-19

First stable release of Artifact Keeper Web. Platform parity with `artifact-keeper` 1.1.0 backend. Consolidates `1.1.0-rc.5` through `1.1.0-rc.9` and post-RC work.

### Added
- **Chunked upload for multi-GB artifacts** (#218) - hashing, pause/resume/cancel controls, retry-per-chunk, speed/ETA readout; automatically engages for files >=100MB when uploading into a repository
- **Repository-scoped access tokens** (#294) - limit tokens by format filters, name pattern, and labels; token create dialog grows a repo selector when enabled
- **Repository Settings tab on the detail view** (#298) - inline edit of repository metadata without leaving the page
- **Notification configuration tab on repositories** (#293) - per-repo webhook and email notification targets
- **SMTP configuration in admin settings** (#299) - configure outbound mail server from the UI
- **Webhook payload template selector** (#295) - choose a predefined or custom payload template when creating a webhook
- **Quarantine status on artifacts** (#292) - list and detail views show quarantine state and banner
- **Auth source badge on admin users list and edit dialog** (#291) - shows which identity provider a user came from (local, LDAP, SAML, OIDC)
- **Account lockout status on failed login** (#284) - login page surfaces remaining attempts and lockout expiry
- **Password expiry warning banner and force-change flow** (#286) - warn before expiry and block access after, forcing a change
- **Global error and root error boundary pages** (#290) - Next.js `error.tsx` and `global-error.tsx` with telemetry and retry UX
- **Admin permissions UI** (#186 by @TechEnchante) - manage principal / target / action permissions with repository selection
- **Staging repository creation** (#142) - create staging repos from the UI
- **Artifact content viewer with syntax highlighting** (#154) - browse file contents inline via Shiki
- **Git commit hash in sidebar and settings** (#153) - shows the running build hash for support and reproducibility
- **Upstream auth fields on remote repo create/edit** (#181) - set proxy credentials and tokens when configuring remote repositories
- **Storage quota field on repository create/edit** (#184) - per-repository size limits
- **Default upstream URL suggestion by format** (#185) - prefill proxy URL based on selected package format
- **Admin token management for other users** (#191) - admins can create, list, and revoke tokens on behalf of users
- **Playwright E2E suite expansion** (#76, #119, #121, #151) - 250+ interaction tests with RBAC role coverage, visual regression, and CI sharding
- **Vitest unit test suite with V8 coverage** (#69, #70, #71, #112, #113) - coverage gate integrated into CI
- **Tutorial video pipeline** (#79) - YouTube-ready tutorial generation with Amazon Polly voiceover

### Changed
- **SDK bump to `@artifact-keeper/sdk` 1.1.4** (#297, #233, #231) - track the generated OpenAPI client through the 1.1.0-rc.5 → 1.1.0 → 1.1.4 progression
- Major dependency upgrades: Next.js 16.2.x, React 19.2.x, Tailwind CSS 4.2.x, shadcn/ui on Radix UI, TanStack Query 5.99.x, react-hook-form 7.72.x, framer-motion 12.38.x, vitest 4.1.x, shiki 4.0.x, lucide-react 1.8.x
- **CI hardening** - SonarCloud scan gated on `SONAR_TOKEN` availability (#94); pre-release tags excluded from Docker Hub `:latest` (#223); duplication and new-code coverage gates added with visible per-step output (#313)

### Fixed
- **Access token create dialog overflowed viewport in Playwright** (#312) - dialog now capped at `90vh` with inner scroll, matching the pattern used by quality-gates, webhooks, and settings-sso dialogs
- **E2E selectors collided with new "Name Pattern" label** (#301) - anchored `getByLabel(/^name$/i)` on the access token dialog
- **SSO callback did not refresh auth context after token exchange** (#276 by @nikitatsym) - callback now calls `refreshUser()` before redirecting, so the sidebar reflects the authenticated user without reload
- **CSP tightened, `Math.random` replaced, SSO errors sanitized** (#217) - reduce XSS surface and information disclosure
- **Proxy body size limit raised for large artifact uploads** (#285) - Next.js proxy middleware body limit increased
- **CVE findings displayed GHSA instead of CVE identifier** (#280) - resolve advisory IDs for display
- **Scan status showed incorrect state when scan failed to execute** (#288)
- **Password reuse rejection message** (#296) - surface the backend's policy message on change-password
- **API keys and access tokens not showing after creation** (#106)
- **Download URL pattern mismatch with backend route** (#115)
- **Staging repo filtering used wrong type param** (#138)
- **Docker login `/v2` not reaching middleware** (#108) - middleware matcher extended
- **SSO callback route** (#201) - `/auth/callback` rewrite routes to the SSO page
- **Virtual repo create field mapping** (#187) - include `member_repos`, fix members list
- **Non-admin users saw admin scope checkbox** (#57)
- **BACKEND_URL ignored at runtime in standalone Docker** (#56, #58)
- **Duplicate create buttons in Playwright strict mode** (#66)
- **Flaky E2E tests for security scans and access tokens** (#119)
- **Forced password change in E2E setup** (#202)
- **Release gate ran before image build** - Docker publish now builds first, runs the compatibility gate after as an advisory check
- **Code duplication gate result was invisible** (#313) - step now prints percentage and clone list to stdout and fails fast on parser errors

### Security
- **URL validation in package metadata and CSP header** (#92) - validate URLs rendered from package metadata to prevent stored XSS; add `Content-Security-Policy` header
- **Instance URL SSRF hardening** - reject private IP ranges and IPv6 loopback variants; remove legacy token storage from `localStorage`
- **CSP tightening, Math.random replacement, SSO error sanitization** (#217)

### New Contributors
- @TechEnchante (#186)
- @nikitatsym (#276)
- @mergify[bot] (#232)

## [1.1.0-rc.4] - 2026-02-25

### Added
- **Access Tokens page and Service Accounts UI** (#62) - dedicated page for managing access tokens with service account support, moved from profile tabs to sidebar navigation
- **Repo selector for service account token scoping** (#64) - UI to restrict service account tokens to specific repositories
- **Incus/LXC format** (#63) - web UI support for browsing and managing Incus container images
- **Live data refresh with SSE** (#77) - real-time cache invalidation via server-sent events, TanStack Query cache tuning, and cross-page data coordination
- **Plugin install dialog** (#75) - wire up plugin installation flow to backend APIs
- **Vitest unit test suite** (#69, #70, #71) - unit tests for SDK client, auth API, and URL validation with V8 coverage reporting and CI integration
- **Playwright E2E test suite** (#76) - 250+ interaction tests with RBAC role coverage, visual regression, and CI sharding support
- **Tutorial video pipeline** (#79) - post-processing pipeline for generating YouTube-ready tutorial videos with Amazon Polly voiceover

### Fixed
- **Duplicate create buttons** (#66) - removed duplicated button elements that caused Playwright strict mode failures
- **Plugins page description** (#73) - updated page copy to match actual plugin capabilities
- **E2E seed data API paths** (#91) - corrected API endpoint paths and configuration in test seed data
- **Instance URL validation hardened** - prevent SSRF via instance URL by validating against private IP ranges, removing legacy token storage from localStorage
- **IPv6 loopback check** - fix URL validation to correctly identify IPv6 loopback addresses
- **CI SonarCloud conditional** (#94) - skip SonarCloud scan when `SONAR_TOKEN` is unavailable (forks, external PRs)

### Security
- **URL validation in package metadata and CSP header** (#92) - validate URLs rendered from package metadata to prevent stored XSS, add Content-Security-Policy header

### Changed
- SonarCloud scanning added to CI (#72)
- Mergify auto-merge configuration (#67)
- Dependency upgrades: @tailwindcss/postcss 4.2.0, tailwind-merge 3.5.0, framer-motion 12.34.3, react-hook-form 7.71.2, react-resizable-panels v4, lucide-react, tailwindcss

## [1.1.0-rc.3] - 2026-02-17

### Fixed
- **`BACKEND_URL` ignored at runtime in standalone Docker** (#56, #58) — replaced build-time `rewrites()` with a Next.js middleware that reads `BACKEND_URL` on each request, so containers can be configured without rebuilding
- **Non-admin users saw admin scope checkbox** (#57) — the "Admin" scope option is now hidden in both API Keys and Access Tokens forms for non-admin users

### Added
- **Token CRUD E2E tests** (#57) — Playwright tests for `POST /api/v1/auth/tokens` (create), `DELETE /api/v1/auth/tokens/:id` (revoke), and empty-name validation

### Changed
- Extracted `TokenCreateForm` component to eliminate duplicated form blocks in the profile page (#57)
- Removed `ARG BACKEND_URL` from Dockerfile build stage; default is now a runtime `ENV` (#58)

## [1.0.0-a1] - 2026-02-06

### Added
- SBOM UI for viewing, generating, and license compliance analysis
- TOTP two-factor authentication UI
- Instance online/offline status dots in instance switcher
- First-boot setup experience in web UI
- MIT License

### Changed
- Use native arm64 runners for Docker builds (performance improvement)

### Fixed
- Add error handling to repository mutations for demo mode feedback
- Update demo auto-login password to match demo instance
- Clean up lint errors and unused imports
- Allow docker command to wrap in first-time setup banner
- Prevent docker exec command overflow on mobile screens

## [1.0.0-rc.1] - 2026-02-03

### Added
- Setup Guide page with repo-specific instructions and format filter
- Search artifacts inside repositories, not just repo names
- Redesigned repository browser with master-detail split-pane layout
- Multi-platform Docker builds (amd64 + arm64)

### Changed
- Align packages and builds pages with actual backend API
- Remove standalone artifacts page, redirect to repositories
- Make Setup Guide page accessible without authentication

### Fixed
- Pass BACKEND_URL at build time for Next.js rewrites
- Redirect to / instead of /login on logout
- Widen setup dialog and wrap long URLs in code blocks
- Hide package detail panel when no packages exist
- Disable Next.js dev indicators in production
- Remove setState in useEffect and unused variable warnings
- Fetch artifact-matched repos from other pages, sort them first
- Stop 401 refresh loop when logged out
- Resolve lint errors blocking CI Docker image publish
