import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import createNextIntlPlugin from "next-intl/plugin";

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
  // API proxy AND security headers are handled by src/middleware.ts at runtime
  // (reads BACKEND_URL and AK_ENFORCE_HTTPS env vars on each request) so that
  // Docker containers can be configured without rebuilding. The
  // Content-Security-Policy additionally carries a per-request nonce, which a
  // static `headers()` block could never produce — see
  // https://github.com/artifact-keeper/artifact-keeper-web/issues/674.
  // A next.config.ts `headers()` block would be serialized into the build
  // output (routes-manifest.json), making AK_ENFORCE_HTTPS build-time-only —
  // see https://github.com/artifact-keeper/artifact-keeper-web/issues/679 and
  // https://github.com/artifact-keeper/artifact-keeper-web/issues/56
};

// next-intl plugin wires `src/i18n/request.ts` (locale + messages, resolved
// per-request from the NEXT_LOCALE cookie) into the app. The "no-prefix"
// strategy is used so existing route paths, deep links and Playwright specs
// are unaffected — the locale is carried by a cookie, not a URL segment.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
