import { describe, it, expect } from "vitest";
import { draftFromPredicates, predicatesFromDraft, NOT_SET } from "./predicate-fields";
import { emptyPredicates } from "@/lib/policy-predicates";

describe("predicate draft", () => {
  it("round-trips a document and maps 'not set' to null", () => {
    const p = emptyPredicates();
    p.conda.allowed_channels = ["conda-forge", "internal"];
    p.conda.min_attestation_state = "present";
    p.origin.allowed_kinds = ["migration", "hosted"];
    const d = draftFromPredicates(p);
    expect(d.allowed_channels).toBe("conda-forge, internal");
    expect(d.max_install_script_severity).toBe(NOT_SET);
    const back = predicatesFromDraft(d);
    expect(back.conda.allowed_channels).toEqual(["conda-forge", "internal"]);
    expect(back.conda.max_install_script_severity).toBeNull();
    expect(back.conda.min_attestation_state).toBe("present");
    // Canonical order, unknown kinds dropped.
    expect(back.origin.allowed_kinds).toEqual(["hosted", "migration"]);
  });
});
