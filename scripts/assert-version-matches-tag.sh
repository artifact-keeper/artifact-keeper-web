#!/usr/bin/env bash
# Assert that package.json's version equals the tag being cut.
#
# Why this exists (#784): v1.8.0 was tagged while package.json still read
# 1.7.0, so the 1.8.0 build reported itself as "Web 1.7.0" in the sidebar.
# The displayed version is what a user quotes in a bug report and what an
# operator checks to decide whether a fix landed, so a build that
# under-reports its version sends whoever is investigating to the wrong
# changelog. Manual discipline has failed here more than once.
#
# package.json is the ONLY source of the displayed version. next.config.ts
# inlines `pkg.version` into NEXT_PUBLIC_APP_VERSION at build time, and that
# explicit value takes precedence over the Dockerfile's
# `ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}` build arg -- verified against
# the published 1.8.0 image, whose client bundle carries the literal "1.7.0"
# even though CI passed APP_VERSION=v1.8.0. So gating package.json is both
# necessary and sufficient.
#
# Usage: scripts/assert-version-matches-tag.sh <tag>
#   <tag> may be given with or without the leading "v" (v1.8.0 or 1.8.0).

set -euo pipefail

TAG="${1:-}"

if [ -z "${TAG}" ]; then
  echo "usage: $0 <tag>" >&2
  exit 2
fi

# Accept refs/tags/v1.8.0, v1.8.0, or 1.8.0.
TAG="${TAG#refs/tags/}"
EXPECTED="${TAG#v}"

PKG_VERSION="$(node -p "require('./package.json').version")"

if [ "${PKG_VERSION}" = "${EXPECTED}" ]; then
  echo "package.json version (${PKG_VERSION}) matches tag ${TAG}"
  exit 0
fi

cat >&2 <<MSG
::error::package.json version does not match the tag being cut

  tag being cut     : ${TAG}  (expected version ${EXPECTED})
  package.json says : ${PKG_VERSION}

The UI sidebar reports package.json's version, so this build would ship
advertising itself as ${PKG_VERSION} rather than ${EXPECTED}.

Fix: set "version": "${EXPECTED}" in package.json (and the two matching
entries in package-lock.json), merge to main, then re-tag.
MSG
exit 1
