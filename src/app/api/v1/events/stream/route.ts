import { type NextRequest } from "next/server";

/**
 * SSE proxy route handler. Next.js middleware rewrites don't support
 * long-lived streaming connections (they gzip-compress and close the
 * response). This route handler fetches from the backend and pipes
 * the SSE stream directly to the client without compression.
 */
export async function GET(request: NextRequest) {
  const backendUrl =
    process.env.BACKEND_URL || "http://backend:8080"; // NOSONAR

  const url = new URL("/api/v1/events/stream", backendUrl);

  // Forward cookies so the backend can authenticate the request.
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  headers.set("accept", "text/event-stream");

  const upstream = await fetch(url, { headers });

  if (!upstream.ok || !upstream.body) {
    return new Response(upstream.statusText, { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
