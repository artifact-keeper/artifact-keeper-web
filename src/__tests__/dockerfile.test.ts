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

/**
 * Guards the OpenShift restricted-v2 contract: the container is run with a
 * random non-root UID that belongs to GID 0. Any directory the process writes
 * to must therefore be group-writable, and the image must not assume it owns a
 * specific UID. See the OpenShift compatibility work.
 */
describe("Dockerfile OpenShift arbitrary-UID compatibility", () => {
  it("runs as a numeric non-root user", () => {
    // A named USER resolves to an unknown UID; restricted-v2 needs a numeric
    // non-root user so the platform can confirm it is not UID 0.
    expect(dockerfile).toMatch(/^USER\s+1001$/m);
    expect(dockerfile).not.toMatch(/^USER\s+(root|0)\s*$/m);
  });

  it("makes the Next.js runtime cache group-writable for an arbitrary UID", () => {
    // .next/cache is the only path the standalone server writes to at runtime.
    // Owning it 1001:0 is not enough — the default 0755 denies group write, so
    // a random UID in GID 0 cannot write it. It must be chmod g=rwX.
    expect(dockerfile).toMatch(/chmod\s+g=rwX\s+\.next\/cache/);
  });

  it("builds on a Red Hat UBI base for certification", () => {
    expect(dockerfile).toMatch(/registry\.access\.redhat\.com\/ubi9\//);
  });
});
