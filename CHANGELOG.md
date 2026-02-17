# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
