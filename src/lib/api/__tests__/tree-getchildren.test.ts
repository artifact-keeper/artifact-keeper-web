import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock sdk-client (side-effect import)
vi.mock("@/lib/sdk-client", () => ({}));

const mockGetTree = vi.fn();
vi.mock("@artifact-keeper/sdk", () => ({
  getTree: (...args: unknown[]) => mockGetTree(...args),
}));

import { treeApi } from "../tree";

describe("treeApi.getChildren", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls getTree with repository_key and path", async () => {
    const mockNodes = [
      { id: "1", name: "src", type: "folder", path: "src", has_children: true },
      { id: "2", name: "README.md", type: "artifact", path: "README.md", has_children: false },
    ];
    mockGetTree.mockResolvedValue({ data: { nodes: mockNodes }, error: undefined });

    const result = await treeApi.getChildren({
      repository_key: "my-repo",
      path: "/",
    });

    expect(mockGetTree).toHaveBeenCalledWith({
      query: {
        repository_key: "my-repo",
        path: "/",
        include_metadata: undefined,
      },
    });
    expect(result).toEqual(mockNodes);
  });

  it("calls getTree with include_metadata when specified", async () => {
    mockGetTree.mockResolvedValue({ data: { nodes: [] }, error: undefined });

    await treeApi.getChildren({
      repository_key: "my-repo",
      path: "src/lib",
      include_metadata: true,
    });

    expect(mockGetTree).toHaveBeenCalledWith({
      query: {
        repository_key: "my-repo",
        path: "src/lib",
        include_metadata: true,
      },
    });
  });

  it("calls getTree with empty params when no arguments given", async () => {
    mockGetTree.mockResolvedValue({ data: { nodes: [] }, error: undefined });

    const result = await treeApi.getChildren();

    expect(mockGetTree).toHaveBeenCalledWith({
      query: {
        repository_key: undefined,
        path: undefined,
        include_metadata: undefined,
      },
    });
    expect(result).toEqual([]);
  });

  it("throws when SDK returns an error", async () => {
    mockGetTree.mockResolvedValue({ data: undefined, error: "Forbidden" });

    await expect(treeApi.getChildren({ repository_key: "locked-repo" })).rejects.toBe(
      "Forbidden"
    );
  });

  it("returns nodes array from the response data", async () => {
    const nodes = [
      { id: "n1", name: "package.json", type: "artifact", path: "package.json", has_children: false },
    ];
    mockGetTree.mockResolvedValue({ data: { nodes }, error: undefined });

    const result = await treeApi.getChildren({ repository_key: "npm-local" });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("package.json");
  });
});

describe("treeApi.getChildren — per-folder dedup passthrough (artifact-keeper#2056)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates and attaches a top-level `dedup` object to folder metadata", async () => {
    const nodes = [
      {
        id: "f1",
        name: "images",
        type: "folder",
        path: "images",
        has_children: true,
        dedup: {
          logical_bytes: 1000,
          physical_bytes: 400,
          unique_bytes: 300,
          shared_bytes: 100,
          dedup_ratio: 2.5,
        },
      },
    ];
    mockGetTree.mockResolvedValue({ data: { nodes }, error: undefined });

    const result = await treeApi.getChildren({ repository_key: "oci-local" });

    expect(result[0].metadata?.folder?.dedup).toEqual({
      logical_bytes: 1000,
      physical_bytes: 400,
      unique_bytes: 300,
      shared_bytes: 100,
      dedup_ratio: 2.5,
    });
  });

  it("reads dedup from nested metadata.folder.dedup", async () => {
    const nodes = [
      {
        id: "f2",
        name: "layers",
        type: "folder",
        path: "layers",
        has_children: true,
        metadata: {
          folder: {
            file_count: 4,
            folder_count: 1,
            dedup: { logical_bytes: 50, physical_bytes: 25 },
          },
        },
      },
    ];
    mockGetTree.mockResolvedValue({ data: { nodes }, error: undefined });

    const result = await treeApi.getChildren({ repository_key: "oci-local" });

    expect(result[0].metadata?.folder?.dedup).toEqual({
      logical_bytes: 50,
      physical_bytes: 25,
    });
    // Existing folder metadata fields are preserved alongside the dedup merge.
    expect(result[0].metadata?.folder?.file_count).toBe(4);
  });

  it("leaves folder metadata untouched when no dedup is reported", async () => {
    const nodes = [
      {
        id: "f3",
        name: "src",
        type: "folder",
        path: "src",
        has_children: true,
      },
    ];
    mockGetTree.mockResolvedValue({ data: { nodes }, error: undefined });

    const result = await treeApi.getChildren({ repository_key: "npm-local" });

    expect(result[0].metadata).toBeUndefined();
  });

  it("collapses an all-null dedup object to undefined (absent, not zero)", async () => {
    const nodes = [
      {
        id: "f4",
        name: "empty",
        type: "folder",
        path: "empty",
        has_children: false,
        dedup: {
          logical_bytes: null,
          physical_bytes: null,
          unique_bytes: null,
          shared_bytes: null,
          dedup_ratio: null,
        },
      },
    ];
    mockGetTree.mockResolvedValue({ data: { nodes }, error: undefined });

    const result = await treeApi.getChildren({ repository_key: "npm-local" });

    expect(result[0].metadata?.folder?.dedup).toBeUndefined();
  });

  it("drops a malformed dedup payload rather than surfacing garbage", async () => {
    const nodes = [
      {
        id: "f5",
        name: "weird",
        type: "folder",
        path: "weird",
        has_children: false,
        dedup: { physical_bytes: "not-a-number" },
      },
    ];
    mockGetTree.mockResolvedValue({ data: { nodes }, error: undefined });

    const result = await treeApi.getChildren({ repository_key: "npm-local" });

    expect(result[0].metadata?.folder?.dedup).toBeUndefined();
  });
});
