# ---------- Base: Node.js 24 on UBI 9 ----------
FROM registry.access.redhat.com/ubi9/ubi:9.8 AS node-base
RUN dnf module enable nodejs:24 -y && \
    dnf install -y --nodocs nodejs npm && \
    dnf clean all

# ---------- Stage 1: Install npm dependencies ----------
FROM node-base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/ scripts/
RUN npm ci

# ---------- Stage 2: Build Next.js ----------
FROM node-base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG GIT_SHA=unknown
# NOTE (#784): APP_VERSION does NOT set the displayed version. next.config.ts
# sets `env.NEXT_PUBLIC_APP_VERSION` to `pkg.version` literally, and that
# explicit config value takes precedence over the ENV below, so the version
# always comes from package.json (bump it; scripts/assert-version-matches-tag.sh
# gates it at release time).
#
# What APP_VERSION does carry is the git ref the image was built from: CI
# passes `github.ref_name`, so a release build sees `vX.Y.Z` and a main or
# branch build sees the branch name. next.config.ts exposes it as
# NEXT_PUBLIC_BUILD_REF, and the sidebar shows the short commit hash instead
# of the version for any build that is not a release tag.
ARG APP_VERSION=dev
# Enable HSTS + the CSP `upgrade-insecure-requests` directive. The headers are
# emitted by src/middleware.ts, which reads AK_ENFORCE_HTTPS per request at
# container RUNTIME (#679), so this build arg only sets the image's default
# value: operators can override it on the running container with
# `docker run -e AK_ENFORCE_HTTPS=true ...` (or the compose `environment:`
# block) without rebuilding. Leave unset (default) for plain-HTTP deployments;
# set it when the UI will be served behind TLS. See #2222.
ARG AK_ENFORCE_HTTPS
ENV GIT_SHA=${GIT_SHA}
ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}
ENV AK_ENFORCE_HTTPS=${AK_ENFORCE_HTTPS}
# Reference APP_VERSION in the RUN to bust Docker build cache when it changes
RUN echo "Building version: ${APP_VERSION} (${GIT_SHA})" && npm run build

# ---------- Stage 3: Build minimal rootfs ----------
FROM registry.access.redhat.com/ubi9/ubi:9.8 AS rootfs-builder

# Install only the shared libraries Node.js needs at runtime
RUN mkdir -p /mnt/rootfs && \
    dnf install --installroot /mnt/rootfs --releasever 9 \
        --setopt install_weak_deps=0 --nodocs -y \
        glibc-minimal-langpack \
        ca-certificates \
        libstdc++ \
        openssl-libs \
        zlib \
        brotli \
    && dnf --installroot /mnt/rootfs clean all \
    && rm -rf /mnt/rootfs/var/cache/* /mnt/rootfs/var/log/* /mnt/rootfs/tmp/*

# Drop the userland that ca-certificates drags in. openssl-libs requires
# ca-certificates, and ca-certificates hard-requires bash, coreutils, grep,
# sed, findutils and p11-kit (for its update-ca-trust scriptlet), which in turn
# pull pcre/pcre2, libselinux, libacl, libcap, gmp, ncurses and alternatives.
# Node never executes or links any of them, but scanners that grade RHEL
# packages by NVD score (Docker Scout) report them as high findings: 6 of its
# 7 "high" were openssl-libs and pcre2/pcre2-syntax. openssl-libs itself stays:
# Red Hat's Node RPM links the SYSTEM OpenSSL (node_shared_openssl), so
# libssl/libcrypto, and crypto-policies that openssl.cnf includes, are hard
# runtime requirements.
#
# `rpm -e` fails if any name below is not installed, so a change in the UBI
# dependency tree breaks the build instead of silently leaving packages in.
# --noscripts: the erase scriptlets would need the very shell being removed.
RUN rpm --root /mnt/rootfs -e --nodeps --noscripts \
        ca-certificates p11-kit p11-kit-trust libffi \
        bash coreutils coreutils-common findutils grep sed \
        pcre pcre2 pcre2-syntax libselinux libsepol libacl libattr libcap \
        gmp libsigsegv ncurses-base ncurses-libs alternatives \
    && test ! -e /mnt/rootfs/usr/bin/sh && test ! -e /mnt/rootfs/usr/bin/bash

# Removing ca-certificates took the CA trust store with it. Put the bundles the
# builder extracted back as plain files, with the RHEL paths OpenSSL (and so
# Node's --use-openssl-ca and NODE_EXTRA_CA_CERTS users) expects: OPENSSLDIR
# is /etc/pki/tls, so the default CA file is /etc/pki/tls/cert.pem and the CA
# dir /etc/pki/tls/certs. /etc/ssl/* are the compatibility links
# ca-certificates normally ships.
COPY --from=registry.access.redhat.com/ubi9/ubi:9.8 \
    /etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem \
    /mnt/rootfs/etc/pki/ca-trust/extracted/pem/
COPY --from=registry.access.redhat.com/ubi9/ubi:9.8 \
    /etc/pki/ca-trust/extracted/openssl/ca-bundle.trust.crt \
    /mnt/rootfs/etc/pki/ca-trust/extracted/openssl/
RUN mkdir -p /mnt/rootfs/etc/pki/tls/certs /mnt/rootfs/etc/ssl && \
    ln -sf /etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem /mnt/rootfs/etc/pki/tls/cert.pem && \
    ln -sf /etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem /mnt/rootfs/etc/pki/tls/certs/ca-bundle.crt && \
    ln -sf /etc/pki/ca-trust/extracted/openssl/ca-bundle.trust.crt /mnt/rootfs/etc/pki/tls/certs/ca-bundle.trust.crt && \
    ln -sf /etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem /mnt/rootfs/etc/ssl/cert.pem && \
    ln -sfn /etc/pki/tls/certs /mnt/rootfs/etc/ssl/certs && \
    ln -sf /etc/pki/tls/openssl.cnf /mnt/rootfs/etc/ssl/openssl.cnf && \
    ln -sf /etc/pki/tls/ct_log_list.cnf /mnt/rootfs/etc/ssl/ct_log_list.cnf

# Create non-root user and app directory
RUN echo 'nextjs:x:1001:0:Next.js:/app:/sbin/nologin' >> /mnt/rootfs/etc/passwd && \
    echo 'nodejs:x:1001:' >> /mnt/rootfs/etc/group && \
    mkdir -p /mnt/rootfs/app /mnt/rootfs/usr/local/bin && \
    chown -R 1001:0 /mnt/rootfs/app

# Next.js needs a writable cache directory for image optimization at runtime.
# g=rwX keeps it writable for an arbitrary OpenShift UID (GID 0 under
# restricted-v2), not just the numeric 1001 the USER directive names. Created
# here because the runtime image has no shell to RUN it in.
RUN mkdir -p /mnt/rootfs/app/.next/cache && \
    chown 1001:0 /mnt/rootfs/app/.next/cache && \
    chmod g=rwX /mnt/rootfs/app/.next/cache

# ---------- STIG hardening (applicable subset for ubi-micro) ----------
# Derived from DISA STIG controls applied in registry.access.redhat.com/ubi9/ubi-stig

# Crypto policy: FIPS-grade defaults for OpenSSL
RUN if [ -f /mnt/rootfs/etc/pki/tls/openssl.cnf ]; then \
      echo -e "\n[algorithm_sect]\ndefault_properties = fips=yes" >> /mnt/rootfs/etc/pki/tls/openssl.cnf; \
    fi

# Disable core dumps (xccdf_org.ssgproject.content_rule_disable_users_coredumps)
RUN mkdir -p /mnt/rootfs/etc/security/limits.d && \
    echo "* hard core 0" > /mnt/rootfs/etc/security/limits.d/50-coredump.conf

# Max concurrent login sessions (xccdf_org.ssgproject.content_rule_accounts_max_concurrent_login_sessions)
RUN echo "* hard maxlogins 10" > /mnt/rootfs/etc/security/limits.d/50-maxlogins.conf

# Ensure no empty passwords (xccdf_org.ssgproject.content_rule_no_empty_passwords)
RUN sed -i 's/\bnullok\b//g' /mnt/rootfs/etc/pam.d/* 2>/dev/null || true

# Restrictive umask (xccdf_org.ssgproject.content_rule_accounts_umask_etc_login_defs)
RUN if [ -f /mnt/rootfs/etc/login.defs ]; then \
      sed -i 's/^UMASK.*/UMASK\t\t077/' /mnt/rootfs/etc/login.defs; \
    fi

