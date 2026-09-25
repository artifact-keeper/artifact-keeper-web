// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

let blockData: { data: unknown; isLoading?: boolean; isError?: boolean; error?: unknown } = {
  data: { items: [], total: 0 },
  isLoading: false,
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryFn: () => unknown; enabled?: boolean }) => {
    if (opts.enabled !== false) {
      try {
        opts.queryFn();
      } catch {
        /* ignore */
      }
    }
    return { refetch: vi.fn(), isFetching: false, ...blockData };
  },
}));

const api = { listPolicyBlocks: vi.fn() };
vi.mock("@/lib/api/holds", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/holds")>("@/lib/api/holds");
  return {
    ...actual,
    holdsApi: {
      listPolicyBlocks: (...a: unknown[]) => api.listPolicyBlocks(...a),
    },
  };
});

let isAdmin = true;
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ user: isAdmin ? { is_admin: true } : { is_admin: false } }),
}));

vi.mock("@/components/common/holds-nav", () => ({
  HoldsNav: () => <nav aria-label="Download holds">Holds nav</nav>,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import PolicyBlocksPage from "./page";

const HOSTED = {
  id: "art-1",
  source: "hosted" as const,
  artifactId: "art-1",
  packageName: "log4j-core",
  packageVersion: "2.14.1",
  path: "org/apache/logging/log4j/log4j-core/2.14.1/log4j-core-2.14.1.jar",
  repositoryKey: "maven-releases",
  repositoryFormat: "maven",
  uploadedAt: "2026-01-02T00:00:00Z",
  criticalCount: 2,
  highCount: 3,
  mediumCount: 1,
  lowCount: 0,
  findingsCount: 6,
  maxSeverity: "high",
  policyName: "block-high",
  blockReason: "Policy 'block-high': 5 findings at or above high",
};

beforeEach(() => {
  vi.clearAllMocks();
  isAdmin = true;
  blockData = { data: { items: [], total: 0 }, isLoading: false };
});
afterEach(() => cleanup());

describe("PolicyBlocksPage", () => {
  it("gates non-admins", () => {
    isAdmin = false;
    render(<PolicyBlocksPage />);
    expect(screen.getByText(/requires administrator access/i)).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    render(<PolicyBlocksPage />);
    expect(api.listPolicyBlocks).toHaveBeenCalledWith({ perPage: 100 });
    expect(screen.getByText(/No packages are currently blocked/i)).toBeInTheDocument();
  });

  it("lists name, upload date, severity counts, and blast-radius link", () => {
    blockData = { data: { items: [HOSTED], total: 1 }, isLoading: false };
    render(<PolicyBlocksPage />);
    expect(screen.getByText("log4j-core")).toBeInTheDocument();
    expect(screen.getByText("2.14.1")).toBeInTheDocument();
    expect(screen.getByText("maven-releases")).toBeInTheDocument();
    expect(screen.getByText("2C")).toBeInTheDocument();
    expect(screen.getByText("3H")).toBeInTheDocument();
    expect(screen.getByText("1M")).toBeInTheDocument();
    expect(screen.getByText("block-high")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Blast radius/i })).toHaveAttribute(
      "href",
      "/security/blast-radius?artifact=art-1",
    );
  });

  it("shows an error state", () => {
    blockData = { data: undefined, isLoading: false, isError: true, error: new Error("x") };
    render(<PolicyBlocksPage />);
    expect(screen.getByText(/Couldn't load policy-blocked packages/i)).toBeInTheDocument();
  });
});
