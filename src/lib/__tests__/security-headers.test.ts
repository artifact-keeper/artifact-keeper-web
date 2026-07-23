import { describe, it, expect } from "vitest";
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  isHttpsEnabled,
} from "../security-headers";

function headerMap(headers: { key: string; value: string }[]) {
  return Object.fromEntries(headers.map((h) => [h.key, h.value]));
}

describe("buildContentSecurityPolicy", () => {
  it("omits upgrade-insecure-requests when HTTPS is disabled (default)", () => {
    const csp = buildContentSecurityPolicy(false);
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("includes upgrade-insecure-requests when HTTPS is enabled", () => {
    const csp = buildContentSecurityPolicy(true);
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("keeps all transport-agnostic directives in both modes", () => {
    for (const csp of [
      buildContentSecurityPolicy(false),
      buildContentSecurityPolicy(true),
    ]) {
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(csp).toContain("img-src 'self' data: blob:");
      expect(csp).toContain("font-src 'self' data:");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
    }
  });

  it("never produces a malformed trailing separator", () => {
    expect(buildContentSecurityPolicy(false).endsWith(";")).toBe(false);
    expect(buildContentSecurityPolicy(false)).not.toContain(";;");
    expect(buildContentSecurityPolicy(false).trimEnd()).toBe(
      buildContentSecurityPolicy(false),
    );
    // form-action is the last directive when HTTPS is off.
    expect(buildContentSecurityPolicy(false).endsWith("form-action 'self'")).toBe(
      true,
    );
  });
});

describe("buildSecurityHeaders", () => {
  it("omits HSTS and upgrade-insecure-requests when HTTPS is disabled", () => {
    const map = headerMap(buildSecurityHeaders(false));
    expect(map["Strict-Transport-Security"]).toBeUndefined();
    expect(map["Content-Security-Policy"]).not.toContain(
      "upgrade-insecure-requests",
    );
  });

  it("emits HSTS and upgrade-insecure-requests when HTTPS is enabled", () => {
    const map = headerMap(buildSecurityHeaders(true));
    expect(map["Strict-Transport-Security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(map["Content-Security-Policy"]).toContain(
      "upgrade-insecure-requests",
    );
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
      expect(map["X-DNS-Prefetch-Control"]).toBe("on");
      expect(map["Content-Security-Policy"]).toContain("default-src 'self'");
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
