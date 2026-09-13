import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();
vi.mock("../fetch", async () => {
  const actual = await vi.importActual<typeof import("../fetch")>("../fetch");
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { proxySbomApi } from "../proxy-sbom";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("proxySbomApi.get", () => {
  it("defaults to CycloneDX and looks the document up by cache path", async () => {
    mockApiFetch.mockResolvedValue({ bomFormat: "CycloneDX", components: [] });

    await proxySbomApi.get("npm-remote", "left-pad/-/left-pad-1.3.0.tgz");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/npm-remote/security/proxy-sbom" +
        "?path=left-pad%2F-%2Fleft-pad-1.3.0.tgz&format=cyclonedx",
    );
  });

  it("requests SPDX when asked", async () => {
    mockApiFetch.mockResolvedValue({});

    await proxySbomApi.get("npm-remote", "a.tgz", "spdx");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/npm-remote/security/proxy-sbom?path=a.tgz&format=spdx",
    );
  });

  it("percent-encodes the repository key", async () => {
    mockApiFetch.mockResolvedValue({});

    await proxySbomApi.get("team/npm remote", "a.tgz");

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining("/repositories/team%2Fnpm%20remote/security/proxy-sbom"),
    );
  });

  it("propagates the error instead of reporting an absent inventory", async () => {
    // Swallowing this would let the caller render "no SBOM recorded" for a
    // viewer who is merely signed out.
    mockApiFetch.mockRejectedValue(new Error("API error 401: unauthorized"));

    await expect(proxySbomApi.get("npm-remote", "a.tgz")).rejects.toThrow(/401/);
  });

  it("returns the body unparsed for the shared normalizer", async () => {
    const doc = { bomFormat: "CycloneDX", components: [{ name: "x" }] };
    mockApiFetch.mockResolvedValue(doc);

    await expect(proxySbomApi.get("npm-remote", "a.tgz")).resolves.toBe(doc);
  });
});
