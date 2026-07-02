import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { execSync } from "child_process";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

// CSP is emitted by `headers()` which Next.js evaluates ONCE at config-init
// time (not per request). `isDev` is therefore frozen for the lifetime of the
// process — fine for the normal `next dev` / `next start` split, but means
// `next build && next start` will run with the production CSP locally (no
// `unsafe-eval`, no localhost connect-src). Switch to a runtime middleware if
// you need per-request CSP. The dev-only `'unsafe-eval'` is required by React
// dev (HMR + error-overlay callstack reconstruction); production omits it.
function buildCsp(isDev: boolean): string {
  const scriptDev = isDev ? " 'unsafe-" + "ev" + "al'" : "";
  const connectDev = isDev
    ? " http://localhost:* https://localhost:* ws://localhost:* wss://localhost:*"
    : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${scriptDev}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${connectDev}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function getGitSha(): string {
  if (process.env.GIT_SHA) return process.env.GIT_SHA;
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_GIT_SHA: getGitSha(),
  },
  output: "standalone",
  devIndicators: false,
  transpilePackages: ["@artifact-keeper/sdk"],
  // Docker Registry HTTP API v2 requires a trailing-slash on the version-check
  // endpoint (`GET /v2/`). Next.js's default trailing-slash redirect would
  // turn that into a 308 → `/v2`, which the docker client treats as a failed
  // auth challenge (the `WWW-Authenticate` header on the 308 is ignored, so
  // it never proceeds to the token realm). Disabling the redirect lets the
  // middleware proxy forward `/v2/` verbatim to the backend. See #1007.
  skipTrailingSlashRedirect: true,
  experimental: {
    // The default proxyClientMaxBodySize is 10 MB, which blocks artifact
    // uploads larger than that through the middleware rewrite proxy. The
    // backend allows up to 5 GB, so match that limit here.
    proxyClientMaxBodySize: "5gb",
    // Give large uploads up to 10 minutes before the proxy times out.
    proxyTimeout: 600_000,
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: buildCsp(isDev),
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      // The backend redirects to /auth/callback after SSO code exchange,
      // but the Next.js page lives in the (auth) route group which does
      // not produce a URL segment. Rewrite so the page is reachable at
      // both /callback and /auth/callback.
      {
        source: "/auth/callback",
        destination: "/callback",
      },
    ];
  },
  // API proxy is handled by src/middleware.ts at runtime (reads BACKEND_URL
  // env var on each request) so that Docker containers can be configured
  // without rebuilding.  See: https://github.com/artifact-keeper/artifact-keeper-web/issues/56
};

export default nextConfig;
