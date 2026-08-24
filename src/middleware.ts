import { type NextRequest, NextResponse } from "next/server";
import {
  NONCE_HEADER,
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  generateNonce,
  isHttpsEnabled,
} from "./lib/security-headers";

/**
 * Runtime proxy + security-header middleware.
 *
 * Three jobs, all evaluated per request so container env vars work at runtime
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
 * 3. Generates a per-request CSP nonce. The nonce is placed in the
 *    `Content-Security-Policy` built for the request and forwarded on the
 *    request headers (`Content-Security-Policy` + `x-nonce`): during SSR
 *    Next.js parses the nonce out of the request CSP and stamps it onto the
 *    framework scripts it renders, and the root layout reads `x-nonce` via
 *    `headers()` to pass it to `next-themes`. The same CSP value is set on
 *    the response. This is what allows `script-src` to drop
 *    `'unsafe-inline'`. See #674.
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
 * takes effect without a rebuild. Applied to page pass-through, proxied API
 * responses, and the SSE pass-through so the headers survive every path.
 */
function withSecurityHeaders(
  response: NextResponse,
  contentSecurityPolicy: string,
  httpsEnabled: boolean,
): NextResponse {
  for (const { key, value } of buildSecurityHeaders(httpsEnabled)) {
    response.headers.set(key, value);
  }
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const httpsEnabled = isHttpsEnabled();
  const nonce = generateNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy(
    httpsEnabled,
    nonce,
    // React dev mode uses eval to reconstruct server-side error stacks in the
    // browser; production uses neither eval nor unsafe-inline.
    { allowUnsafeEval: process.env.NODE_ENV !== "production" },
  );

  // Forward the nonce (and the CSP carrying it) on the request so Next.js
  // stamps it onto framework scripts during SSR and server components can
  // read it via `headers()`.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  const init = { request: { headers: requestHeaders } };

  // SSE event stream uses a dedicated App Router route handler for proper
  // streaming support. Middleware rewrites gzip-compress and close the
  // connection, which breaks long-lived SSE connections. Trailing-slash
  // variants must match too: `skipTrailingSlashRedirect` (next.config.ts)
  // means `/api/v1/events/stream/` reaches us verbatim. See #337.
  if (pathname.replace(/\/+$/, "") === "/api/v1/events/stream") {
    return withSecurityHeaders(
      NextResponse.next(init),
      contentSecurityPolicy,
      httpsEnabled,
    );
  }

  if (!isProxyPath(pathname)) {
    // Page or asset route: let Next.js handle it, with headers attached.
    return withSecurityHeaders(
      NextResponse.next(init),
      contentSecurityPolicy,
      httpsEnabled,
    );
  }

  // Default targets the Docker Compose internal network (plain HTTP between containers)
  const backendUrl = process.env.BACKEND_URL || "http://backend:8080"; // NOSONAR — internal service-mesh traffic

  return withSecurityHeaders(
    NextResponse.rewrite(new URL(`${pathname}${search}`, backendUrl), init),
    contentSecurityPolicy,
    httpsEnabled,
  );
}

export const config = {
  matcher: [
    /*
     * Run on every request except Next.js build/asset internals (their
     * responses are not documents and need no CSP), so that page routes get
     * the runtime security headers and a per-request nonce. The middleware
     * function itself decides whether to proxy the path or pass it through.
     * Prefetch requests (from `next/link`) are skipped: they are RSC
     * payloads, not documents, and must not be cached with a per-request
     * nonce.
     */
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
