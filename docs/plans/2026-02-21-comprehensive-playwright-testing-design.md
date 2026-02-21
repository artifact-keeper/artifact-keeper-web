# Comprehensive Playwright E2E Test Suite Design

**Date:** 2026-02-21
**Status:** Approved
**Scope:** artifact-keeper-web

## Goal

Achieve 100% Playwright test coverage for the artifact-keeper-web frontend: every user-visible interaction, full RBAC role matrix, visual regression with page-level and component-level screenshots, and a pipeline that exports curated screenshots to the documentation site.

## Current State

- 38 E2E spec files (5,130 lines) covering most pages as admin-only
- 4 page object models (login, dashboard, profile, repositories)
- 4 unit test files (utilities only)
- Playwright configured for Chromium against a docker-compose stack (Postgres, Meilisearch, backend, web)
- CI pipeline: lint, unit, build, E2E (sequential)

## Design Decisions

- **Real backend**: All tests run against the full docker-compose stack. No API mocking except for simulating error states.
- **Suites by concern**: Three independent test suites (interactions, roles, visual) rather than monolithic per-page files.
- **Full RBAC matrix**: Five user roles plus unauthenticated, each with stored auth state.
- **Visual regression**: Full-page + component-level + state screenshots with baselines committed to git.
- **Screenshots as docs**: CI exports curated screenshots to the documentation site with an auto-generated gallery and inline references.
- **Incremental migration**: Existing 38 specs migrate into the new structure rather than being rewritten from scratch.

## Test Architecture

### Directory Structure

```
e2e/
  setup/
    global-setup.ts             # Auth state creation for all roles
    seed-data.ts                # API-driven data seeding
    teardown.ts                 # Cleanup between suites
    auth-states.ts              # Role definitions + stored auth files

  fixtures/
    test-fixtures.ts            # Extended Playwright fixtures
    page-objects/               # One POM per page (~40 files)
      DashboardPage.ts
      RepositoriesPage.ts
      PackagesPage.ts
      LoginPage.ts
      UsersPage.ts
      GroupsPage.ts
      ...

  suites/
    interactions/               # Every clickable element, form, navigation
      auth/
      dashboard/
      repositories/
      packages/
      staging/
      admin/
      security/
      operations/
      integrations/

    roles/                      # RBAC access matrix
      admin.spec.ts
      regular-user.spec.ts
      viewer.spec.ts
      security-auditor.spec.ts
      restricted.spec.ts
      unauthenticated.spec.ts

    visual/                     # Screenshot baselines
      pages/
      components/
      states/

  screenshots/                  # Baseline image storage
    pages/
    components/
    states/

  docs-export/                  # CI copies curated screenshots here
    manifest.json
```

### Playwright Config Projects

Four projects run in dependency order:

1. **setup** - Creates auth states and seeds data
2. **interactions** - All interaction tests (depends on setup, runs as admin)
3. **roles** - RBAC matrix with one sub-project per role (depends on setup)
4. **visual** - Screenshot comparisons (depends on setup)

Each suite can be run independently: `npx playwright test --project=interactions`.

## Data Seeding

A `seed-data.ts` module uses the backend API to create a known dataset before tests run.

**Seeded data:**
- 5 users: `admin` (full access), `developer` (read + push), `viewer` (read-only), `security-auditor` (security pages only), `restricted` (minimal permissions)
- 1 service account with API token
- 3 repositories (Maven local, NPM remote, Docker virtual)
- ~10 packages across formats with versions
- 2 groups (dev-team, security-team) with assigned users
- 1 webhook, 1 replication rule, 1 quality gate, 1 lifecycle policy
- 1 access token per user

**Auth state files** stored in `e2e/.auth/`:
```
admin.json
developer.json
viewer.json
security-auditor.json
restricted.json
```

Teardown runs after all suites, deleting seeded data for idempotency.

## Page Object Model Library

