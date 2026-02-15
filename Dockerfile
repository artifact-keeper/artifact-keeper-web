# ---------- Base: Node.js 22 on UBI 9 ----------
FROM registry.access.redhat.com/ubi9/ubi:9.7 AS node-base
RUN dnf module enable nodejs:22 -y && \
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
ARG BACKEND_URL=http://backend:8080
ENV BACKEND_URL=${BACKEND_URL}
RUN npm run build

# ---------- Stage 3: Build minimal rootfs ----------
FROM registry.access.redhat.com/ubi9/ubi:9.7 AS rootfs-builder

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

# Create non-root user and app directory
RUN echo 'nextjs:x:1001:0:Next.js:/app:/sbin/nologin' >> /mnt/rootfs/etc/passwd && \
    echo 'nodejs:x:1001:' >> /mnt/rootfs/etc/group && \
    mkdir -p /mnt/rootfs/app /mnt/rootfs/usr/local/bin && \
    chown -R 1001:0 /mnt/rootfs/app

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

# ---------- Stage 4: UBI 9 Micro runtime ----------
FROM registry.access.redhat.com/ubi9/ubi-micro:9.5

# Copy minimal rootfs (glibc, libstdc++, openssl, brotli, ca-certs, user/group)
COPY --from=rootfs-builder /mnt/rootfs /

# Copy Node.js binary and shared libraries from build stage (compiled against same RHEL 9 glibc)
COPY --from=node-base /usr/bin/node /usr/local/bin/
COPY --from=node-base /usr/lib64/libnode.so* /usr/lib64/

WORKDIR /app

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Copy Next.js standalone output (root-owned, read-only for all users)
COPY --from=build --chown=root:root --chmod=555 /app/public ./public
COPY --from=build --chown=root:root --chmod=555 /app/.next/standalone ./
COPY --from=build --chown=root:root --chmod=555 /app/.next/static ./.next/static

USER 1001

EXPOSE 3000

CMD ["node", "server.js"]
