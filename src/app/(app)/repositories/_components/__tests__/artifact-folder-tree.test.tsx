// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ArtifactFolderTree } from "../artifact-folder-tree";
import { treeApi, type TreeNode } from "@/lib/api/tree";

vi.mock("@/lib/api/tree", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/tree")>(
    "@/lib/api/tree",
  );

  return {
    ...actual,
    treeApi: {
      ...actual.treeApi,
      getChildren: vi.fn(),
    },
  };
});

const getChildrenMock = vi.mocked(treeApi.getChildren);

function makeFolder(
  path: string,
  overrides: Partial<TreeNode> = {},
): TreeNode {
  const name = path.split("/").filter(Boolean).pop() ?? path;

  return {
    id: `folder-${path}`,
    name,
    type: "folder",
    path,
    has_children: true,
    children_count: 1,
    ...overrides,
  };
}

function makeFile(
  path: string,
  overrides: Partial<TreeNode> = {},
): TreeNode {
  const name = path.split("/").filter(Boolean).pop() ?? path;

  return {
    id: `file-${path}`,
    name,
    type: "artifact",
    path,
    has_children: false,
    children_count: 0,
    ...overrides,
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderTree(
  props: Partial<React.ComponentProps<typeof ArtifactFolderTree>> = {},
) {
  const queryClient = makeQueryClient();

  const result = render(
    <QueryClientProvider client={queryClient}>
      <ArtifactFolderTree
        repositoryKey="raw-repo"
        onFileSelect={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  );

  return { ...result, queryClient };
}

describe("ArtifactFolderTree", () => {
  beforeEach(() => {
    getChildrenMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a loading skeleton while the root is loading", () => {
    getChildrenMock.mockImplementation(
      () => new Promise<TreeNode[]>(() => {}),
    );

    renderTree();

    expect(screen.getByTestId("artifact-tree-loading")).toBeInTheDocument();
    expect(
      screen.queryByTestId("artifact-folder-tree"),
    ).not.toBeInTheDocument();
  });

  it("renders the empty state with a custom message", async () => {
    getChildrenMock.mockResolvedValue([]);

    renderTree({ emptyMessage: "Nothing here yet." });

    expect(
      await screen.findByTestId("artifact-tree-empty"),
    ).toBeInTheDocument();
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("loads only the repository root initially", async () => {
    getChildrenMock.mockResolvedValue([
      makeFolder("raw-repo/builds", { children_count: 1000 }),
      makeFile("raw-repo/top.txt"),
    ]);

    renderTree();

    expect(await screen.findByText("builds")).toBeInTheDocument();
    expect(screen.getByText("top.txt")).toBeInTheDocument();
    expect(screen.getByText("1000 files")).toBeInTheDocument();

    expect(getChildrenMock).toHaveBeenCalledTimes(1);
    expect(getChildrenMock).toHaveBeenCalledWith({
      repository_key: "raw-repo",
    });
  });

  it("does not fetch a folder until it is expanded", async () => {
    const user = userEvent.setup();

    getChildrenMock.mockImplementation(async (params) => {
      if (!params?.path) {
        return [makeFolder("raw-repo/builds")];
      }

      if (params?.path === "builds") {
        return [makeFile("raw-repo/builds/app.tar.gz")];
      }

      return [];
    });

    renderTree();

    const folder = await screen.findByRole("treeitem", {
      name: /folder builds/i,
    });

    expect(folder).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("app.tar.gz")).not.toBeInTheDocument();
    expect(getChildrenMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId("artifact-tree-folder"));

    expect(await screen.findByText("app.tar.gz")).toBeInTheDocument();
    expect(getChildrenMock).toHaveBeenCalledTimes(2);
    expect(getChildrenMock).toHaveBeenLastCalledWith({
      repository_key: "raw-repo",
      path: "builds",
    });
  });

  it("lazy-loads nested folders using repository-relative paths", async () => {
    const user = userEvent.setup();

    getChildrenMock.mockImplementation(async (params) => {
      switch (params?.path) {
        case undefined:
          return [makeFolder("raw-repo/builds")];
        case "builds":
          return [makeFolder("raw-repo/builds/2026")];
        case "builds/2026":
          return [makeFile("raw-repo/builds/2026/app.tar.gz")];
        default:
          return [];
      }
    });

    renderTree();

    await user.click(await screen.findByTestId("artifact-tree-folder"));

    const nested = await screen.findByRole("treeitem", {
      name: /folder builds\/2026/i,
    });

    expect(screen.queryByText("app.tar.gz")).not.toBeInTheDocument();

    await user.click(
      nested.querySelector<HTMLButtonElement>(
        '[data-testid="artifact-tree-folder"]',
      )!,
    );

    expect(await screen.findByText("app.tar.gz")).toBeInTheDocument();
    expect(getChildrenMock).toHaveBeenCalledWith({
      repository_key: "raw-repo",
      path: "builds/2026",
    });
  });

  it("does not refetch a fresh folder when collapsed and re-expanded", async () => {
    const user = userEvent.setup();

    getChildrenMock.mockImplementation(async (params) => {
      if (!params?.path) {
        return [makeFolder("raw-repo/builds")];
      }

      return [makeFile("raw-repo/builds/app.tar.gz")];
    });

    renderTree();

    const folderButton = await screen.findByTestId("artifact-tree-folder");

    await user.click(folderButton);
    expect(await screen.findByText("app.tar.gz")).toBeInTheDocument();

    await user.click(folderButton);
    expect(screen.queryByText("app.tar.gz")).not.toBeInTheDocument();

    await user.click(folderButton);
    expect(await screen.findByText("app.tar.gz")).toBeInTheDocument();

    await waitFor(() => {
      expect(getChildrenMock).toHaveBeenCalledTimes(2);
    });
  });

  it("invokes onFileSelect with repository-relative path and filename", async () => {
    const user = userEvent.setup();
    const onFileSelect = vi.fn();

    getChildrenMock.mockResolvedValue([
      makeFile("raw-repo/top.txt", { id: "target" }),
    ]);

    renderTree({ onFileSelect });

    await user.click(await screen.findByTestId("artifact-tree-file"));

    expect(onFileSelect).toHaveBeenCalledTimes(1);
    expect(onFileSelect).toHaveBeenCalledWith("top.txt", "top.txt");
  });

  it("highlights the selected repository-relative file", async () => {
    getChildrenMock.mockResolvedValue([makeFile("raw-repo/LICENSE")]);

    renderTree({ selectedPath: "LICENSE" });

    const file = await screen.findByTestId("artifact-tree-file");
    expect(file).toHaveAttribute("aria-selected", "true");
  });

  it("works with arbitrary folder names and does not hardcode rke2", async () => {
    const user = userEvent.setup();

    getChildrenMock.mockImplementation(async (params) => {
      if (!params?.path) {
        return [makeFolder("raw-repo/audio-data")];
      }

      if (params?.path === "audio-data") {
        return [makeFile("raw-repo/audio-data/sample.wav")];
      }

      return [];
    });

    renderTree();

    await user.click(await screen.findByTestId("artifact-tree-folder"));

    expect(await screen.findByText("sample.wav")).toBeInTheDocument();
    expect(getChildrenMock).toHaveBeenCalledWith({
      repository_key: "raw-repo",
      path: "audio-data",
    });
  });

  it("sorts folders before files using case-insensitive natural ordering", async () => {
    getChildrenMock.mockResolvedValue([
      makeFile("raw-repo/file10.bin"),
      makeFolder("raw-repo/zeta"),
      makeFile("raw-repo/file2.bin"),
      makeFolder("raw-repo/Alpha"),
      makeFile("raw-repo/Beta.bin"),
      makeFile("raw-repo/alpha.bin"),
    ]);

    renderTree();

    await screen.findByText("file10.bin");

    const items = screen.getAllByRole("treeitem");

    expect(items.map((item) => item.getAttribute("aria-label"))).toEqual([
      "Folder Alpha",
      "Folder zeta",
      "File alpha.bin",
      "File Beta.bin",
      "File file2.bin",
      "File file10.bin",
    ]);
  });

  it("shows a root error and retries loading the tree", async () => {
    const user = userEvent.setup();

    getChildrenMock
      .mockRejectedValueOnce(new Error("root failed"))
      .mockResolvedValueOnce([makeFile("raw-repo/recovered.txt")]);

    renderTree();

    expect(
      await screen.findByText("Could not load repository tree."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText("recovered.txt")).toBeInTheDocument();
    expect(getChildrenMock).toHaveBeenCalledTimes(2);
  });

  it("shows a folder error and retries loading that folder", async () => {
    const user = userEvent.setup();
    let buildsAttempts = 0;

    getChildrenMock.mockImplementation(async (params) => {
      if (!params?.path) {
        return [makeFolder("raw-repo/builds")];
      }

      if (params.path === "builds") {
        buildsAttempts += 1;

        if (buildsAttempts === 1) {
          throw new Error("folder failed");
        }

        return [makeFile("raw-repo/builds/app.tar.gz")];
      }

      return [];
    });

    renderTree();

    await user.click(await screen.findByTestId("artifact-tree-folder"));

    expect(
      await screen.findByText("Failed to load folder."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText("app.tar.gz")).toBeInTheDocument();
    expect(buildsAttempts).toBe(2);
  });
});
