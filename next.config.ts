import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import { buildSecurityHeaders, isHttpsEnabled } from "./src/lib/security-headers";

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
    // HSTS and the CSP `upgrade-insecure-requests` directive are only emitted
    // when the deployment actually terminates TLS (AK_ENFORCE_HTTPS=true|1).
    // On a plain-HTTP default deploy they would force http->https rewrites the
    // server can't answer, breaking the whole UI. See #2222.
    //
    // NOTE: Next.js serializes `headers()` into the build output
    // (routes-manifest.json), so AK_ENFORCE_HTTPS is read at BUILD time, not
    // container runtime. Default (unset) keeps plain-HTTP deploys working out
    // of the box; build with AK_ENFORCE_HTTPS=true for TLS deployments (see the
    // Dockerfile build arg and src/lib/security-headers.ts).
    return [
      {
        source: "/(.*)",
        headers: buildSecurityHeaders(isHttpsEnabled()),
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
