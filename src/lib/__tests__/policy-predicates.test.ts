import { describe, it, expect } from "vitest";
import {
  adaptPredicates,
  countPredicates,
  emptyPredicates,
  formatList,
  isInert,
  parseList,
} from "../policy-predicates";

describe("adaptPredicates", () => {
  it("reads the backend document", () => {
    const p = adaptPredicates({
      conda: {
        allowed_channels: ["conda-forge"],
        denied_licenses: ["gpl-3.0-only", 7],
        block_install_scripts: true,
        min_attestation_state: "verified",
        max_install_script_severity: null,
      },
      origin: { allowed_kinds: ["hosted"] },
    })!;
    expect(p.conda.allowed_channels).toEqual(["conda-forge"]);
    expect(p.conda.denied_licenses).toEqual(["gpl-3.0-only"]);
    expect(p.conda.min_attestation_state).toBe("verified");
    expect(p.conda.max_install_script_severity).toBeNull();
    expect(p.origin.allowed_kinds).toEqual(["hosted"]);
    expect(p.origin.denied_upstreams).toEqual([]);
    expect(countPredicates(p)).toBe(5);
  });

  it("is undefined when the backend sends no predicates", () => {
    expect(adaptPredicates(undefined)).toBeUndefined();
    expect(adaptPredicates(null)).toBeUndefined();
  });
});

describe("isInert", () => {
  it("is true for an empty document and for none", () => {
    expect(isInert(emptyPredicates())).toBe(true);
    expect(isInert(undefined)).toBe(true);
    const p = emptyPredicates();
    p.conda.block_install_scripts = true;
    expect(isInert(p)).toBe(false);
  });
});

describe("parseList / formatList", () => {
  it("splits on commas and newlines and drops blanks", () => {
    expect(parseList(" conda-forge, bioconda\n\n internal ,")).toEqual([
      "conda-forge",
      "bioconda",
      "internal",
    ]);
    expect(formatList(["a", "b"])).toBe("a, b");
  });
});
