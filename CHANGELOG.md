# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
