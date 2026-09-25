import { describe, it, expect } from "vitest";
import {
  filterSelectableKeys,
  keyTypeMatchesFormat,
  recommendedKeyType,
  requiredKeyType,
  supportsRepositorySigning,
} from "@/lib/signing-formats";

describe("signing-formats", () => {
  it("supports debian local repositories", () => {
    expect(supportsRepositorySigning("debian", "local")).toBe(true);
  });

  it("does not support npm repositories", () => {
    expect(supportsRepositorySigning("npm", "local")).toBe(false);
  });

  it("does not support debian remote repositories", () => {
    expect(supportsRepositorySigning("debian", "remote")).toBe(false);
  });

  it("requires gpg for debian and rpm (OpenPGP metadata signatures)", () => {
    expect(requiredKeyType("debian")).toBe("gpg");
    expect(requiredKeyType("rpm")).toBe("gpg");
  });

  it("requires rsa for alpine and conda", () => {
    expect(requiredKeyType("alpine")).toBe("rsa");
    expect(requiredKeyType("conda")).toBe("rsa");
    expect(requiredKeyType("conda_native")).toBe("rsa");
  });

  it("recommendedKeyType mirrors requiredKeyType", () => {
    expect(recommendedKeyType("rpm")).toBe("gpg");
    expect(recommendedKeyType("alpine")).toBe("rsa");
  });

  it("keyTypeMatchesFormat validates key type against format", () => {
    expect(keyTypeMatchesFormat("gpg", "rpm")).toBe(true);
    expect(keyTypeMatchesFormat("rsa", "rpm")).toBe(false);
    expect(keyTypeMatchesFormat("RSA", "alpine")).toBe(true);
    expect(keyTypeMatchesFormat("gpg", "alpine")).toBe(false);
  });

  it("filterSelectableKeys keeps global and matching repo keys", () => {
    const keys = [
      { id: "g1", repository_id: null, is_active: true },
      { id: "r1", repository_id: "repo-a", is_active: true },
      { id: "r2", repository_id: "repo-b", is_active: true },
      { id: "x1", repository_id: null, is_active: false },
    ];
    expect(filterSelectableKeys(keys, "repo-a").map((k) => k.id)).toEqual(["g1", "r1"]);
  });
});
