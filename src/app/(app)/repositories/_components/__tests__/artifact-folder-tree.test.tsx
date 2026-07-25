// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ArtifactFolderTree } from "../artifact-folder-tree";
import type { Artifact } from "@/types";

function makeArtifact(path: string, overrides: Partial<Artifact> = {}): Artifact {
  const name = path.split("/").filter(Boolean).pop() ?? path;
  return {
    id: `id-${path}`,
    repository_key: "raw-repo",
    path,
    name,
    size_bytes: 1024,
    checksum_sha256: "abc",
    content_type: "application/octet-stream",
    download_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const NOOP = () => {};

describe("ArtifactFolderTree", () => {
  afterEach(cleanup);

  it("renders a loading skeleton when loading", () => {
    render(
      <ArtifactFolderTree artifacts={[]} onFileSelect={NOOP} loading />,
    );
    expect(screen.getByTestId("artifact-tree-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("artifact-folder-tree")).not.toBeInTheDocument();
  });

  it("renders the empty state with a custom message when there are no artifacts", () => {
    render(
      <ArtifactFolderTree
        artifacts={[]}
        onFileSelect={NOOP}
        emptyMessage="Nothing here yet."
      />,
    );
    expect(screen.getByTestId("artifact-tree-empty")).toBeInTheDocument();
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("renders top-level files and folders", () => {
    render(
      <ArtifactFolderTree
        artifacts={[
          makeArtifact("top.txt"),
          makeArtifact("builds/app.tar.gz"),
        ]}
        onFileSelect={NOOP}
      />,
    );
    expect(screen.getByRole("tree", { name: /repository folder tree/i })).toBeInTheDocument();
    expect(screen.getByText("builds")).toBeInTheDocument();
    expect(screen.getByText("top.txt")).toBeInTheDocument();
  });

  it("expands top-level folders by default so their children are visible", () => {
    render(
      <ArtifactFolderTree
        artifacts={[makeArtifact("builds/app.tar.gz")]}
        onFileSelect={NOOP}
      />,
    );
    // Top-level folder auto-expands; child file is visible without a click.
    expect(screen.getByText("app.tar.gz")).toBeInTheDocument();
    const folder = screen.getByRole("treeitem", { name: /folder builds/i });
    expect(folder).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses and re-expands a folder on click", async () => {
    const user = userEvent.setup();
    render(
      <ArtifactFolderTree
        artifacts={[makeArtifact("builds/app.tar.gz")]}
        onFileSelect={NOOP}
      />,
    );
    const folderButton = screen.getByTestId("artifact-tree-folder");

    // Starts expanded -> child visible
    expect(screen.getByText("app.tar.gz")).toBeInTheDocument();

    // Collapse -> child hidden
    await user.click(folderButton);
    expect(screen.queryByText("app.tar.gz")).not.toBeInTheDocument();

    // Re-expand -> child visible again
    await user.click(folderButton);
    expect(screen.getByText("app.tar.gz")).toBeInTheDocument();
  });

  it("keeps a nested folder collapsed until expanded", async () => {
    const user = userEvent.setup();
    render(
      <ArtifactFolderTree
        artifacts={[makeArtifact("builds/2026/app.tar.gz")]}
        onFileSelect={NOOP}
      />,
    );
    // 'builds' auto-expands and reveals the nested '2026' folder, but the deep
    // file is hidden until '2026' is expanded.
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.queryByText("app.tar.gz")).not.toBeInTheDocument();

    const nested = screen.getByRole("treeitem", { name: /folder builds\/2026/i });
    await user.click(within(nested).getByTestId("artifact-tree-folder"));
    expect(screen.getByText("app.tar.gz")).toBeInTheDocument();
  });

  it("invokes onFileSelect with the artifact when a file is clicked", async () => {
    const user = userEvent.setup();
    const onFileSelect = vi.fn();
    const artifact = makeArtifact("builds/app.tar.gz", { id: "target" });
    render(
      <ArtifactFolderTree artifacts={[artifact]} onFileSelect={onFileSelect} />,
    );
    await user.click(screen.getByTestId("artifact-tree-file"));
    expect(onFileSelect).toHaveBeenCalledTimes(1);
    expect(onFileSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "target" }),
    );
  });

  it("renders a download count and a generic-file glyph, and highlights the selected file", () => {
    const artifact = makeArtifact("dir/LICENSE", {
      download_count: 1234,
    });
    render(
      <ArtifactFolderTree
        artifacts={[artifact]}
        onFileSelect={NOOP}
        selectedPath="dir/LICENSE"
      />,
    );
    // download_count > 0 renders the compact-formatted count (formatNumber)
    expect(screen.getByText("1.2K")).toBeInTheDocument();
    // selected file carries aria-selected=true
    const file = screen.getByTestId("artifact-tree-file");
    expect(file).toHaveAttribute("aria-selected", "true");
  });

  it("shows a recursive file total in the header", () => {
    render(
      <ArtifactFolderTree
        artifacts={[
          makeArtifact("a.txt"),
          makeArtifact("dir/b.txt"),
          makeArtifact("dir/sub/c.txt"),
        ]}
        onFileSelect={NOOP}
      />,
    );
    expect(screen.getByText("3 files")).toBeInTheDocument();
  });
});
