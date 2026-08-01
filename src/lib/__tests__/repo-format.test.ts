import { describe, it, expect } from "vitest";

import { isPluginBackedRepo, repoFormatLabel } from "@/lib/repo-format";

const HANDLERS = [
  { format_key: "unity", display_name: "Unity" },
  { format_key: "pypi", display_name: "PyPI" },
];

describe("isPluginBackedRepo", () => {
  it("is true for a generic repo with a format_key", () => {
    expect(isPluginBackedRepo({ format: "generic", format_key: "unity" })).toBe(true);
  });

  it("is false for a plain generic repo", () => {
    expect(isPluginBackedRepo({ format: "generic", format_key: null })).toBe(false);
    expect(isPluginBackedRepo({ format: "generic" })).toBe(false);
  });

  it("is false for built-in formats even if a format_key leaks through", () => {
    expect(isPluginBackedRepo({ format: "npm", format_key: "unity" })).toBe(false);
  });
});

describe("repoFormatLabel", () => {
  it("resolves the plugin display name for a plugin-backed repo (#592)", () => {
    expect(
      repoFormatLabel({ format: "generic", format_key: "unity" }, HANDLERS)
    ).toBe("Unity");
  });

  it("falls back to the raw format_key for an unknown plugin id", () => {
    expect(
      repoFormatLabel({ format: "generic", format_key: "acme-layout" }, HANDLERS)
    ).toBe("acme-layout");
    expect(
      repoFormatLabel({ format: "generic", format_key: "acme-layout" }, undefined)
    ).toBe("acme-layout");
  });

  it("returns the format id for a plain generic repo", () => {
    expect(repoFormatLabel({ format: "generic", format_key: null }, HANDLERS)).toBe(
      "generic"
    );
  });

  it("returns the format id for built-in formats", () => {
    expect(repoFormatLabel({ format: "npm", format_key: null }, HANDLERS)).toBe("npm");
  });
});
