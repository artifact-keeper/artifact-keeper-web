# ---------- Base: Node.js 22 on UBI 9 ----------
FROM registry.access.redhat.com/ubi9/ubi:9.5 AS node-base
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
FROM registry.access.redhat.com/ubi9/ubi:9.5 AS rootfs-builder

# Install only the shared libraries Node.js needs at runtime
RUN mkdir -p /mnt/rootfs && \
    dnf install --installroot /mnt/rootfs --releasever 9 \
        --setopt install_weak_deps=0 --nodocs -y \
        glibc-minimal-langpack \
        ca-certificates \
        libstdc++ \
        openssl-libs \
        zlib \
    && dnf --installroot /mnt/rootfs clean all \
    && rm -rf /mnt/rootfs/var/cache/* /mnt/rootfs/var/log/* /mnt/rootfs/tmp/*

# Create non-root user and app directory
RUN echo 'nextjs:x:1001:0:Next.js:/app:/sbin/nologin' >> /mnt/rootfs/etc/passwd && \
    echo 'nodejs:x:1001:' >> /mnt/rootfs/etc/group && \
    mkdir -p /mnt/rootfs/app /mnt/rootfs/usr/local/bin && \
    chown -R 1001:0 /mnt/rootfs/app

# ---------- Stage 4: UBI 9 Micro runtime ----------
FROM registry.access.redhat.com/ubi9/ubi-micro:9.5

# Copy minimal rootfs (glibc, libstdc++, openssl, ca-certs, user/group)
COPY --from=rootfs-builder /mnt/rootfs /

# Copy Node.js binary from build stage (compiled against same RHEL 9 glibc)
COPY --from=node-base /usr/bin/node /usr/local/bin/

WORKDIR /app

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

# Copy Next.js standalone output (read-only, no write permissions)
COPY --from=build --chown=1001:0 --chmod=555 /app/public ./public
COPY --from=build --chown=1001:0 --chmod=555 /app/.next/standalone ./
COPY --from=build --chown=1001:0 --chmod=555 /app/.next/static ./.next/static

USER 1001

EXPOSE 3000

CMD ["node", "server.js"]
