import { describe, it, expect } from "vitest";
import { adaptAttestationPolicy } from "../attestation-policy";

describe("adaptAttestationPolicy", () => {
  it("reads only an explicit false as not required and drops malformed keys", () => {
    const p = adaptAttestationPolicy({ keys: [{ fingerprint: "SHA256:x" }, { name: "no id" }] });
    expect(p.require_verified).toBe(true);
    expect(p.keys).toEqual([{ id: "SHA256:x", name: undefined, fingerprint: "SHA256:x", algorithm: undefined }]);
    expect(adaptAttestationPolicy({ require_verified: false }).require_verified).toBe(false);
  });
});
