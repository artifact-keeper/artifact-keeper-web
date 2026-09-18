// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  SAML_SLUG_MAX_LENGTH,
  samlAuthUrls,
  samlConflictField,
  validateSamlSlug,
} from "../saml-slug";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("validateSamlSlug", () => {
  it("accepts the URL-safe forms the backend accepts", () => {
    for (const slug of ["okta", "okta-prod", "okta_prod", "idp2", "0", "a"]) {
      expect(validateSamlSlug(slug)).toBeNull();
    }
    expect(validateSamlSlug("a".repeat(SAML_SLUG_MAX_LENGTH))).toBeNull();
  });

  it("treats an empty slug as valid — it means the provider has no alias", () => {
    expect(validateSamlSlug("")).toBeNull();
  });

  it("rejects non-canonical and unsafe spellings", () => {
    for (const slug of ["Okta", "-okta", "_okta", "okta prod", "okta/prod", "okta.prod", "ökta"]) {
      expect(validateSamlSlug(slug)).toMatch(/lowercase/);
    }
  });

  it("rejects a slug longer than the column", () => {
    expect(validateSamlSlug("a".repeat(SAML_SLUG_MAX_LENGTH + 1))).toMatch(
      /at most 64 characters/,
    );
  });

  it("rejects a UUID-shaped slug, which the routes would resolve as an id", () => {
    expect(validateSamlSlug("550e8400-e29b-41d4-a716-446655440000")).toMatch(
      /must not be a UUID/,
    );
  });
});

describe("samlAuthUrls", () => {
  it("addresses the provider by slug when one is set", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://ak.example.com");
    expect(samlAuthUrls({ id: "550e8400-e29b-41d4-a716-446655440000", slug: "okta" })).toEqual({
      loginUrl: "https://ak.example.com/api/v1/auth/sso/saml/okta/login",
      acsUrl: "https://ak.example.com/api/v1/auth/sso/saml/okta/acs",
    });
  });

  it("falls back to the provider id when there is no slug", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://ak.example.com");
    expect(samlAuthUrls({ id: "saml-1", slug: null })).toEqual({
      loginUrl: "https://ak.example.com/api/v1/auth/sso/saml/saml-1/login",
      acsUrl: "https://ak.example.com/api/v1/auth/sso/saml/saml-1/acs",
    });
  });

  it("falls back to the browser origin when no API URL is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    expect(samlAuthUrls({ id: "saml-1" })?.acsUrl).toBe(
      `${window.location.origin}/api/v1/auth/sso/saml/saml-1/acs`,
    );
  });

  it("returns null when the provider has neither an id nor a slug", () => {
    expect(samlAuthUrls({})).toBeNull();
    expect(samlAuthUrls({ id: "", slug: "" })).toBeNull();
  });
});

describe("samlConflictField", () => {
  it("points at the slug when the backend names it", () => {
    expect(
      samlConflictField({
        code: "CONFLICT",
        message: "SAML slug 'okta' is already used by another SAML configuration",
      }),
    ).toBe("slug");
  });

  it("points at the name for a duplicate-name conflict", () => {
    expect(
      samlConflictField({
        code: "CONFLICT",
        message: "a SAML configuration named 'Okta' already exists",
      }),
    ).toBe("name");
  });

  it("recognizes an ApiError carrying the status instead of the code", () => {
    expect(
      samlConflictField({ status: 409, message: "API error 409: {\"code\":\"CONFLICT\"}" }),
    ).toBe("name");
  });

  it("ignores errors that are not conflicts", () => {
    expect(samlConflictField({ code: "VALIDATION_ERROR", message: "bad slug" })).toBeNull();
    expect(samlConflictField({ status: 500 })).toBeNull();
    expect(samlConflictField("fail")).toBeNull();
    expect(samlConflictField(null)).toBeNull();
  });
});
