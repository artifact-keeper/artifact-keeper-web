import { type NextRequest, NextResponse } from "next/server";

/**
 * Runtime proxy middleware — rewrites /api/* and /health requests to the
 * backend server.  Unlike next.config.ts `rewrites()`, environment variables
 * are read at **request time**, so `BACKEND_URL` can be set when the
 * container starts rather than when the image is built.
 */
export function middleware(request: NextRequest) {
  // Default targets the Docker Compose internal network (plain HTTP between containers)
  const backendUrl = process.env.BACKEND_URL || "http://backend:8080"; // NOSONAR — internal service-mesh traffic
  const { pathname, search } = request.nextUrl;

  return NextResponse.rewrite(new URL(`${pathname}${search}`, backendUrl));
}

export const config = {
  matcher: ["/api/:path*", "/health"],
};