Expand from 4 POMs to ~40 (one per page).

**Conventions:**
- One class per page, named `{Page}Page`
- Locators as readonly properties using accessible selectors (`getByRole`, `getByTestId`, `getByText`)
- Common actions as methods (e.g., `createRepository()`, `deleteUser()`)
- No assertions inside POMs; tests own all `expect()` calls

**Shared component helpers:**
- `DialogHelper` - open, fill, submit, cancel
- `DataTableHelper` - paginate, sort, filter, assert row count
- `TabHelper` - switch tabs, verify active tab
- `ToastHelper` - assert success/error toasts

## Interaction Test Coverage Map

~45 spec files organized by feature area:

### Auth
- `login.spec.ts` - username/password, validation errors, wrong credentials, LDAP tabs, SSO buttons
- `totp.spec.ts` - TOTP setup, code entry, invalid code rejection
- `password-change.spec.ts` - first-login forced change, voluntary change, mismatch validation
- `logout.spec.ts` - session clear, redirect to login

### Dashboard
- `dashboard.spec.ts` - health cards, admin stats, CVE chart, recent repos table

### Repositories & Packages
- `repo-list.spec.ts` - list, search, format filter, type filter, sort, pagination
- `repo-create.spec.ts` - dialog, form validation, create with all format types
- `repo-edit.spec.ts` - edit dialog pre-fill, save, cancel
- `repo-delete.spec.ts` - confirm dialog, delete removes from list
- `repo-detail.spec.ts` - metadata, tabs (config, packages, permissions)
- `package-browse.spec.ts` - list/grid toggle, search, filters, sort, pagination
- `package-detail.spec.ts` - metadata, versions, install command copy, file tree, dependencies
- `package-versions.spec.ts` - version tab, comparison, download links

### Staging
- `staging-list.spec.ts` - list, filter, search
- `staging-detail.spec.ts` - staged artifacts, approve/reject
- `staging-approval.spec.ts` - approval workflow end-to-end

### Admin
- `users.spec.ts` - list, create, edit, admin toggle, reset password, delete
- `groups.spec.ts` - list, create, add/remove members, delete
- `service-accounts.spec.ts` - list, create, token generation, revoke, delete
- `permissions.spec.ts` - rules table, create, edit, delete
- `settings.spec.ts` - server config, storage settings
- `sso.spec.ts` - provider list, create OIDC/SAML, edit, delete, test connection
- `backups.spec.ts` - list, trigger backup, restore, delete
- `migration.spec.ts` - wizard steps, source config, dry run, execute

### Security
- `security-dashboard.spec.ts` - overview stats, CVE table, severity breakdown
- `scans.spec.ts` - scan list, trigger scan, detail page with findings
- `policies.spec.ts` - list, create/edit/delete
- `dt-projects.spec.ts` - list, detail with risk gauge, component list
- `quality-gates.spec.ts` - list, create with conditions, edit, delete
- `license-policies.spec.ts` - list, create with license patterns, edit, delete

### Operations
- `analytics.spec.ts` - charts, date range filter, export
- `monitoring.spec.ts` - system metrics, health checks
- `telemetry.spec.ts` - toggle, data display
- `lifecycle.spec.ts` - list, create policy, preview, execute
- `approvals.spec.ts` - pending list, approve/reject

### Integrations
- `peers.spec.ts` - list, add, test connection, remove
- `replication.spec.ts` - list, create push/pull, run now, delete
- `plugins.spec.ts` - list, install, enable/disable, uninstall
- `webhooks.spec.ts` - list, create with events, test, edit, delete
- `access-tokens.spec.ts` - list, create with scopes, copy value, revoke
- `profile.spec.ts` - view, edit display name, change email, TOTP setup/disable

Each spec also verifies loading states (skeletons), empty states (no data messages), and error states (simulated via `page.route()` for 500 responses).

## RBAC Role Matrix

