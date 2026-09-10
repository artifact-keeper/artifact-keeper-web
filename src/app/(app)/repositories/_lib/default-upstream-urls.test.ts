import { describe, it, expect } from "vitest";
import { DEFAULT_UPSTREAM_URLS } from "./default-upstream-urls";

describe("DEFAULT_UPSTREAM_URLS", () => {
  it("all format keys are lowercase", () => {
    for (const key of Object.keys(DEFAULT_UPSTREAM_URLS)) {
      expect(key).toBe(key.toLowerCase());
    }
  });

  it("all URLs start with https://", () => {
    for (const [key, url] of Object.entries(DEFAULT_UPSTREAM_URLS)) {
      expect(url, `URL for "${key}" should start with https://`).toMatch(
        /^https:\/\//
      );
    }
  });

  it("has entries for known formats: maven, npm, pypi, docker", () => {
    expect(DEFAULT_UPSTREAM_URLS.maven).toBeDefined();
    expect(DEFAULT_UPSTREAM_URLS.npm).toBeDefined();
    expect(DEFAULT_UPSTREAM_URLS.pypi).toBeDefined();
    expect(DEFAULT_UPSTREAM_URLS.docker).toBeDefined();
  });

  it("vscode upstream is the Open VSX gallery adapter root, not the site root or API path", () => {
    // The backend's vscode gateway rejects any Remote upstream_url that
    // doesn't end in /vscode/gallery (backend/src/api/handlers/vscode.rs —
    // the gallery gate's upstream_url check and openvsx_asset_url both
    // require this suffix). The Open VSX site root and its native /api path
    // are both wrong values here.
    expect(DEFAULT_UPSTREAM_URLS.vscode).toBe("https://open-vsx.org/vscode/gallery");
    expect(DEFAULT_UPSTREAM_URLS.vscode).toMatch(/\/vscode\/gallery$/);
  });

  it("each URL is a non-empty string", () => {
    for (const [key, url] of Object.entries(DEFAULT_UPSTREAM_URLS)) {
      expect(typeof url, `value for "${key}" should be a string`).toBe(
        "string"
      );
      expect(url.length, `URL for "${key}" should not be empty`).toBeGreaterThan(
        0
      );
    }
  });
});
