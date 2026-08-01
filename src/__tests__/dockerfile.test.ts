import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guards the runtime contract for AK_ENFORCE_HTTPS (#679): the shipped image
 * must carry the flag as a plain container ENV so that
 * `docker run -e AK_ENFORCE_HTTPS=true` overrides the image default and the
 * middleware picks it up per request — no rebuild required.
 */
const dockerfile = readFileSync(join(__dirname, "../../Dockerfile"), "utf-8");

describe("Dockerfile AK_ENFORCE_HTTPS wiring", () => {
  it("exposes AK_ENFORCE_HTTPS as a container ENV (runtime-overridable)", () => {
    expect(dockerfile).toMatch(/^ARG AK_ENFORCE_HTTPS$/m);
    expect(dockerfile).toContain("ENV AK_ENFORCE_HTTPS=${AK_ENFORCE_HTTPS}");
  });

  it("documents the flag as runtime-evaluated, not build-time-only", () => {
    const lines = dockerfile.split("\n");
    const argIdx = lines.findIndex((l) => l === "ARG AK_ENFORCE_HTTPS");
    expect(argIdx).toBeGreaterThan(0);
    const comments: string[] = [];
    for (let i = argIdx - 1; i >= 0 && lines[i].startsWith("#"); i--) {
      comments.unshift(lines[i]);
    }
    const commentBlock = comments.join("\n");
    expect(commentBlock).not.toMatch(/must be set\s+at BUILD time/i);
    expect(commentBlock).toMatch(/runtime/i);
  });
});
