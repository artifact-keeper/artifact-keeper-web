// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApiError } from "@/lib/api/fetch";

const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

const mockGet = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/proxy-sbom", () => ({
  proxySbomApi: { get: mockGet },
}));

import { ProxySbomPanel } from "../proxy-sbom-panel";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

const CYCLONEDX = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  components: [
    {
      name: "jinja2",
      version: "2.11.2",
      purl: "pkg:pypi/jinja2@2.11.2",
      licenses: [{ license: { id: "BSD-3-Clause" } }],
    },
    { name: "markupsafe", version: "1.1.1" },
  ],
};

function stubQuery(result: {
  data?: unknown;
  isLoading?: boolean;
  error?: unknown;
}) {
  mockUseQuery.mockReturnValue({
    data: result.data,
    isLoading: result.isLoading ?? false,
    error: result.error ?? null,
  });
}

function renderPanel(format = "pypi") {
  return render(
    <ProxySbomPanel
      repositoryKey="pypi-remote"
      path="jinja2/Jinja2-2.11.2-py2.py3-none-any.whl"
      artifactName="Jinja2-2.11.2-py2.py3-none-any.whl"
      repositoryFormat={format}
    />,
  );
}

/** No state may present itself as "this artifact has no dependencies". */
function expectNoEmptyComponentTable() {
  expect(screen.queryByText("No components cataloged")).toBeNull();
  expect(screen.queryByRole("columnheader", { name: /component/i })).toBeNull();
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// The rule this panel exists to uphold.
// ---------------------------------------------------------------------------

describe("ProxySbomPanel — an empty inventory is not an empty SBOM", () => {
  it("renders the explicit not-recorded state for a document with no components", () => {
    stubQuery({ data: { bomFormat: "CycloneDX", components: [] } });

    renderPanel();

    expect(screen.getByTestId("proxy-sbom-empty")).toHaveTextContent(
      /No SBOM recorded for this artifact yet/i,
    );
    expect(screen.getByText(/next time it is pulled/i)).toBeInTheDocument();
    expectNoEmptyComponentTable();
  });

  it("renders the not-recorded state when the endpoint has nothing for this path", () => {
    stubQuery({ error: new ApiError(404, "not found") });

    renderPanel();

    expect(screen.getByTestId("proxy-sbom-empty")).toHaveTextContent(
      /No SBOM recorded/i,
    );
    expectNoEmptyComponentTable();
  });

  it("renders the not-recorded state rather than throwing on an unparseable body", () => {
    stubQuery({ data: "<html>gateway error</html>" });

    renderPanel();

    expect(screen.getByTestId("proxy-sbom-empty")).toBeInTheDocument();
    expectNoEmptyComponentTable();
  });
});

describe("ProxySbomPanel — access", () => {
  it("tells an anonymous viewer to sign in rather than showing an empty SBOM", () => {
    stubQuery({ error: new ApiError(401, "unauthorized") });

    renderPanel();

    expect(screen.getByText("Sign in to view scan status.")).toBeInTheDocument();
    expect(screen.queryByTestId("proxy-sbom-empty")).toBeNull();
    expectNoEmptyComponentTable();
  });

  it("does not tell an already signed-in user to sign in", () => {
    stubQuery({ error: new ApiError(403, "forbidden") });

    renderPanel();

    expect(screen.getByText(/do not have access/i)).toBeInTheDocument();
    expect(screen.queryByTestId("proxy-sbom-empty")).toBeNull();
  });

  it("reports a transport failure as a failure, not as an absent SBOM", () => {
    stubQuery({ error: new ApiError(500, "boom") });

    renderPanel();

    expect(screen.getByTestId("proxy-scan-access-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("proxy-sbom-empty")).toBeNull();
  });

  it("shows a skeleton while the document is in flight", () => {
    stubQuery({ isLoading: true });

    renderPanel();

    expect(screen.queryByTestId("proxy-sbom-empty")).toBeNull();
    expectNoEmptyComponentTable();
  });
});

describe("ProxySbomPanel — unsupported formats", () => {
  it("says so plainly instead of querying an endpoint with nothing to return", () => {
    stubQuery({ data: undefined });

    renderPanel("maven");

    expect(screen.getByTestId("proxy-sbom-empty")).toHaveTextContent(
      /only recorded for PyPI, npm and Docker\/OCI/i,
    );
    const opts = mockUseQuery.mock.calls[0][0] as { enabled: boolean };
    expect(opts.enabled).toBe(false);
  });

  it("enables the query for a format that does run an inline scan", () => {
    stubQuery({ data: CYCLONEDX });

    renderPanel("npm");

    const opts = mockUseQuery.mock.calls[0][0] as { enabled: boolean };
    expect(opts.enabled).toBe(true);
  });
});

describe("ProxySbomPanel — inventory", () => {
  it("renders the component inventory with version, license and purl", () => {
    stubQuery({ data: CYCLONEDX });

    renderPanel();

    expect(screen.getByText("jinja2")).toBeInTheDocument();
    expect(screen.getByText("2.11.2")).toBeInTheDocument();
    expect(screen.getByText("pkg:pypi/jinja2@2.11.2")).toBeInTheDocument();
    expect(screen.getByText("markupsafe")).toBeInTheDocument();
    expect(screen.getByText("2 components")).toBeInTheDocument();
  });

  it("labels a component with no declared license as Unknown, not as unrestricted", () => {
    stubQuery({ data: CYCLONEDX });

    renderPanel();

    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("summarizes the distinct declared licenses", () => {
    stubQuery({ data: CYCLONEDX });

    renderPanel();

    expect(screen.getByText(/Declared licenses \(1\)/)).toBeInTheDocument();
  });

  it("does not describe the inventory as a dependency tree", () => {
    stubQuery({ data: CYCLONEDX });

    renderPanel();

    // For npm the scan can catalog declared transitives the tarball does not
    // vendor, and it never resolves a graph. Saying "dependency tree" would
    // overstate what the document is.
    expect(
      screen.getByText(/not a resolved transitive dependency tree/i),
    ).toBeInTheDocument();
  });

  it("names how a proxy SBOM comes to exist, since it cannot be generated on demand", () => {
    stubQuery({ data: CYCLONEDX });

    renderPanel();

    expect(
      screen.getByText(/cannot be generated on demand/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate/i })).toBeNull();
  });

  it("offers the raw document behind a disclosure", async () => {
    stubQuery({ data: CYCLONEDX });

    renderPanel();

    expect(screen.queryByTestId("proxy-sbom-raw")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: /view raw cyclonedx document/i }),
    );

    const raw = screen.getByTestId("proxy-sbom-raw");
    expect(raw).toBeInTheDocument();
    expect(JSON.parse(raw.textContent ?? "")).toEqual(CYCLONEDX);
  });

  it("labels the raw disclosure by the format the document declares", async () => {
    stubQuery({
      data: {
        spdxVersion: "SPDX-2.3",
        packages: [{ name: "left-pad", versionInfo: "1.3.0" }],
      },
    });

    renderPanel("npm");

    expect(
      screen.getByRole("button", { name: /view raw spdx document/i }),
    ).toBeInTheDocument();
  });

  it("sorts by every column without throwing on absent versions and purls", async () => {
    // markupsafe has neither a license nor a purl, so the sort accessors have
    // to tolerate nulls rather than producing an invalid comparison.
    stubQuery({ data: CYCLONEDX });

    renderPanel();

    for (const header of ["Component", "Version", "License"]) {
      await userEvent.click(
        screen.getByRole("button", { name: `Sort by ${header}` }),
      );
    }

    expect(screen.getByText("jinja2")).toBeInTheDocument();
    expect(screen.getByText("markupsafe")).toBeInTheDocument();
  });

  it("downloads the raw document under a name that identifies the artifact and format", async () => {
    const createObjectURL = vi.fn((_blob: Blob) => "blob:sbom");
    const revokeObjectURL = vi.fn((_url: string) => {});
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicks: HTMLAnchorElement[] = [];
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicks.push(this);
    };

    try {
      stubQuery({ data: CYCLONEDX });
      renderPanel();

      await userEvent.click(screen.getByRole("button", { name: /download/i }));

      expect(clicks).toHaveLength(1);
      expect(clicks[0].download).toBe(
        "Jinja2-2.11.2-py2.py3-none-any.whl-proxy-sbom-cyclonedx.json",
      );
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      // The blob carries the unwrapped document, not the response envelope.
      const blob = createObjectURL.mock.calls[0][0];
      expect(JSON.parse(await blob.text())).toEqual(CYCLONEDX);
      // The object URL is released rather than leaked.
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:sbom");
    } finally {
      HTMLAnchorElement.prototype.click = realClick;
    }
  });

  it("offers a download only when there is a document to download", () => {
    stubQuery({ data: CYCLONEDX });
    renderPanel();
    expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument();

    cleanup();
    stubQuery({ data: { bomFormat: "CycloneDX", components: [] } });
    renderPanel();
    expect(screen.queryByRole("button", { name: /download/i })).toBeNull();
  });
});

describe("ProxySbomPanel — query wiring", () => {
  it("keys the query by repository, path and format, and does not retry a 401", () => {
    stubQuery({ data: CYCLONEDX });

    renderPanel();

    const opts = mockUseQuery.mock.calls[0][0] as {
      queryKey: unknown[];
      retry: boolean;
      queryFn: () => unknown;
    };
    expect(opts.queryKey).toEqual([
      "proxy-sbom",
      "pypi-remote",
      "jinja2/Jinja2-2.11.2-py2.py3-none-any.whl",
      "cyclonedx",
    ]);
    expect(opts.retry).toBe(false);

    opts.queryFn();
    expect(mockGet).toHaveBeenCalledWith(
      "pypi-remote",
      "jinja2/Jinja2-2.11.2-py2.py3-none-any.whl",
      "cyclonedx",
    );
  });

  it("refetches under a new key when the format is switched", async () => {
    stubQuery({ data: CYCLONEDX });

    renderPanel();
    await userEvent.click(screen.getByRole("combobox", { name: /sbom format/i }));
    await userEvent.click(screen.getByRole("option", { name: "SPDX" }));

    const lastKey = (
      mockUseQuery.mock.calls.at(-1)![0] as { queryKey: unknown[] }
    ).queryKey;
    expect(lastKey.at(-1)).toBe("spdx");
  });
});
