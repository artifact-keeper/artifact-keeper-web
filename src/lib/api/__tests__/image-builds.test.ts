import { describe, expect, it } from "vitest";

import {
  dockerfileLine,
  dockerfileLines,
  emptySpec,
  isActiveBuild,
  pairsToText,
  parsePairs,
  shortDigest,
  splitLines,
} from "@/lib/api/image-builds";

describe("image-builds helpers", () => {
  it("shortens digests", () => {
    expect(shortDigest(`sha256:${"ab".repeat(32)}`)).toBe("sha256:abababababab");
    expect(shortDigest(null)).toBe("");
  });

  it("normalizes history into Dockerfile instructions", () => {
    expect(dockerfileLine("/bin/sh -c #(nop)  ENV A=1")).toEqual({ instruction: "ENV", text: "ENV A=1" });
    expect(dockerfileLine("/bin/sh -c pip install ray")).toEqual({ instruction: "RUN", text: "RUN pip install ray" });
    expect(dockerfileLine("COPY a /b # buildkit")).toEqual({ instruction: "COPY", text: "COPY a /b" });
    expect(dockerfileLine("RUN /bin/sh -c echo hi # buildkit")).toEqual({ instruction: "RUN", text: "RUN echo hi" });
    const lines = dockerfileLines([
      { created_by: "FROM ubuntu", empty_layer: false, layer_digest: "sha256:1", size_bytes: 10 },
      { created_by: "/bin/sh -c #(nop) USER ray", empty_layer: true },
    ]);
    expect(lines[0]).toMatchObject({ instruction: "FROM", sizeBytes: 10, layerDigest: "sha256:1" });
    expect(lines[1]).toMatchObject({ instruction: "USER", sizeBytes: null, layerDigest: null });
  });

  it("parses textarea input into spec fields", () => {
    expect(splitLines("a\n\n# c\n b ")).toEqual(["a", "b"]);
    expect(parsePairs("A=1\nB=x=y\nbad\n=nokey")).toEqual({ A: "1", B: "x=y" });
    expect(pairsToText({ A: "1", B: "2" })).toBe("A=1\nB=2");
    expect(emptySpec("x:1").base_image).toBe("x:1");
    expect(isActiveBuild("running")).toBe(true);
    expect(isActiveBuild("succeeded")).toBe(false);
  });
});
