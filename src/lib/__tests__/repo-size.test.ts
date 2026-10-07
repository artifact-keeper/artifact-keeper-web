import { describe, it, expect } from "vitest";
import { repoSizeLabel, repoHeaderSize } from "../repo-size";

describe("repoSizeLabel", () => {
  it("shows a virtual repository's member bytes, labelled as such", () => {
    const v = { repo_type: "virtual" as const, storage_used_bytes: 0, member_storage_used_bytes: 2048 };
    expect(repoSizeLabel(v)).toEqual({ text: "2 KB in members", members: true });
    expect(repoHeaderSize(v)).toBe("2 KB in members");
  });

  it("keeps a repository's own bytes otherwise, including older backends", () => {
    expect(repoSizeLabel({ repo_type: "local", storage_used_bytes: 1024, member_storage_used_bytes: null }).text).toBe("1 KB");
    expect(repoHeaderSize({ repo_type: "virtual", storage_used_bytes: 1024 })).toBe("1 KB used");
  });
});
