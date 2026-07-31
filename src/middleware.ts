import { type NextRequest, NextResponse } from "next/server";
import { buildSecurityHeaders, isHttpsEnabled } from "./lib/security-headers";

/**
 * Runtime proxy + security-header middleware.
 *
 * Two jobs, both evaluated per request so container env vars work at runtime
 * rather than being baked in at image build time:
 *
 * 1. Rewrites /api/*, /health, and native package format requests to the
 *    backend server (BACKEND_URL env var). See #56.
 * 2. Emits the security response headers (see src/lib/security-headers.ts),
 *    including the AK_ENFORCE_HTTPS-gated HSTS and CSP
 *    `upgrade-insecure-requests` directives. next.config.ts `headers()` is
 *    serialized into the build output, so keeping them there made
 *    AK_ENFORCE_HTTPS a build-time-only flag that silently did nothing when
 *    set on a running container. See #679.
 */

/**
 * Path prefixes proxied to the backend server: the management API plus every
 * native package-format endpoint the backend serves through the web UI.
 */
const PROXY_PATH_PREFIXES: readonly string[] = [
  "/api",
  "/health",
  // Native package format endpoints proxied to the backend
  "/pypi",
  "/npm",
  "/maven",
  "/debian",
  "/nuget",
  "/rpm",
  "/cargo",
  "/gems",
  "/lfs",
  "/pub",
  "/go",
  "/helm",
  "/composer",
  "/conan",
  "/alpine",
  "/conda",
  "/swift",
  "/terraform",
  "/cocoapods",
  "/hex",
  "/huggingface",
  "/jetbrains",
  "/chef",
  "/puppet",
  "/ansible",
  "/cran",
  "/ivy",
  "/vscode",
  "/proto",
  "/incus",
  // lxc-format repos are served on /lxc/* by the backend (alias of the Incus
  // handler, artifact-keeper#1272). Without this the proxy 404s lxc clients.
  "/lxc",
  "/ext",
  "/v2",
];

function isProxyPath(pathname: string): boolean {
  return PROXY_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Attach the security headers to a response. `AK_ENFORCE_HTTPS` is read from
 * the environment on every request, so flipping it on a running container
 * takes effect without a rebuild. Applied to both page responses and proxied
 * API responses so the headers survive the rewrite path.
 */
function withSecurityHeaders(response: NextResponse): NextResponse {
  for (const { key, value } of buildSecurityHeaders(isHttpsEnabled())) {
    response.headers.set(key, value);
  }
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // SSE event stream uses a dedicated App Router route handler for proper
  // streaming support. Middleware rewrites gzip-compress and close the
  // connection, which breaks long-lived SSE connections. Trailing-slash
  // variants must match too: `skipTrailingSlashRedirect` (next.config.ts)
  // means `/api/v1/events/stream/` reaches us verbatim. See #337.
  if (pathname.replace(/\/+$/, "") === "/api/v1/events/stream") {
    return withSecurityHeaders(NextResponse.next());
  }

  if (!isProxyPath(pathname)) {
    // Page or asset route: let Next.js handle it, with headers attached.
    return withSecurityHeaders(NextResponse.next());
  }

  // Default targets the Docker Compose internal network (plain HTTP between containers)
  const backendUrl = process.env.BACKEND_URL || "http://backend:8080"; // NOSONAR — internal service-mesh traffic

  return withSecurityHeaders(
    NextResponse.rewrite(new URL(`${pathname}${search}`, backendUrl)),
  );
}

export const config = {
  matcher: [
    // Run on every request except Next.js build/asset internals so that page
    // routes get the runtime security headers too. The middleware function
    // itself decides whether to proxy the path or pass it through.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
