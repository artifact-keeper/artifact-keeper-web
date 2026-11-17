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

// Backend 1.12.0 reports `download_count: null` for a Remote or Virtual Maven
// package it cannot tie to its downloads (artifact-keeper#5419); 1.11.2 threw
// on it and the page showed "Something went wrong" (artifact-keeper#5663).
const NULL_COUNT_PACKAGE = {
  ...PACKAGE,
  id: "pkg-null",
  repository_key: "maven-remote",
  name: "junit:junit",
  version: "4.13.2",
  format: "maven",
  download_count: null,
};
const NULL_COUNT_VERSIONS = [
  {
    version: "4.13.2",
    size_bytes: 2048,
    download_count: null,
    created_at: "2026-01-01T00:00:00Z",
    checksum_sha256: "a".repeat(64),
  },
];
let listed: Record<string, unknown> = PACKAGE;
let detail: unknown = undefined;
let versions: unknown = undefined;

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

vi.mock("@/components/package/file-tree", () => ({
  FileTree: () => <div />,
  PackageFileTree: () => <div />,
}));
vi.mock("@/components/package/file-viewer", () => ({ FileViewer: () => <div /> }));

const queryKeys: unknown[][] = [];
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[]; queryFn: () => unknown; enabled?: boolean }) => {
    queryKeys.push(opts.queryKey);
    if (opts.enabled !== false) opts.queryFn();
    if (opts.queryKey[0] === "repo-packages") {
      return { data: { items: [listed], pagination: { total: 1 } }, isLoading: false };
    }
    if (opts.queryKey[0] === "package-detail") return { data: detail, isLoading: false };
    if (opts.queryKey[0] === "package-versions") return { data: versions, isLoading: false };
    return { data: undefined, isLoading: false };
  },
}));

import { PackagesTabContent } from "./packages-tab-content";

describe("PackagesTabContent virtual-repo context", () => {
  beforeEach(() => {
    cleanup();
    listed = PACKAGE;
    detail = undefined;
    versions = undefined;
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

describe("PackagesTabContent with a null download count (artifact-keeper#5663)", () => {
  beforeEach(() => {
    cleanup();
    listed = NULL_COUNT_PACKAGE;
    detail = NULL_COUNT_PACKAGE;
    versions = NULL_COUNT_VERSIONS;
  });

  it("renders the package and its versions instead of throwing", () => {
    render(
      <PackagesTabContent repositoryKey="maven-remote" repositoryFormat="maven" />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "junit:junit" })[0]);
    expect(screen.getAllByText("junit:junit").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4\.13\.2/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/null/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 downloads/)).not.toBeInTheDocument();
  });
});
