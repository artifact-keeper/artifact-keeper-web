// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// The Packages tab drills down in place, so the repository being browsed is
// the virtual-repo context for the detail lookup: a package listed under a
// virtual repository must keep reporting the virtual key, not the owning
// member's (backend 1.10.0, artifact-keeper#3532).

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const PACKAGE = {
  id: "pkg-1",
  repository_key: "npm-virtual",
  name: "lodash",
  version: "4.17.21",
  format: "npm",
  size_bytes: 1024,
  download_count: 7,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

const mockGet = vi.fn();
const mockList = vi.fn();
const mockGetVersions = vi.fn();
vi.mock("@/lib/api/packages", () => ({
  packagesApi: {
    list: (...a: unknown[]) => mockList(...a),
    get: (...a: unknown[]) => mockGet(...a),
    getVersions: (...a: unknown[]) => mockGetVersions(...a),
  },
}));

vi.mock("@/components/package/file-tree", () => ({ FileTree: () => <div /> }));
vi.mock("@/components/package/file-viewer", () => ({ FileViewer: () => <div /> }));

const queryKeys: unknown[][] = [];
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[]; queryFn: () => unknown; enabled?: boolean }) => {
    queryKeys.push(opts.queryKey);
    if (opts.enabled !== false) opts.queryFn();
    if (opts.queryKey[0] === "repo-packages") {
      return { data: { items: [PACKAGE], pagination: { total: 1 } }, isLoading: false };
    }
    return { data: undefined, isLoading: false };
  },
}));

import { PackagesTabContent } from "./packages-tab-content";

describe("PackagesTabContent virtual-repo context", () => {
  beforeEach(() => {
    cleanup();
    queryKeys.length = 0;
    vi.clearAllMocks();
  });

  it("passes the browsed repository key to the package detail lookup", () => {
    render(
      <PackagesTabContent repositoryKey="npm-virtual" repositoryFormat="npm" />,
    );

    // No package selected yet: only the listing has been fetched.
    expect(mockGet).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "lodash" })[0]);

    expect(mockGet).toHaveBeenCalledWith("pkg-1", {
      repository_key: "npm-virtual",
    });
    expect(queryKeys).toContainEqual([
      "package-detail",
      "pkg-1",
      "npm-virtual",
    ]);
  });
});
