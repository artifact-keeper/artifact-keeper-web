import { describe, it, expect } from "vitest";
import { totpChallengeToken } from "../totp-challenge";

describe("totpChallengeToken (artifact-keeper#5484)", () => {
  it("returns the pending token from a challenge", () => {
    expect(
      totpChallengeToken({
        access_token: "",
        refresh_token: "",
        token_type: "Bearer",
        expires_in: 0,
        totp_required: true,
        totp_token: "pending.jwt",
      }),
    ).toBe("pending.jwt");
  });

  it("returns null for a session answer (no TOTP fields)", () => {
    expect(
      totpChallengeToken({
        access_token: "AT",
        refresh_token: "RT",
        token_type: "Bearer",
        expires_in: 1800,
      }),
    ).toBeNull();
  });

  it("requires totp_required to be exactly true and the token a non-empty string", () => {
    expect(totpChallengeToken({ totp_required: "true", totp_token: "t" })).toBeNull();
    expect(totpChallengeToken({ totp_required: false, totp_token: "t" })).toBeNull();
    expect(totpChallengeToken({ totp_required: true })).toBeNull();
    expect(totpChallengeToken({ totp_required: true, totp_token: "" })).toBeNull();
    expect(totpChallengeToken({ totp_required: true, totp_token: 42 })).toBeNull();
  });

  it("returns null for non-object bodies", () => {
    expect(totpChallengeToken(null)).toBeNull();
    expect(totpChallengeToken(undefined)).toBeNull();
    expect(totpChallengeToken("totp_required")).toBeNull();
  });
});
