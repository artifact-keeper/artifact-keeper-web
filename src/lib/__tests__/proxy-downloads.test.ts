import { describe, it, expect } from "vitest";

import {
  downloadCountKind,
  proxyDownloadsTracked,
  PROXY_DOWNLOAD_CAPABILITY_KEY,
  PROXY_DOWNLOAD_TRACKED_FORMATS,
  PROXY_DOWNLOADS_UNTRACKED_REASON,
} from "@/lib/proxy-downloads";
import type { RepositoryFormat, RepositoryType } from "@/types";

function repo(
  format: RepositoryFormat,
  repo_type: RepositoryType = "remote",
  format_key: string | null = null,
) {
  return { format, repo_type, format_key };
}

/** A `GET /api/v1/formats` row carrying (or not carrying) the capability. */
function handler(format_key: string, records?: unknown) {
  return {
    format_key,
    capabilities:
      records === undefined
        ? null
        : { [PROXY_DOWNLOAD_CAPABILITY_KEY]: records },
  };
}

describe("proxyDownloadsTracked", () => {
  it.each<[RepositoryFormat, boolean]>([
    // instrumented in the backend today (artifact-keeper#3446)
    ["pypi", true],
    ["npm", true],
    ["maven", true],
    ["ansible", true],
    ["conda", true],
    ["cran", true],
    ["rpm", true],
    ["rubygems", true],
    // record nothing on the proxy path yet
    ["docker", false],
    ["cargo", false],
    ["nuget", false],
    ["debian", false],
    ["helm", false],
    ["go", false],
    ["composer", false],
    ["conan", false],
    ["generic", false],
  ])("remote %s repository -> tracked=%s", (format, expected) => {
    expect(proxyDownloadsTracked(repo(format))).toBe(expected);
  });

  it("treats non-remote repositories as tracked regardless of format", () => {
    // Hosted traffic is counted for every format; the gap is proxy-only.
    expect(proxyDownloadsTracked(repo("docker", "local"))).toBe(true);
    expect(proxyDownloadsTracked(repo("cargo", "virtual"))).toBe(true);
    expect(proxyDownloadsTracked(repo("nuget", "staging"))).toBe(true);
  });

  it("prefers an API-reported capability over the static list", () => {
    // Backend says cargo now counts proxied downloads: believe it, without a
    // web release adding cargo to the list.
    expect(
      proxyDownloadsTracked(repo("cargo"), [handler("cargo", true)]),
    ).toBe(true);
    // And the reverse: a format on the list that the backend says is not
    // instrumented after all.
    expect(proxyDownloadsTracked(repo("npm"), [handler("npm", false)])).toBe(
      false,
    );
  });

  it("resolves the capability by format_key for plugin-backed repos", () => {
    const pluginRepo = repo("generic", "remote", "acme-layout");
    expect(
      proxyDownloadsTracked(pluginRepo, [handler("acme-layout", true)]),
    ).toBe(true);
    expect(
      proxyDownloadsTracked(pluginRepo, [handler("acme-layout")]),
    ).toBe(false);
  });

  it("falls back to the static list when the capability is absent or not a boolean", () => {
    expect(proxyDownloadsTracked(repo("pypi"), null)).toBe(true);
    expect(proxyDownloadsTracked(repo("pypi"), [])).toBe(true);
    expect(proxyDownloadsTracked(repo("pypi"), [handler("pypi")])).toBe(true);
    // A non-boolean value is not an answer.
    expect(proxyDownloadsTracked(repo("cargo"), [handler("cargo", "yes")])).toBe(
      false,
    );
    // A handler for some other format says nothing about this one.
    expect(proxyDownloadsTracked(repo("cargo"), [handler("npm", true)])).toBe(
      false,
    );
  });
});

describe("downloadCountKind", () => {
  it("renders a measured zero as a number for instrumented formats", () => {
    expect(downloadCountKind(0, repo("pypi"))).toBe("count");
  });

  it("renders zero as not-tracked for formats that record nothing", () => {
    expect(downloadCountKind(0, repo("docker"))).toBe("untracked");
    expect(downloadCountKind(0, repo("cargo"))).toBe("untracked");
  });

  it("never hides a real count behind the not-tracked affordance", () => {
    // Proof the format is instrumented, whatever the static list believes —
    // so a backend that starts counting mid-release shows its traffic
    // immediately (artifact-keeper#3446 shrinks the list over time).
    expect(downloadCountKind(42, repo("docker"))).toBe("count");
  });

  it("treats a missing count as unmeasured rather than crashing", () => {
    expect(downloadCountKind(undefined, repo("docker"))).toBe("untracked");
    expect(downloadCountKind(null, repo("pypi"))).toBe("count");
  });

  it("leaves hosted repositories alone", () => {
    expect(downloadCountKind(0, repo("docker", "local"))).toBe("count");
  });
});

describe("copy", () => {
  it("says why there is no number without claiming there is no traffic", () => {
    expect(PROXY_DOWNLOADS_UNTRACKED_REASON).toMatch(/not a measured zero/i);
    expect(PROXY_DOWNLOADS_UNTRACKED_REASON).toMatch(/proxy cache/i);
  });

  it("keeps the tracked set to the formats the backend instruments", () => {
    expect([...PROXY_DOWNLOAD_TRACKED_FORMATS].sort()).toEqual([
      "ansible",
      "conda",
      "cran",
      "maven",
      "npm",
      "pypi",
      "rpm",
      "rubygems",
    ]);
  });
});
