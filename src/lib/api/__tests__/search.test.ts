import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock sdk-client (side-effect import)
vi.mock("@/lib/sdk-client", () => ({}));

const mockQuickSearch = vi.fn();
const mockAdvancedSearch = vi.fn();
const mockChecksumSearch = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  quickSearch: (...args: unknown[]) => mockQuickSearch(...args),
  advancedSearch: (...args: unknown[]) => mockAdvancedSearch(...args),
  checksumSearch: (...args: unknown[]) => mockChecksumSearch(...args),
}));

import { searchApi } from "../search";

describe("searchApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- quickSearch ----

  describe("quickSearch", () => {
    it("calls SDK with query and limit", async () => {
      const results = [
        { id: "1", name: "react", type: "artifact" },
      ];
      mockQuickSearch.mockResolvedValue({ data: { results }, error: undefined });

      const result = await searchApi.quickSearch({ query: "react", limit: 10 });

      expect(mockQuickSearch).toHaveBeenCalledWith({
        query: {
          q: "react",
          limit: 10,
          types: undefined,
        },
      });
      expect(result).toEqual(results);
    });

    it("passes types as comma-separated string", async () => {
      mockQuickSearch.mockResolvedValue({ data: { results: [] }, error: undefined });

      await searchApi.quickSearch({
        query: "test",
        types: ["artifact", "package"],
      });

      expect(mockQuickSearch).toHaveBeenCalledWith({
        query: expect.objectContaining({
          types: "artifact,package",
        }),
      });
    });

    it("throws on SDK error", async () => {
      mockQuickSearch.mockResolvedValue({ data: undefined, error: "search failed" });

      await expect(searchApi.quickSearch({ query: "fail" })).rejects.toBe("search failed");
    });
  });

  // ---- advancedSearch ----

  describe("advancedSearch", () => {
    it("calls SDK with search params", async () => {
      const sdkItem = {
        id: "1",
        name: "lodash",
        type: "package",
        repository_key: "npm-public",
        created_at: "2025-01-01",
      };
      const response = {
        items: [sdkItem],
        pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
      };
      mockAdvancedSearch.mockResolvedValue({ data: response, error: undefined });

      const result = await searchApi.advancedSearch({
        query: "lodash",
        page: 1,
        per_page: 20,
        format: "npm",
      });

      expect(mockAdvancedSearch).toHaveBeenCalledWith({
        query: {
          query: "lodash",
          page: 1,
          per_page: 20,
          format: "npm",
        },
      });
      expect(result).toEqual({
        items: [
          {
            id: "1",
            type: "package",
            name: "lodash",
            path: undefined,
            repository_key: "npm-public",
            format: undefined,
            version: undefined,
            size_bytes: undefined,
            created_at: "2025-01-01",
            highlights: undefined,
          },
        ],
        pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
      });
    });

    it("throws on SDK error", async () => {
      mockAdvancedSearch.mockResolvedValue({ data: undefined, error: "bad request" });

      await expect(
        searchApi.advancedSearch({ query: "fail" })
      ).rejects.toBe("bad request");
    });
  });

  // ---- checksumSearch ----

  describe("checksumSearch", () => {
    it("calls SDK with checksum and algorithm", async () => {
      // ChecksumArtifact (subset of full Artifact).
      const sdkArtifact = {
        id: "a1",
        name: "react.tgz",
        path: "react/react.tgz",
        repository_key: "npm",
        size_bytes: 100,
      };
      mockChecksumSearch.mockResolvedValue({
        data: { artifacts: [sdkArtifact] },
        error: undefined,
      });

      const result = await searchApi.checksumSearch({
        checksum: "abc123",
        algorithm: "sha1",
      });

      expect(mockChecksumSearch).toHaveBeenCalledWith({
        query: {
          checksum: "abc123",
          algorithm: "sha1",
        },
      });
      expect(result).toEqual([
        {
          id: "a1",
          repository_key: "npm",
          path: "react/react.tgz",
          name: "react.tgz",
          version: undefined,
          size_bytes: 100,
          checksum_sha256: "",
          content_type: "",
          download_count: 0,
          created_at: "",
        },
      ]);
    });

    it("defaults algorithm to sha256 when not provided", async () => {
      mockChecksumSearch.mockResolvedValue({ data: { artifacts: [] }, error: undefined });

      await searchApi.checksumSearch({ checksum: "deadbeef" });

      expect(mockChecksumSearch).toHaveBeenCalledWith({
        query: {
          checksum: "deadbeef",
          algorithm: "sha256",
        },
      });
    });

    it("throws on SDK error", async () => {
      mockChecksumSearch.mockResolvedValue({ data: undefined, error: "not found" });

      await expect(
        searchApi.checksumSearch({ checksum: "invalid" })
      ).rejects.toBe("not found");
    });
  });
});
