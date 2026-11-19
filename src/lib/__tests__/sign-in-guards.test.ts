import { describe, it, expect } from "vitest";
import {
  isCredentialRejection,
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
