// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

// The catalog listing reports the virtual key for packages served by a virtual
// repository, so every link out of it has to carry that key to the detail view
// (backend 1.10.0, artifact-keeper#3532).

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

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/use-document-title", () => ({ useDocumentTitle: () => {} }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/use-repositories", () => ({
  useRepositories: () => ({ data: { items: [] } }),
}));

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

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[]; queryFn: () => unknown; enabled?: boolean }) => {
    if (opts.enabled !== false) opts.queryFn();
    if (opts.queryKey[0] === "packages") {
      return {
        data: { items: [listed], pagination: { total: 1, total_pages: 1 } },
        isLoading: false,
      };
    }
    if (opts.queryKey[0] === "package-detail") return { data: detail, isLoading: false };
    if (opts.queryKey[0] === "package-versions") return { data: versions, isLoading: false };
    return { data: undefined, isLoading: false };
  },
}));

import PackagesPage from "./page";

describe("PackagesPage virtual-repo context", () => {
  beforeEach(() => {
    cleanup();
    listed = PACKAGE;
    detail = undefined;
    versions = undefined;
    vi.clearAllMocks();
  });

  it("links to the detail page with the row's repository key", () => {
    render(<PackagesPage />);

    const links = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((href): href is string => !!href?.startsWith("/packages/pkg-1"));

    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      expect(href).toBe("/packages/pkg-1?repository_key=npm-virtual");
    }
  });

  it("passes the selected row's repository key to the detail lookup", () => {
    render(<PackagesPage />);

    expect(mockGet).toHaveBeenCalledWith("pkg-1", {
      repository_key: "npm-virtual",
    });
  });
});

describe("PackagesPage with a null download count (artifact-keeper#5663)", () => {
  beforeEach(() => {
    cleanup();
    listed = NULL_COUNT_PACKAGE;
    detail = NULL_COUNT_PACKAGE;
    versions = NULL_COUNT_VERSIONS;
  });

  it("renders the package and its versions instead of throwing", () => {
    render(<PackagesPage />);
    expect(screen.getAllByText("junit:junit").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4\.13\.2/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/null/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 downloads/)).not.toBeInTheDocument();
  });
});
