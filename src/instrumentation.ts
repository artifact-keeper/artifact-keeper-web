import { isHttpsEnabled } from "./lib/security-headers";

/**
 * Next.js instrumentation hook — runs once at server startup. Surfaces the
 * effective security-header mode so operators can confirm from the container
 * logs that AK_ENFORCE_HTTPS was picked up (it is evaluated per request in
 * src/middleware.ts, so a runtime `docker run -e` change takes effect without
 * a rebuild). See #679.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (isHttpsEnabled()) {
    console.log(
      "[security] AK_ENFORCE_HTTPS is set — emitting Strict-Transport-Security " +
        "and CSP upgrade-insecure-requests on every response.",
    );
  } else {
    console.log(
      "[security] AK_ENFORCE_HTTPS is not set — HSTS and CSP " +
        "upgrade-insecure-requests are DISABLED (plain-HTTP mode). Set " +
        "AK_ENFORCE_HTTPS=true on the container when the UI is served behind TLS.",
    );
  }
}
