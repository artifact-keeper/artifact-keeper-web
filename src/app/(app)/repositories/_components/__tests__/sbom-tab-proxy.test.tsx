// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

import type { Artifact } from "@/types";

// ---------------------------------------------------------------------------
// Which SBOM the artifact SBOM tab serves.
//
// Proxy-cached artifacts have no `artifacts` row, so the hosted SBOM queries
// are structurally empty for them and generation 404s. The tab used to render
// a permanently disabled Generate button over "SBOM is unavailable"; it now
// serves the inventory the download-time scan recorded instead.
// ---------------------------------------------------------------------------

const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/api/sbom", () => ({
  sbomApi: {
    list: vi.fn(),
    get: vi.fn(),
    getComponents: vi.fn(),
    getCveHistory: vi.fn(),
    generate: vi.fn(),
  },
}));

vi.mock("@/lib/error-utils", () => ({ mutationErrorToast: () => () => {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const panelProps = vi.hoisted(() => vi.fn());
vi.mock("../proxy-sbom-panel", () => ({
  ProxySbomPanel: (props: Record<string, unknown>) => {
    panelProps(props);
    return <div data-testid="stub-proxy-sbom-panel" />;
  },
}));

import { SbomTabContent } from "../sbom-tab-content";

function art(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "a1",
    repository_key: "pypi-remote",
    path: "jinja2/Jinja2-2.11.2-py2.py3-none-any.whl",
    name: "Jinja2-2.11.2-py2.py3-none-any.whl",
    size_bytes: 1024,
    checksum_sha256: "deadbeef",
    content_type: "application/octet-stream",
    download_count: 0,
    created_at: "2026-06-01T10:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // No hosted SBOMs and no CVE history — the state a proxy artifact is always
  // in, and the state a hosted artifact starts in.
  mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });
});
afterEach(() => cleanup());

describe("SbomTabContent — proxy-cached artifacts", () => {
  it("serves the proxy SBOM panel, keyed by cache path", () => {
    render(
      <SbomTabContent
        artifact={art({ analyzable: false })}
        repositoryFormat="pypi"
      />,
    );

    expect(screen.getByTestId("stub-proxy-sbom-panel")).toBeInTheDocument();
    expect(panelProps).toHaveBeenCalledWith({
      repositoryKey: "pypi-remote",
      path: "jinja2/Jinja2-2.11.2-py2.py3-none-any.whl",
      artifactName: "Jinja2-2.11.2-py2.py3-none-any.whl",
      repositoryFormat: "pypi",
    });
  });

  it("stops claiming SBOMs are unavailable for proxy-cached artifacts", () => {
    render(
      <SbomTabContent
        artifact={art({ analyzable: false })}
        repositoryFormat="pypi"
      />,
    );

    expect(screen.queryByText(/available only for artifacts hosted/i)).toBeNull();
    // And no permanently disabled Generate button.
    expect(screen.queryByRole("button", { name: /generate/i })).toBeNull();
  });
});

describe("SbomTabContent — hosted artifacts", () => {
  it("keeps the hosted SBOM flow untouched", () => {
    render(<SbomTabContent artifact={art({ analyzable: true })} />);

    expect(screen.queryByTestId("stub-proxy-sbom-panel")).toBeNull();
    expect(panelProps).not.toHaveBeenCalled();
    expect(
      screen.getByText(/No SBOM generated for this artifact yet/i),
    ).toBeInTheDocument();
    // Two: the header action and the empty-state call to action.
    expect(screen.getAllByRole("button", { name: /generate/i })).not.toHaveLength(
      0,
    );
  });

  it("treats a missing analyzable flag as hosted (safe default for older responses)", () => {
    render(<SbomTabContent artifact={art()} />);

    expect(screen.queryByTestId("stub-proxy-sbom-panel")).toBeNull();
  });
});
