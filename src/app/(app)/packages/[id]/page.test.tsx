// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, cleanup } from "@testing-library/react";

// A package reached from a virtual repository carries `?repository_key=` so
// the detail lookup reports the virtual key rather than the owning member's
// (backend 1.10.0, artifact-keeper#3532).

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "pkg-1" }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/hooks/use-document-title", () => ({ useDocumentTitle: () => {} }));
vi.mock("@/components/package/file-tree", () => ({ FileTree: () => <div /> }));

const mockGet = vi.fn();
const mockGetVersions = vi.fn();
vi.mock("@/lib/api/packages", () => ({
  packagesApi: {
    get: (...a: unknown[]) => mockGet(...a),
    getVersions: (...a: unknown[]) => mockGetVersions(...a),
  },
}));

const queryKeys: unknown[][] = [];
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[]; queryFn: () => unknown; enabled?: boolean }) => {
    queryKeys.push(opts.queryKey);
    if (opts.enabled !== false) opts.queryFn();
    return { data: undefined, isLoading: true, error: undefined };
  },
}));

import PackageDetailPage from "./page";

describe("PackageDetailPage virtual-repo context", () => {
  beforeEach(() => {
    cleanup();
    queryKeys.length = 0;
    vi.clearAllMocks();
  });

  it("passes the repository_key search param to the detail lookup", () => {
    searchParams = new URLSearchParams("repository_key=npm-virtual");
    render(<PackageDetailPage />);

    expect(mockGet).toHaveBeenCalledWith("pkg-1", {
      repository_key: "npm-virtual",
    });
    expect(queryKeys).toContainEqual(["package-detail", "pkg-1", "npm-virtual"]);
  });

  it("omits the key when the link carried none", () => {
    searchParams = new URLSearchParams();
    render(<PackageDetailPage />);

    expect(mockGet).toHaveBeenCalledWith("pkg-1", { repository_key: undefined });
  });
});
