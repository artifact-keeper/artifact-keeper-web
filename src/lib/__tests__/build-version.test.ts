import { describe, it, expect } from "vitest";
import { isReleaseRef, shortSha, webBuildLabel } from "@/lib/build-version";

describe("webBuildLabel", () => {
  const sha = "9801123abcdef0123456789";

  it("shows the version for a build made from a release tag", () => {
    expect(webBuildLabel("1.9.0", sha, "v1.9.0")).toEqual({ label: "1.9.0", title: "release v1.9.0", release: true });
    expect(webBuildLabel("1.9.0", sha, "1.9.0").release).toBe(true);
  });

  it("shows the short hash for a main, branch or dev build", () => {
    for (const ref of ["main", "feat/thing", "dev", "1.10.0-dev"]) {
      const l = webBuildLabel("1.9.0", sha, ref);
      expect(l.label).toBe("9801123");
      expect(l.release).toBe(false);
      expect(l.title).toContain(ref);
      expect(l.title).toContain("package version 1.9.0");
    }
  });

  it("falls back to version plus ref when the hash is unknown", () => {
    expect(webBuildLabel("1.9.0", "unknown", "main").label).toBe("1.9.0 (main)");
    expect(webBuildLabel(undefined, undefined, "main").label).toBe("dev (main)");
  });

  it("keeps the old rule without a build ref", () => {
    expect(webBuildLabel("1.1.0", sha, undefined)).toMatchObject({ label: "1.1.0", release: true });
    expect(webBuildLabel("1.1.0", sha, "")).toMatchObject({ label: "1.1.0", release: true });
    expect(webBuildLabel("1.1.0-rc.8", sha, undefined)).toMatchObject({ label: "1.1.0-rc.8 (9801123)", release: false });
    expect(webBuildLabel("1.1.0-rc.8", "unknown", undefined).label).toBe("1.1.0-rc.8");
  });

  it("helpers", () => {
    expect(isReleaseRef("v2.0.1")).toBe(true);
    expect(isReleaseRef("v2.0.1-rc.1")).toBe(false);
    expect(isReleaseRef("main")).toBe(false);
    expect(isReleaseRef(undefined)).toBe(false);
    expect(shortSha(sha)).toBe("9801123");
    expect(shortSha("unknown")).toBeNull();
    expect(shortSha(undefined)).toBeNull();
  });
});
