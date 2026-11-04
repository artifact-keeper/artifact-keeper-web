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
vi.mock("@/components/package/file-tree", () => ({
  FileTree: () => <div />,
  PackageFileTree: () => <div />,
}));

const mockGet = vi.fn();
const mockGetVersions = vi.fn();
vi.mock("@/lib/api/packages", () => ({
  packagesApi: {
    get: (...a: unknown[]) => mockGet(...a),
    getVersions: (...a: unknown[]) => mockGetVersions(...a),
  },
}));

vi.mock("./_components/mcp-server-detail", () => ({
  McpServerDetail: ({ pkg }: { pkg: { name: string } }) => <div data-testid="mcp-detail">{pkg.name}</div>,
}));

const queryKeys: unknown[][] = [];
let detailData: unknown = undefined;
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[]; queryFn: () => unknown; enabled?: boolean }) => {
    queryKeys.push(opts.queryKey);
    if (opts.enabled !== false) opts.queryFn();
    if (detailData && opts.queryKey[0] === "package-detail") {
      return { data: detailData, isLoading: false, error: undefined };
    }
    return { data: undefined, isLoading: !detailData, error: undefined };
  },
}));

import PackageDetailPage from "./page";

describe("PackageDetailPage virtual-repo context", () => {
  beforeEach(() => {
    cleanup();
    queryKeys.length = 0;
    detailData = undefined;
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

describe("PackageDetailPage MCP branch", () => {
  beforeEach(() => {
    cleanup();
    searchParams = new URLSearchParams();
  });

  it("renders the MCP server detail for an mcp package", () => {
    detailData = {
      id: "pkg-1",
      repository_key: "mcp-local",
      name: "com.acme/weather",
      version: "1.0.0",
      format: "mcp",
      size_bytes: 0,
      download_count: 0,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    };
    const { getByTestId, queryByText } = render(<PackageDetailPage />);
    expect(getByTestId("mcp-detail")).toHaveTextContent("com.acme/weather");
    expect(queryByText("Files")).toBeNull();
  });
});
