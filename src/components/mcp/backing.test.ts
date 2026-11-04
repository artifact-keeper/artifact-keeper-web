import { describe, it, expect } from "vitest";
import { PINS, SERVER } from "./test-utils";
import { backingRepoFromBaseUrl, healthFor, packageCoordinate, packageLinks, repoHref, shortDigest, upstreamOf } from "./backing";

describe("backing", () => {
  it("joins packages with pins by index", () => {
    const links = packageLinks(SERVER, PINS, "own-repos");
    expect(links.map((l) => l.repository)).toEqual(["npm-local", "docker-local"]);
    expect(links[1].drift).toBe(true);
    expect(links[0].coordinate).toBe("npm:@acme/weather-mcp@1.4.2");
    expect(links[1].coordinate).toBe("oci:acme/weather:1.4.2");
  });

  it("falls back to served coordinates without pins", () => {
    const links = packageLinks(SERVER, undefined, undefined);
    expect(links[0].repository).toBe("npm-local");
    expect(links[1].repository).toBe("docker-local");
    expect(links[1].children).toHaveLength(1);
  });

  it("never reads a backing repository under the open policy", () => {
    const links = packageLinks(SERVER, PINS, "open");
    expect(links.every((l) => !l.mirrored && l.repository === null)).toBe(true);
  });

  it("parses registryBaseUrl", () => {
    expect(backingRepoFromBaseUrl("https://ak/pypi/py%20local/simple")).toBe("py local");
    expect(backingRepoFromBaseUrl("https://registry.npmjs.org")).toBeNull();
    expect(backingRepoFromBaseUrl("not a url")).toBeNull();
    expect(backingRepoFromBaseUrl(undefined)).toBeNull();
  });

  it("matches health rows", () => {
    const [npm, oci] = packageLinks(SERVER, PINS, "own-repos");
    const health = {
      state: "warning",
      packages: [
        { package: "npm:@acme/weather-mcp@1.4.2", high: 1 },
        { package: "other", artifact_id: "art-oci", critical: 1 },
      ],
    };
    expect(healthFor(npm, health)?.high).toBe(1);
    expect(healthFor(oci, health)?.critical).toBe(1);
    expect(healthFor(npm, null)).toBeUndefined();
  });

  it("formats helpers", () => {
    expect(repoHref("a b", "security")).toBe("/repositories/a%20b?tab=security");
    expect(repoHref("x")).toBe("/repositories/x");
    expect(shortDigest("sha256:0123456789abcdef")).toBe("sha256:0123456789ab");
    expect(shortDigest("abc")).toBe("abc");
    expect(shortDigest(undefined)).toBe("");
    expect(upstreamOf({ registryType: "npm", identifier: "x", transport: { type: "stdio" } })).toBe("the npm registry");
    expect(upstreamOf({ registryType: "npm", identifier: "x", registryBaseUrl: "https://registry.npmjs.org", transport: { type: "stdio" } })).toBe("registry.npmjs.org");
    expect(upstreamOf({ registryType: "npm", identifier: "x", registryBaseUrl: "bad", transport: { type: "stdio" } })).toBe("bad");
    expect(packageCoordinate({ registryType: "pypi", identifier: "x", transport: { type: "stdio" } })).toBe("pypi:x");
  });
});
