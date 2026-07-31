import { describe, it, expect } from "vitest";
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  generateNonce,
  isHttpsEnabled,
} from "../security-headers";

const NONCE = "dGVzdC1ub25jZS0xMjM=";

function headerMap(headers: { key: string; value: string }[]) {
  return Object.fromEntries(headers.map((h) => [h.key, h.value]));
}

describe("buildContentSecurityPolicy", () => {
  it("omits upgrade-insecure-requests when HTTPS is disabled (default)", () => {
    const csp = buildContentSecurityPolicy(false, NONCE);
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("includes upgrade-insecure-requests when HTTPS is enabled", () => {
    const csp = buildContentSecurityPolicy(true, NONCE);
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("uses a nonce and strict-dynamic for script-src, never 'unsafe-inline'", () => {
    for (const csp of [
      buildContentSecurityPolicy(false, NONCE),
      buildContentSecurityPolicy(true, NONCE),
    ]) {
      expect(csp).toContain(
        `script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'`,
      );
      const scriptSrc = csp
        .split("; ")
        .find((d) => d.startsWith("script-src"));
      expect(scriptSrc).toBeDefined();
      expect(scriptSrc).not.toContain("unsafe-inline");
      expect(scriptSrc).not.toContain("unsafe-eval");
    }
  });

  it("embeds the given per-request nonce", () => {
    const csp = buildContentSecurityPolicy(false, "abc123");
    expect(csp).toContain("'nonce-abc123'");
    expect(csp).not.toContain(NONCE);
  });

  it("adds 'unsafe-eval' to script-src only when explicitly allowed (dev mode)", () => {
    const dev = buildContentSecurityPolicy(false, NONCE, {
      allowUnsafeEval: true,
    });
    expect(dev).toContain("'unsafe-eval'");
    const scriptSrc = dev.split("; ").find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("unsafe-inline");
  });

  it("keeps 'unsafe-inline' only for style-src (Shiki inline style attributes)", () => {
    const csp = buildContentSecurityPolicy(false, NONCE);
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("unsafe-inline");
  });

  it("keeps all transport-agnostic directives in both modes", () => {
    for (const csp of [
      buildContentSecurityPolicy(false, NONCE),
      buildContentSecurityPolicy(true, NONCE),
    ]) {
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("img-src 'self' data: blob:");
      expect(csp).toContain("font-src 'self' data:");
      // Remote-instance health checks fetch https://<remote>/health from the
      // browser; see instance-provider.tsx.
      expect(csp).toContain("connect-src 'self' https:");
      // object-src 'self' (not 'none'): the file viewer renders PDFs via a
      // same-origin <object type="application/pdf">.
      expect(csp).toContain("object-src 'self'");
      expect(csp).toContain("worker-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
    }
  });

  it("never produces a malformed trailing separator", () => {
    for (const csp of [
      buildContentSecurityPolicy(false, NONCE),
      buildContentSecurityPolicy(true, NONCE),
    ]) {
      expect(csp.endsWith(";")).toBe(false);
      expect(csp).not.toContain(";;");
      expect(csp.trimEnd()).toBe(csp);
    }
    // form-action is the last directive when HTTPS is off.
    expect(buildContentSecurityPolicy(false, NONCE).endsWith("form-action 'self'")).toBe(
      true,
    );
  });
});

describe("generateNonce", () => {
  it("produces base64 nonces", () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });

  it("produces a unique nonce per call", () => {
    const nonces = new Set(Array.from({ length: 100 }, () => generateNonce()));
    expect(nonces.size).toBe(100);
  });
});

describe("buildSecurityHeaders", () => {
  it("omits HSTS when HTTPS is disabled", () => {
    const map = headerMap(buildSecurityHeaders(false));
    expect(map["Strict-Transport-Security"]).toBeUndefined();
  });

  it("emits HSTS when HTTPS is enabled", () => {
    const map = headerMap(buildSecurityHeaders(true));
    expect(map["Strict-Transport-Security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });

  it("never includes Content-Security-Policy (per-request nonce, set by middleware)", () => {
    for (const headers of [
      buildSecurityHeaders(false),
      buildSecurityHeaders(true),
    ]) {
      expect(headers.some((h) => h.key === "Content-Security-Policy")).toBe(
        false,
      );
    }
  });

  it("always emits the transport-agnostic hardening headers in both modes", () => {
    for (const map of [
      headerMap(buildSecurityHeaders(false)),
      headerMap(buildSecurityHeaders(true)),
    ]) {
      expect(map["X-Frame-Options"]).toBe("DENY");
      expect(map["X-Content-Type-Options"]).toBe("nosniff");
      expect(map["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
      expect(map["Permissions-Policy"]).toBe(
        "camera=(), microphone=(), geolocation=()",
      );
      expect(map["X-DNS-Prefetch-Control"]).toBe("off");
    }
  });
});

describe("isHttpsEnabled", () => {
  it("defaults to false when the flag is unset", () => {
    expect(isHttpsEnabled({})).toBe(false);
  });

  it('is true for "true" and "1"', () => {
    expect(isHttpsEnabled({ AK_ENFORCE_HTTPS: "true" })).toBe(true);
    expect(isHttpsEnabled({ AK_ENFORCE_HTTPS: "1" })).toBe(true);
  });

  it("is false for any other value", () => {
    expect(isHttpsEnabled({ AK_ENFORCE_HTTPS: "false" })).toBe(false);
    expect(isHttpsEnabled({ AK_ENFORCE_HTTPS: "0" })).toBe(false);
    expect(isHttpsEnabled({ AK_ENFORCE_HTTPS: "yes" })).toBe(false);
    expect(isHttpsEnabled({ AK_ENFORCE_HTTPS: "" })).toBe(false);
  });
});
