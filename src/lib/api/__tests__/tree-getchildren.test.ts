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
