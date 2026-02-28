import { type NextRequest, NextResponse } from "next/server";

/**
 * Runtime proxy middleware — rewrites /api/*, /health, and native package
 * format requests to the backend server. Unlike next.config.ts `rewrites()`,
 * environment variables are read at **request time**, so `BACKEND_URL` can
 * be set when the container starts rather than when the image is built.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // SSE event stream uses a dedicated App Router route handler for proper
  // streaming support. Middleware rewrites gzip-compress and close the
  // connection, which breaks long-lived SSE connections.
  if (pathname === "/api/v1/events/stream") {
    return NextResponse.next();
  }

  // Default targets the Docker Compose internal network (plain HTTP between containers)
  const backendUrl = process.env.BACKEND_URL || "http://backend:8080"; // NOSONAR — internal service-mesh traffic

  return NextResponse.rewrite(new URL(`${pathname}${search}`, backendUrl));
}

export const config = {
  matcher: [
    "/api/:path*",
    "/health",
    // Native package format endpoints proxied to the backend
    "/pypi/:path*",
    "/npm/:path*",
    "/maven/:path*",
    "/debian/:path*",
    "/nuget/:path*",
    "/rpm/:path*",
    "/cargo/:path*",
    "/gems/:path*",
    "/lfs/:path*",
    "/pub/:path*",
    "/go/:path*",
    "/helm/:path*",
    "/composer/:path*",
    "/conan/:path*",
    "/alpine/:path*",
    "/conda/:path*",
    "/swift/:path*",
    "/terraform/:path*",
    "/cocoapods/:path*",
    "/hex/:path*",
    "/huggingface/:path*",
    "/jetbrains/:path*",
    "/chef/:path*",
    "/puppet/:path*",
    "/ansible/:path*",
    "/cran/:path*",
    "/ivy/:path*",
    "/vscode/:path*",
    "/proto/:path*",
    "/incus/:path*",
    "/ext/:path*",
    "/v2",
    "/v2/:path*",
  ],
};
