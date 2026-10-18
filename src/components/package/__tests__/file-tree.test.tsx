// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockGetChildren = vi.fn();
vi.mock("@/lib/api/tree", () => ({
  treeApi: { getChildren: (...a: unknown[]) => mockGetChildren(...a) },
}));

import { PackageFileTree } from "../file-tree";

function renderTree(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("PackageFileTree (#987)", () => {
  beforeEach(() => mockGetChildren.mockReset());
  afterEach(() => cleanup());

  it("lists a Maven package under its group path and expands folders with repository-relative paths", async () => {
    mockGetChildren.mockImplementation((params?: { path?: string }) => {
      const path = params?.path;
      if (path === "com/example/demo") {
        return Promise.resolve([
          {
            id: "f1",
            name: "1.0.0-SNAPSHOT",
            path: "maven-releases/com/example/demo/1.0.0-SNAPSHOT",
            type: "folder",
            has_children: true,
          },
        ]);
      }
      if (path === "com/example/demo/1.0.0-SNAPSHOT") {
        return Promise.resolve([
          {
            id: "a1",
            name: "demo-1.0.0-SNAPSHOT.jar",
            path: "maven-releases/com/example/demo/1.0.0-SNAPSHOT/demo-1.0.0-SNAPSHOT.jar",
            type: "file",
            has_children: false,
          },
        ]);
      }
      return Promise.resolve([]);
    });

    renderTree(
      <PackageFileTree
        repositoryKey="maven-releases"
        format="maven"
        packageName="com.example:demo"
      />,
    );

    fireEvent.click(await screen.findByText("1.0.0-SNAPSHOT"));
    expect(await screen.findByText("demo-1.0.0-SNAPSHOT.jar")).toBeInTheDocument();

    const paths = mockGetChildren.mock.calls.map((c) => c[0]?.path);
    expect(paths).toEqual(["com/example/demo", "com/example/demo/1.0.0-SNAPSHOT"]);
    expect(mockGetChildren.mock.calls[0][0].repository_key).toBe("maven-releases");
  });

  it("sends no leading slash for a name that is already the prefix", async () => {
    mockGetChildren.mockResolvedValue([]);
    renderTree(
      <PackageFileTree repositoryKey="npm-local" format="npm" packageName="@babel/core" />,
    );
    await waitFor(() => expect(mockGetChildren).toHaveBeenCalled());
    expect(mockGetChildren.mock.calls[0][0].path).toBe("@babel/core");
    expect(await screen.findByText("No files found")).toBeInTheDocument();
  });

  it("explains a flat-layout format instead of querying the tree", () => {
    renderTree(
      <PackageFileTree repositoryKey="conda-local" format="conda" packageName="numpy" />,
    );
    expect(screen.getByTestId("package-files-flat-layout")).toBeInTheDocument();
    expect(mockGetChildren).not.toHaveBeenCalled();
  });
});
