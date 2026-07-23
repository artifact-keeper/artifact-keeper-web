import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockApiFetch = vi.fn();

vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const ENTRY = {
  revision: 2,
  version_label: "v2.0",
  size_bytes: 2048,
  checksum_sha256: "b".repeat(64),
  content_type: "application/x-yaml",
  created_at: "2026-07-10T12:00:00Z",
};

const LIST = {
  repository_key: "configs",
  path: "team/app/config.yaml",
  items: [ENTRY, { ...ENTRY, revision: 1, version_label: null, created_at: "2026-07-01T09:00:00Z" }],
};

describe("versionsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses a version-history response newest first", async () => {
    mockApiFetch.mockResolvedValue(LIST);
    const mod = await import("../versions");
    const res = await mod.versionsApi.list("configs", "team/app/config.yaml");
    expect(res.repository_key).toBe("configs");
    expect(res.path).toBe("team/app/config.yaml");
    expect(res.items).toHaveLength(2);
    expect(res.items[0].revision).toBe(2);
    expect(res.items[0].version_label).toBe("v2.0");
    expect(res.items[1].revision).toBe(1);
    expect(res.items[1].version_label).toBeNull();
  });

  it("encodes path segments but keeps slashes literal in the request URL", async () => {
    mockApiFetch.mockResolvedValue({ ...LIST, path: "dir with space/file#1.pdf" });
    const mod = await import("../versions");
    await mod.versionsApi.list("configs", "dir with space/file#1.pdf");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/configs/versions/dir%20with%20space/file%231.pdf"
    );
  });

  it("normalizes omitted version_label and uploaded_by to null", async () => {
    const { version_label: _drop, ...noLabel } = ENTRY;
    mockApiFetch.mockResolvedValue({ ...LIST, items: [noLabel] });
    const mod = await import("../versions");
    const res = await mod.versionsApi.list("configs", "team/app/config.yaml");
    expect(res.items[0].version_label).toBeNull();
    expect(res.items[0].uploaded_by).toBeNull();
  });

  it("plumbs uploaded_by through when the backend provides it", async () => {
    mockApiFetch.mockResolvedValue({
      ...LIST,
      items: [{ ...ENTRY, uploaded_by: "3d9c34a6-9a2e-4f2b-9f7d-1c2d3e4f5a6b" }],
    });
    const mod = await import("../versions");
    const res = await mod.versionsApi.list("configs", "team/app/config.yaml");
    expect(res.items[0].uploaded_by).toBe("3d9c34a6-9a2e-4f2b-9f7d-1c2d3e4f5a6b");
  });

  it("treats a 404 as an empty history rather than a failure", async () => {
    mockApiFetch.mockRejectedValue(
      new Error('API error 404: {"error":"No version history for this artifact"}')
    );
    const mod = await import("../versions");
    const res = await mod.versionsApi.list("configs", "never/reuploaded.bin");
    expect(res.items).toEqual([]);
    expect(res.repository_key).toBe("configs");
    expect(res.path).toBe("never/reuploaded.bin");
  });

  it("rethrows non-404 errors", async () => {
    mockApiFetch.mockRejectedValue(new Error("API error 500: boom"));
    const mod = await import("../versions");
    await expect(
      mod.versionsApi.list("configs", "team/app/config.yaml")
    ).rejects.toThrow(/API error 500/);
  });

  it("throws on a response that does not match the expected shape", async () => {
    mockApiFetch.mockResolvedValue({ versions: [ENTRY] });
    const mod = await import("../versions");
    await expect(
      mod.versionsApi.list("configs", "team/app/config.yaml")
    ).rejects.toThrow(/did not match the expected shape/);
  });

  it("throws when an item is missing a required field", async () => {
    const { checksum_sha256: _drop, ...badEntry } = ENTRY;
    mockApiFetch.mockResolvedValue({ ...LIST, items: [badEntry] });
    const mod = await import("../versions");
    await expect(
      mod.versionsApi.list("configs", "team/app/config.yaml")
    ).rejects.toThrow(/did not match the expected shape/);
  });
});

describe("getVersionDownloadPath", () => {
  it("appends a numeric revision selector, path left literal", async () => {
    const mod = await import("../versions");
    expect(
      mod.getVersionDownloadPath("configs", "team/app/config.yaml", 3)
    ).toBe("/api/v1/repositories/configs/download/team/app/config.yaml?version=3");
  });

  it("URL-encodes a human label selector", async () => {
    const mod = await import("../versions");
    expect(
      mod.getVersionDownloadPath("configs", "model.bin", "v1.0 rc/2")
    ).toBe("/api/v1/repositories/configs/download/model.bin?version=v1.0%20rc%2F2");
  });
});

describe("supportsVersioning", () => {
  it("is true only for generic and mlmodel formats", async () => {
    const mod = await import("../versions");
    expect(mod.supportsVersioning("generic")).toBe(true);
    expect(mod.supportsVersioning("mlmodel")).toBe(true);
    expect(mod.supportsVersioning("maven")).toBe(false);
    expect(mod.supportsVersioning("docker")).toBe(false);
    expect(mod.supportsVersioning("npm")).toBe(false);
  });
});

describe("encodeArtifactPath", () => {
  it("escapes reserved characters per segment while preserving separators", async () => {
    const mod = await import("../versions");
    expect(mod.encodeArtifactPath("a b/c?d/e")).toBe("a%20b/c%3Fd/e");
  });
});
