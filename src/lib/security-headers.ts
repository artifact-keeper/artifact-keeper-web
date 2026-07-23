/**
 * Security response headers for every route (wired into `next.config.ts`'s
 * `async headers()`).
 *
 * Two of these headers only make sense when the deployment actually terminates
 * TLS, and are actively harmful on a plain-HTTP deployment:
 *
 *   - `Strict-Transport-Security` (HSTS)
 *   - the `upgrade-insecure-requests` CSP directive
 *
 * On the common first-run default deployment (`http://<IP>:30080`, no TLS),
 * `upgrade-insecure-requests` makes the browser rewrite every same-origin
 * request from http:// to https://. Port 30080 only serves plain HTTP, so the
 * upgraded `https://<IP>:30080/*.js` requests fail to connect and the whole UI
 * becomes inaccessible. See artifact-keeper/artifact-keeper#2222.
 *
 * These two are therefore gated behind an explicit opt-in
 * (`AK_ENFORCE_HTTPS`), default OFF, so a plain-HTTP default deploy works out
 * of the box while real TLS deployments keep the hardening.
 */

export interface SecurityHeader {
  key: string;
  value: string;
}

/**
 * Base CSP directives that are transport-agnostic and always emitted.
 *
 * 'unsafe-inline' is still required for script-src because Next.js injects
 * inline <script> tags for page data (__NEXT_DATA__) and runtime
 * configuration. The long-term fix is to switch to nonce-based CSP via
 * next.config.ts experimental.serverActions or a custom Document with
 * per-request nonces.
 */
const BASE_CSP_DIRECTIVES: readonly string[] = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

/**
 * Build the `Content-Security-Policy` value. The `upgrade-insecure-requests`
 * directive is only appended when the deployment serves the UI over HTTPS.
 *
 * Built programmatically from a directive list so dropping the trailing
 * directive can never leave a malformed `"; "` suffix.
 */
export function buildContentSecurityPolicy(httpsEnabled: boolean): string {
  const directives = [...BASE_CSP_DIRECTIVES];
  if (httpsEnabled) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

/**
 * Build the full list of security headers applied to every route.
 *
 * When `httpsEnabled` is false (the default), HSTS is omitted and the CSP
 * excludes `upgrade-insecure-requests`; every other header is unconditional.
 */
export function buildSecurityHeaders(httpsEnabled: boolean): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
    { key: "X-DNS-Prefetch-Control", value: "on" },
  ];

  if (httpsEnabled) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }

  headers.push({
    key: "Content-Security-Policy",
    value: buildContentSecurityPolicy(httpsEnabled),
  });

  return headers;
}

/**
 * Whether the deployment serves the web UI over HTTPS (TLS terminated),
 * controlled by the `AK_ENFORCE_HTTPS` env var.
 *
 * Set `AK_ENFORCE_HTTPS=true` (or `1`) when the UI is served behind TLS to
 * enable HSTS + `upgrade-insecure-requests`. Leave unset/false for plain-HTTP
 * deployments. Any other value is treated as false.
 *
 * NOTE: this is consumed from `next.config.ts` `headers()`, which Next.js
 * serializes into the build output, so the flag is read at BUILD time (e.g. the
 * Dockerfile `AK_ENFORCE_HTTPS` build arg), not container runtime.
 */
export function isHttpsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const flag = env.AK_ENFORCE_HTTPS;
  return flag === "true" || flag === "1";
}
