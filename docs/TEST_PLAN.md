# Web Frontend Test Plan

## Overview

The artifact-keeper web frontend uses Playwright for E2E browser testing, ESLint for static analysis, and Next.js build verification.

## Test Inventory

| Test Type | Framework | Count | CI Job | Status |
|-----------|-----------|-------|--------|--------|
| Lint | ESLint | Full codebase | `lint` | Active |
| Build | Next.js | Full app | `build` | Active |
| E2E | Playwright | 44 spec files | `e2e` | Active |
| Unit | (none) | 0 | - | Missing |
| Visual regression | (none) | 0 | - | Missing |
| Accessibility | (none) | 0 | - | Missing |

## How to Run

### Lint
```bash
npm run lint
```

### Build
```bash
npm run build
```

### E2E Tests (requires running backend)
```bash
npx playwright test                              # all tests
npx playwright test e2e/service-accounts.spec.ts  # single file
npx playwright test --ui                          # interactive mode
```

### E2E with Docker Stack
```bash
docker compose -f docker-compose.e2e.yml up -d
npx playwright test
```

## E2E Test Coverage

44 spec files covering: admin, auth, dashboard, repositories, packages, builds, approvals, quality gates, staging, lifecycle, backups, replication, peers, monitoring, analytics, license policies, migration, webhooks, plugins, permissions, groups, users, SSO, service accounts, access tokens, health dashboard, setup, package browser, package detail, repository detail, search, profile, security, telemetry, API integration.

## CI Pipeline

```
PR opened/pushed
  -> lint (ESLint)
  -> build (Next.js)
  -> e2e (Playwright against docker-compose stack)

Merge to main
  -> All above PLUS:
  -> docker (multi-platform image build + push to ghcr.io)
```

## Gaps and Roadmap

| Gap | Recommendation | Priority |
|-----|---------------|----------|
| No unit tests | Add Vitest for utilities, hooks, and API client functions | P2 |
| No visual regression | Add Playwright `toHaveScreenshot()` for key pages | P3 |
| No accessibility testing | Add axe-core checks in E2E tests | P2 |
| No component tests | Add Playwright Component Testing or Storybook | P3 |

## Agent-Assisted QA

Invoke the test coverage analyzer to find untested pages:
```bash
claude --print ".claude/agents/test-coverage.md"
```

Invoke the feature parity tracker to compare web vs mobile:
```bash
claude --print ".claude/agents/feature-parity.md"
```

Invoke the E2E regression detector after code changes:
```bash
claude --print ".claude/agents/e2e-regression.md"
```
