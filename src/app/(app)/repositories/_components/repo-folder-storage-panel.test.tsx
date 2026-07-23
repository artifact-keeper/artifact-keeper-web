// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

import type { TreeNode } from "@/types/tree";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// useQuery response for the folder tree lookup
// (queryKey[0] === "repository-folder-storage").
let treeResponse: { data: TreeNode[] | undefined } = { data: undefined };

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[]; queryFn?: () => unknown }) => {
    // Execute the queryFn so its arrow is covered; treeApi is mocked below.
    try {
      opts.queryFn?.();
    } catch {
      /* ignore */
    }
    return treeResponse;
  },
}));

const mockGetChildren = vi.fn();
vi.mock("@/lib/api/tree", () => ({
  treeApi: {
    getChildren: (...a: unknown[]) => mockGetChildren(...a),
  },
}));

import { RepoFolderStoragePanel } from "./repo-folder-storage-panel";

const REPO = { key: "oci-local" };

function folderWithDedup(
  name: string,
  dedup: NonNullable<
    NonNullable<TreeNode["metadata"]>["folder"]
  >["dedup"],
): TreeNode {
  return {
    id: `id-${name}`,
    name,
    type: "folder",
    path: name,
    has_children: true,
    metadata: { folder: { file_count: 1, folder_count: 0, dedup } },
  };
}

const plainFolder: TreeNode = {
  id: "plain",
  name: "src",
  type: "folder",
  path: "src",
  has_children: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  treeResponse = { data: undefined };
});
afterEach(() => cleanup());

describe("RepoFolderStoragePanel", () => {
  it("renders a per-folder dedup breakdown when folders report it", () => {
    treeResponse = {
      data: [
        folderWithDedup("images", {
          logical_bytes: 1000,
          physical_bytes: 400,
          unique_bytes: 300,
          shared_bytes: 100,
          dedup_ratio: 2.5,
        }),
        plainFolder,
      ],
    };

    render(<RepoFolderStoragePanel repository={REPO} isAdmin={false} />);

    expect(screen.getByTestId("folder-storage-panel")).toBeInTheDocument();
    // Only the folder carrying dedup data produces a row.
    expect(screen.getAllByTestId("folder-storage-row")).toHaveLength(1);
    expect(screen.getByText("images")).toBeInTheDocument();
    expect(screen.getByText("2.50× deduplication")).toBeInTheDocument();
    // Unique/shared split bar is rendered.
    expect(screen.getByTestId("folder-bar-unique")).toBeInTheDocument();
    expect(screen.getByTestId("folder-bar-shared")).toBeInTheDocument();
  });

  it("renders nothing when no folder reports dedup (current backends)", () => {
    treeResponse = { data: [plainFolder] };
    const { container } = render(
      <RepoFolderStoragePanel repository={REPO} isAdmin={false} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("folder-storage-panel")).not.toBeInTheDocument();
  });

  it("renders nothing while the tree is still loading (no data yet)", () => {
    treeResponse = { data: undefined };
    const { container } = render(
      <RepoFolderStoragePanel repository={REPO} isAdmin={true} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the cross-repository sharing caveat only to admins", () => {
    treeResponse = {
      data: [
        folderWithDedup("images", {
          logical_bytes: 1000,
          physical_bytes: 400,
          unique_bytes: 300,
          shared_bytes: 100,
          dedup_ratio: 2.5,
        }),
      ],
    };

    const { rerender } = render(
      <RepoFolderStoragePanel repository={REPO} isAdmin={false} />,
    );
    expect(screen.queryByText(/Shared.*bytes are blobs/i)).not.toBeInTheDocument();

    rerender(<RepoFolderStoragePanel repository={REPO} isAdmin={true} />);
    expect(screen.getByText(/bytes are blobs a folder has in common/i)).toBeInTheDocument();
  });

  it("omits absent figures without rendering zeros", () => {
    treeResponse = {
      data: [
        folderWithDedup("partial", {
          logical_bytes: 500,
          physical_bytes: 250,
          // unique/shared/ratio omitted by the backend
        }),
      ],
    };

    render(<RepoFolderStoragePanel repository={REPO} isAdmin={false} />);

    expect(screen.getByText("Logical")).toBeInTheDocument();
    expect(screen.getByText("Physical")).toBeInTheDocument();
    // No unique/shared figures, so no split bar and no ratio line.
    expect(screen.queryByTestId("folder-bar-unique")).not.toBeInTheDocument();
    expect(screen.queryByText(/deduplication$/)).not.toBeInTheDocument();
  });
});