# Clean machine-id (regenerated at runtime)
RUN rm -f /mnt/rootfs/etc/machine-id && \
    touch /mnt/rootfs/etc/machine-id && \
    chmod 0444 /mnt/rootfs/etc/machine-id

# Ensure GPG checking for packages (xccdf_org.ssgproject.content_rule_ensure_gpgcheck_local_packages)
RUN if [ -f /mnt/rootfs/etc/dnf/dnf.conf ]; then \
      sed -i 's/^localpkg_gpgcheck.*/localpkg_gpgcheck=1/' /mnt/rootfs/etc/dnf/dnf.conf || \
      echo "localpkg_gpgcheck=1" >> /mnt/rootfs/etc/dnf/dnf.conf; \
    fi

# Remove leftover cache/tmp artifacts
RUN rm -rf /mnt/rootfs/var/cache/* /mnt/rootfs/var/log/* /mnt/rootfs/tmp/*

# ---------- Stage 4: runtime (the rootfs above, nothing else) ----------
# Built FROM scratch rather than ubi-micro: ubi-micro itself ships bash,
# coreutils-single, pcre2, ncurses, libselinux, libacl and libcap, and since
# the rootfs's rpmdb replaces ubi-micro's on COPY, those files would stay in
# the image while no longer being listed for scanners. Every package in this
# image is one the rpmdb below accounts for.
FROM scratch

# Copy minimal rootfs (glibc, libstdc++, openssl, brotli, CA bundle, user/group)
COPY --from=rootfs-builder /mnt/rootfs /
# Red Hat content-set metadata, which scanners use to pick the RHEL feed
COPY --from=registry.access.redhat.com/ubi9/ubi-micro:9.8 /root/buildinfo/ /root/buildinfo/

# Copy Node.js binary and shared libraries from build stage (compiled against same RHEL 9 glibc)
COPY --from=node-base /usr/bin/node /usr/local/bin/
COPY --from=node-base /usr/lib64/libnode.so* /usr/lib64/

WORKDIR /app

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    BACKEND_URL=http://backend:8080

# Copy Next.js standalone output (root-owned, read-only for all users)
COPY --from=build --chown=root:root --chmod=555 /app/public ./public
COPY --from=build --chown=root:root --chmod=555 /app/.next/standalone ./
COPY --from=build --chown=root:root --chmod=555 /app/.next/static ./.next/static

USER 1001

EXPOSE 3000

CMD ["node", "server.js"]
