import { describe, it, expect } from "vitest";
import {
  isCredentialRejection,
  parseRetryAfter,
  rateLimitMessage,
  REPEATED_FAILURE_HINT,
  unwrapSignIn,
  sameOriginLoginUrl,
} from "../sign-in-guards";

const ORIGIN = "https://registry.example.com";

describe("sameOriginLoginUrl (#1153)", () => {
  it("allows a same-origin path, keeping query and hash", () => {
    expect(sameOriginLoginUrl("/api/v1/auth/sso/oidc/abc/login?x=1#h", ORIGIN)).toBe(
      "/api/v1/auth/sso/oidc/abc/login?x=1#h"
    );
  });

  it("allows an absolute URL on the same origin", () => {
    expect(sameOriginLoginUrl(`${ORIGIN}/login/sso`, ORIGIN)).toBe("/login/sso");
  });

  it.each([
    ["protocol-relative", "//attacker.example/login"],
    ["backslash", "/\\attacker.example/login"],
    ["other https host", "https://other.example/login"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,hi"],
    ["empty", ""],
  ])("rejects %s", (_label, value) => {
    expect(sameOriginLoginUrl(value, ORIGIN)).toBeNull();
  });

  it("rejects a non-string", () => {
    expect(sameOriginLoginUrl(undefined, ORIGIN)).toBeNull();
  });
});

describe("isCredentialRejection (#1153)", () => {
  it("is true for the backend 401 body", () => {
    expect(isCredentialRejection({ code: "AUTH_ERROR", message: "User not found" })).toBe(true);
    expect(isCredentialRejection({ body: { code: "AUTH_ERROR" } })).toBe(true);
    expect(isCredentialRejection({ status: 401 })).toBe(true);
  });

  it("is false for other failures", () => {
    expect(isCredentialRejection({ code: "INTERNAL_ERROR", message: "boom" })).toBe(false);
    expect(isCredentialRejection(new Error("Failed to fetch"))).toBe(false);
    expect(isCredentialRejection("nope")).toBe(false);
    expect(isCredentialRejection(null)).toBe(false);
  });
});

describe("parseRetryAfter (#1239)", () => {
  it("reads delta-seconds", () => {
    expect(parseRetryAfter("42")).toBe(42);
    expect(parseRetryAfter(" 7 ")).toBe(7);
  });
  it("converts an HTTP-date to seconds from now", () => {
    const now = Date.parse("Wed, 18 Nov 2026 12:00:00 GMT");
    expect(parseRetryAfter("Wed, 18 Nov 2026 12:00:30 GMT", now)).toBe(30);
    expect(parseRetryAfter("Wed, 18 Nov 2026 11:00:00 GMT", now)).toBe(0);
  });
  it("returns undefined when absent or unusable", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });
});

describe("unwrapSignIn (#1239)", () => {
  const res = (status: number, headers: Record<string, string> = {}) =>
    new Response(null, { status, headers });

  it("returns data on success", async () => {
    await expect(
      unwrapSignIn(Promise.resolve({ data: 1, error: undefined, response: res(200) }))
    ).resolves.toBe(1);
  });

  it("carries the 429 status and Retry-After for a plain-text body", async () => {
    const err = await unwrapSignIn(
      Promise.resolve({
        data: undefined,
        error: "Rate limit exceeded. Please try again later.",
        response: res(429, { "Retry-After": "30" }),
      })
    ).catch((e) => e);
    expect(err).toEqual({
      message: "Rate limit exceeded. Please try again later.",
      status: 429,
      retryAfter: 30,
    });
    expect(rateLimitMessage(err)).toBe("Too many sign-in attempts. Try again in 30 seconds.");
  });

  it("keeps the JSON body fields on a 401 so it still reads as a credential rejection", async () => {
    const err = await unwrapSignIn(
      Promise.resolve({
        data: undefined,
        error: { code: "AUTH_ERROR", message: "Invalid username or password" },
        response: res(401),
      })
    ).catch((e) => e);
    expect(err).toMatchObject({ code: "AUTH_ERROR", status: 401 });
    expect(isCredentialRejection(err)).toBe(true);
    expect(rateLimitMessage(err)).toBeNull();
  });
});

describe("rateLimitMessage (#1239)", () => {
  it("uses singular for one second and a fallback without Retry-After", () => {
    expect(rateLimitMessage({ status: 429, retryAfter: 1 })).toBe(
      "Too many sign-in attempts. Try again in 1 second."
    );
    expect(rateLimitMessage({ status: 429 })).toBe(
      "Too many sign-in attempts. Try again in a moment."
    );
    expect(rateLimitMessage({ status: 503, retryAfter: 1 })).toBeNull();
  });
  it("the repeated-failure hint never mentions locking", () => {
    expect(REPEATED_FAILURE_HINT).not.toMatch(/lock/i);
  });
});
