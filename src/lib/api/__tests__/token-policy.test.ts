import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();
// Real ApiError and narrowEnum so the status/enum handling under test is the
// production one; only the transport is stubbed.
vi.mock("../fetch", async () => {
  const actual = await vi.importActual<typeof import("../fetch")>("../fetch");
  return {
    ...actual,
    apiFetch: (...a: unknown[]) => mockApiFetch(...a),
  };
});
vi.mock("@/lib/sdk-client", () => ({}));

import { ApiError } from "../fetch";
import {
  TOKEN_POLICY_MAX_DAYS,
  TOKEN_POLICY_QUERY_KEY,
  isPolicyPinnedError,
  policyErrorField,
  readTokenExpiryInfo,
  tokenPolicyApi,
} from "../token-policy";

const SETTINGS = {
  policy: {
    require_expiration: true,
    min_days: 7,
    max_days: 365,
    default_days: 90,
    apply_to_service_accounts: false,
  },
  source: "database",
  editable: true,
  non_expiring_user_tokens: 3,
  non_expiring_service_account_tokens: 1,
};

/** The backend's error envelope: `{ code, message }` JSON. */
function errorBody(message: string): string {
  return JSON.stringify({ code: "VALIDATION_ERROR", message });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("tokenPolicyApi.get", () => {
  it("reads the admin token-policy endpoint", async () => {
    mockApiFetch.mockResolvedValue(SETTINGS);

    const result = await tokenPolicyApi.get();

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/admin/settings/token-policy",
    );
    expect(result.policy.min_days).toBe(7);
    expect(result.policy.default_days).toBe(90);
    expect(result.source).toBe("database");
    expect(result.editable).toBe(true);
    expect(result.non_expiring_user_tokens).toBe(3);
    expect(result.non_expiring_service_account_tokens).toBe(1);
  });

  it("normalizes an absent or null default_days to null", async () => {
    mockApiFetch.mockResolvedValue({
      ...SETTINGS,
      policy: { ...SETTINGS.policy, default_days: null },
    });
    expect((await tokenPolicyApi.get()).policy.default_days).toBeNull();

    const withoutDefault: Record<string, unknown> = { ...SETTINGS.policy };
    delete withoutDefault.default_days;
    mockApiFetch.mockResolvedValue({ ...SETTINGS, policy: withoutDefault });
    expect((await tokenPolicyApi.get()).policy.default_days).toBeNull();
  });

  it("surfaces an env-pinned policy as source 'environment'", async () => {
    mockApiFetch.mockResolvedValue({
      ...SETTINGS,
      source: "environment",
      editable: false,
    });

    const result = await tokenPolicyApi.get();

    expect(result.source).toBe("environment");
    expect(result.editable).toBe(false);
  });

  it("degrades an unmodelled source to 'database' instead of throwing", async () => {
    mockApiFetch.mockResolvedValue({ ...SETTINGS, source: "vault" });

    const result = await tokenPolicyApi.get();

    expect(result.source).toBe("database");
    expect(console.warn).toHaveBeenCalled();
  });

  it("rejects a structurally malformed response", async () => {
    mockApiFetch.mockResolvedValue({ policy: { min_days: "seven" } });

    await expect(tokenPolicyApi.get()).rejects.toThrow();
  });
});

describe("tokenPolicyApi.update", () => {
  it("PUTs the policy wrapped in a `policy` body and adapts the echo", async () => {
    mockApiFetch.mockResolvedValue(SETTINGS);

    const result = await tokenPolicyApi.update({
      require_expiration: true,
      min_days: 7,
      max_days: 365,
      default_days: 90,
      apply_to_service_accounts: false,
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/admin/settings/token-policy",
      {
        method: "PUT",
        body: JSON.stringify({
          policy: {
            require_expiration: true,
            min_days: 7,
            max_days: 365,
            default_days: 90,
            apply_to_service_accounts: false,
          },
        }),
      },
    );
    expect(result.editable).toBe(true);
  });

  it("propagates the backend refusal instead of swallowing it", async () => {
    mockApiFetch.mockRejectedValue(new ApiError(409, errorBody("pinned")));

    await expect(
      tokenPolicyApi.update({
        require_expiration: false,
        min_days: 1,
        max_days: 90,
        default_days: null,
        apply_to_service_accounts: false,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("isPolicyPinnedError", () => {
  it("is true only for the 409 the env pin answers with", () => {
    expect(isPolicyPinnedError(new ApiError(409, errorBody("pinned")))).toBe(true);
    expect(isPolicyPinnedError(new ApiError(400, errorBody("bad")))).toBe(false);
    expect(isPolicyPinnedError(new Error("API error 409: pinned"))).toBe(false);
    expect(isPolicyPinnedError(undefined)).toBe(false);
  });
});

describe("policyErrorField", () => {
  it.each([
    ["min_days must be at least 1", "min_days"],
    ["max_days (5) must be >= min_days (7)", "max_days"],
    [`max_days (9999) must be <= ${TOKEN_POLICY_MAX_DAYS}`, "max_days"],
    [
      "default_days (400) must fall within [min_days, max_days] = [7, 365]",
      "default_days",
    ],
  ])("maps %s onto the %s field", (message, field) => {
    expect(policyErrorField(new ApiError(400, errorBody(message)))).toBe(field);
  });

  it("returns null when the 400 names no policy field", () => {
    expect(policyErrorField(new ApiError(400, errorBody("nope")))).toBeNull();
  });

  it("returns null for a non-400 and for a non-ApiError", () => {
    expect(policyErrorField(new ApiError(409, errorBody("min_days")))).toBeNull();
    expect(policyErrorField(new Error("min_days must be at least 1"))).toBeNull();
  });

  it("still maps the field when the body is not the JSON error envelope", () => {
    expect(policyErrorField(new ApiError(400, "min_days must be at least 1"))).toBe(
      "min_days",
    );
  });
});

describe("readTokenExpiryInfo", () => {
  it("reads expires_at and policy_applied off a 1.10.0 mint", () => {
    expect(
      readTokenExpiryInfo({
        id: "1",
        token: "ak_x",
        expires_at: "2026-12-17T09:30:00Z",
        policy_applied: true,
      }),
    ).toEqual({ expires_at: "2026-12-17T09:30:00Z", policy_applied: true });
  });

  it("treats a pre-1.10.0 response as 'never expires, no policy'", () => {
    expect(readTokenExpiryInfo({ id: "1", token: "ak_x" })).toEqual({
      expires_at: null,
      policy_applied: false,
    });
  });

  it("normalizes explicit nulls", () => {
    expect(
      readTokenExpiryInfo({ expires_at: null, policy_applied: null }),
    ).toEqual({ expires_at: null, policy_applied: false });
  });

  it("degrades a non-object response rather than throwing", () => {
    expect(readTokenExpiryInfo("nope")).toEqual({
      expires_at: null,
      policy_applied: false,
    });
    expect(readTokenExpiryInfo(undefined)).toEqual({
      expires_at: null,
      policy_applied: false,
    });
  });
});

describe("TOKEN_POLICY_QUERY_KEY", () => {
  it("is stable so the card and its invalidations agree", () => {
    expect(TOKEN_POLICY_QUERY_KEY).toEqual(["admin", "token-policy"]);
  });
});
