import { describe, it, expect } from "vitest";
import { adaptGateResults } from "../promotion";

describe("adaptGateResults", () => {
  it("keeps well-formed entries and drops the rest", () => {
    expect(
      adaptGateResults([
        { rule: "license", passed: true, reason: "MIT allowed" },
        { rule: "scan", passed: "no" },
        null,
        { rule: "attestation", passed: false },
      ]),
    ).toEqual([
      { rule: "license", passed: true, reason: "MIT allowed" },
      { rule: "attestation", passed: false, reason: undefined },
    ]);
  });

  it("is undefined when the backend does not send the field", () => {
    expect(adaptGateResults(undefined)).toBeUndefined();
  });
});
