import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { execSync } from "child_process";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

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
  async headers() {
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
            // 'unsafe-inline' is still required for script-src because Next.js
            // injects inline <script> tags for page data (__NEXT_DATA__) and
            // runtime configuration. The long-term fix is to switch to
            // nonce-based CSP via next.config.ts experimental.serverActions or a
            // custom Document with per-request nonces.
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
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
