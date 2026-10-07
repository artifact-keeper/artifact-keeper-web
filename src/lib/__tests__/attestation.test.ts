import { describe, it, expect } from "vitest";
import { readAttestation, withoutAttestationBundle, attestationMethodLabel } from "../attestation";

const BUNDLE = { mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json" };

describe("readAttestation", () => {
  it("reads the 1.11.0 key-based record", () => {
    const a = readAttestation({
      attestation: BUNDLE,
      attestation_verification: {
        verified: true,
        method: "sigstore-key",
        key_fingerprint: "SHA256:abc",
        verified_at: "2026-10-06T10:00:00Z",
      },
    });
    expect(a).toMatchObject({
      state: "verified",
      method: "sigstore-key",
      keyFingerprint: "SHA256:abc",
      hasBundle: true,
    });
  });

  it("reads the 1.10 state record and infers keyless from an identity", () => {
    const a = readAttestation({
      attestation: BUNDLE,
      attestation_verification: {
        state: "verified",
        identity: "https://github.com/acme/ci/.github/workflows/release.yml@refs/heads/main",
        issuer: "https://token.actions.githubusercontent.com",
      },
    });
    expect(a.state).toBe("verified");
    expect(a.method).toBe("sigstore-keyless");
  });

  it("never reads a failed or unknown record as verified", () => {
    expect(
      readAttestation({ attestation: BUNDLE, attestation_verification: { state: "failed", error: "bad sig" } }),
    ).toMatchObject({ state: "failed", error: "bad sig" });
    expect(
      readAttestation({ attestation: BUNDLE, attestation_verification: { verified: "yes" } }).state,
    ).toBe("unverified");
  });

  it("distinguishes a stored but unverified bundle from no attestation", () => {
    expect(readAttestation({ attestation: BUNDLE }).state).toBe("unverified");
    expect(readAttestation({ license: "MIT" }).state).toBe("none");
    expect(readAttestation(undefined).state).toBe("none");
  });
});

describe("withoutAttestationBundle", () => {
  it("replaces only the bundle", () => {
    const m = withoutAttestationBundle({ attestation: BUNDLE, license: "MIT" });
    expect(m.license).toBe("MIT");
    expect(typeof m.attestation).toBe("string");
    const plain = { license: "MIT" };
    expect(withoutAttestationBundle(plain)).toBe(plain);
  });
});

describe("attestationMethodLabel", () => {
  it("labels the known methods and passes others through", () => {
    expect(attestationMethodLabel("sigstore-key")).toMatch(/configured key/);
    expect(attestationMethodLabel("x")).toBe("x");
  });
});
