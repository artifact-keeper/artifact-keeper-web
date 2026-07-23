// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

import type { Artifact } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockMutate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
  useMutation: () => ({ mutate: mockMutate, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/api/sbom", () => ({
  default: {
    list: vi.fn(),
    get: vi.fn(),
    getComponents: vi.fn(),
    getCveHistory: vi.fn(),
    generate: vi.fn(),
  },
}));

vi.mock("@/lib/error-utils", () => ({ mutationErrorToast: () => () => {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("lucide-react", () => {
  const icon = () => null;
  return {
    FileText: icon,
    Download: icon,
    RefreshCw: icon,
    Package: icon,
    Scale: icon,
    ChevronDown: icon,
    ChevronRight: icon,
    ShieldAlert: icon,
    ShieldCheck: icon,
    AlertTriangle: icon,
    Clock: icon,
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...rest }: React.ComponentProps<"button">) => (
    <button {...rest}>{children}</button>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => <span />,
}));

vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/common/data-table", () => ({
  DataTable: () => <div data-testid="data-table" />,
}));

vi.mock("@/components/common/copy-button", () => ({
  CopyButton: () => <button>copy</button>,
}));

vi.mock("@/components/common/vuln-id-link", () => ({
  VulnIdLink: ({ id }: { id: string }) => <span>{id}</span>,
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import { SbomTabContent } from "../sbom-tab-content";

function art(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "a1",
    repository_key: "pypi-remote",
    path: "requests/requests-2.31.0-py3-none-any.whl",
    name: "requests-2.31.0-py3-none-any.whl",
    size_bytes: 62500,
    checksum_sha256: "deadbeef",
    content_type: "application/octet-stream",
    download_count: 0,
    created_at: "2026-06-01T10:00:00Z",
    ...overrides,
  };
}

// No SBOMs / components / CVEs — drives the empty state where both Generate
// buttons render.
function stubEmptyQueries() {
  mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });
}

describe("SbomTabContent — analyzable gating (artifact-keeper#2292)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubEmptyQueries();
  });
  afterEach(() => cleanup());

  it("disables every Generate action and explains why for a non-analyzable artifact", () => {
    render(<SbomTabContent artifact={art({ analyzable: false })} />);
    const generateButtons = screen.getAllByRole("button", { name: /generate/i });
    expect(generateButtons.length).toBeGreaterThan(0);
    for (const btn of generateButtons) expect(btn).toBeDisabled();
    expect(screen.getByText(/proxy-cached remote artifacts/i)).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("keeps the Generate action enabled when analyzable is true", () => {
    render(<SbomTabContent artifact={art({ analyzable: true })} />);
    for (const btn of screen.getAllByRole("button", { name: /generate/i })) {
      expect(btn).not.toBeDisabled();
    }
  });

  it("keeps the Generate action enabled when analyzable is absent (safe default)", () => {
    render(<SbomTabContent artifact={art()} />);
    for (const btn of screen.getAllByRole("button", { name: /generate/i })) {
      expect(btn).not.toBeDisabled();
    }
  });
});