| Role | Visible Pages | Hidden Pages | Key Restrictions |
|------|--------------|-------------|-----------------|
| admin | Everything | None | Full CRUD |
| developer | Repos, packages, staging, integrations, profile | Admin sidebar section | No user/group/settings management |
| viewer | Repos, packages (read-only) | Admin, operations, create/delete buttons | No write actions |
| security-auditor | Security pages, quality gates, license policies | Admin (users/settings), operations | Read-only security |
| restricted | Dashboard, profile only | Most sidebar items | Minimal access |
| unauthenticated | Login page only | Everything else | Redirected to /login |

Each role spec navigates to 5-10 representative pages and asserts correct element visibility/hiding.

## Visual Regression

### Page-level Screenshots
- One spec per route group capturing each page as admin
- Two viewport sizes: desktop (1280x720) and mobile (375x812)
- Naming convention: `{page}-{viewport}-{role}.png`

### Component-level Screenshots
- ~30 targeted captures: sidebar (collapsed/expanded), header, data tables, dialogs, stat cards, severity bars, file tree, install command blocks
- Use `locator.screenshot()` for precision

### State Screenshots
- Loading skeletons (API responses delayed via `page.route()`)
- Empty states (no seeded data for specific endpoints)
- Error states (simulated 500 responses)
- ~20 state baselines

### Baseline Management
- Stored in `e2e/screenshots/`, committed to git
- Threshold: `maxDiffPixelRatio: 0.01` (1% tolerance)
- CSS injection via `stylePath` to hide dynamic content (timestamps, random IDs)
- Update: `npx playwright test --update-snapshots`

## Screenshots-as-Docs Pipeline

After the visual suite runs in CI:

1. CI copies curated screenshots from `e2e/screenshots/` to `e2e/docs-export/`
2. A `manifest.json` maps each screenshot to metadata (page name, description, viewport, role)
3. A follow-up workflow copies `docs-export/` to `artifact-keeper-site/public/screenshots/`
4. The docs site provides:
   - **Gallery page** (`/docs/ui-gallery`) auto-generated from manifest, with filters by page/viewport
   - **Inline references** in existing guide pages

### Manifest Format

```json
[
  {
    "file": "repositories-desktop-admin.png",
    "page": "Repositories",
    "route": "/repositories",
    "viewport": "desktop",
    "role": "admin",
    "description": "Repository management with split-panel layout"
  }
]
```

## CI Pipeline

```
lint ──┐
       ├──► build ──► e2e-setup ──┬──► e2e-interactions (3 shards)
test ──┘                          ├──► e2e-roles
                                  ├──► e2e-visual
                                  └──► docs-screenshot-export (main only)
```

- Interactions suite sharded across 3 CI runners
- All three suites run in parallel after setup
- Visual job uploads diff images as artifacts on failure
- Docs export only on main branch merges, opens PR on artifact-keeper-site
- Timeouts: interactions 30 min (sharded), roles 10 min, visual 15 min

## Migration Strategy

Incremental, not big-bang:

1. **Phase 1: Infrastructure** - setup, fixtures, POM library, updated Playwright config
2. **Phase 2: Migrate existing 38 specs** into `suites/interactions/` (extract POMs, reorganize)
3. **Phase 3: RBAC role tests** - add user creation to seed, write role specs
4. **Phase 4: Visual regression** - capture initial baselines, add visual specs
5. **Phase 5: CI updates** - parallel suites, sharding, docs export workflow
6. **Phase 6: Gap analysis** - identify untested elements, add remaining coverage

Old `e2e/*.spec.ts` files stay functional during migration and are removed once all tests pass in the new structure.

## Estimated Scope

- ~40 page object models
- ~45 interaction spec files
- ~6 role spec files
- ~10 visual spec files (pages, components, states)
- Updated Playwright config with 4 project groups
- Updated CI workflow with parallel jobs and sharding
- Docs site gallery page + manifest pipeline
