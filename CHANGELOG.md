# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-rc.1] - 2026-02-03

### Added
- Set Me Up page with repo-specific instructions and format filter
- Search artifacts inside repositories, not just repo names
- Redesigned repository browser with master-detail split-pane layout
- Multi-platform Docker builds (amd64 + arm64)

### Changed
- Align packages and builds pages with actual backend API
- Remove standalone artifacts page, redirect to repositories
- Make Set Me Up page accessible without authentication

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
