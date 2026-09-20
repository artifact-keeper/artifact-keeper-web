// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import type { Artifact } from "@/types";
import type { InstallScript, PackageAnalysis } from "@/types/package-analysis";

// ---------------------------------------------------------------------------
// Mocks
//
// `useQuery` is stubbed to whatever the test sets, so only this component's
// rendering rules are under test — not react-query. `SeverityBadge` stays
// real: which severity it surfaces is part of what is asserted.
// ---------------------------------------------------------------------------

const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

vi.mock("@/lib/api/package-analysis", () => ({
  packageAnalysisApi: { get: vi.fn() },
}));

vi.mock("lucide-react", () => {
  const icon = () => null;
  return { FileQuestion: icon, Terminal: icon };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...rest }: React.ComponentProps<"button">) => (
    <button type="button" {...rest}>
      {children}
    </button>
  ),
}));

import { InstallScriptFindingsSummary } from "../install-script-findings-summary";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ARTIFACT = {
  id: "art-1",
  repository_key: "npm-main",
  path: "core-js/-/core-js-3.50.0.tgz",
  name: "core-js-3.50.0.tgz",
  size_bytes: 1024,
  checksum_sha256: "a".repeat(64),
  content_type: "application/octet-stream",
  download_count: 0,
  created_at: "2026-09-01T00:00:00Z",
} as Artifact;

function script(
  path: string,
  findings: InstallScript["findings"],
  contentAvailable = true,
): InstallScript {
  return {
    path,
    kind: "postinstall",
    size_bytes: 64,
    content_available: contentAvailable,
    findings,
  };
}

function finding(severity: string, title = "Remote code execution") {
  return {
    rule_id: "remote-code-execution",
    severity,
    title,
    description: null,
    line: 1,
    snippet: null,
  };
}

function analysis(scripts: InstallScript[]): PackageAnalysis {
  return {
    format: "npm",
    analyzed_at: null,
    completeness: {
      status: "complete",
      reason: null,
      files_total: null,
      files_read: null,
    },
    advisory_scan: null,
    vendored_components: [],
    install_scripts: scripts,
  } as PackageAnalysis;
}

function setAnalysis(data: PackageAnalysis | undefined) {
  mockUseQuery.mockReturnValue({ data });
}

describe("InstallScriptFindingsSummary", () => {
  beforeEach(() => mockUseQuery.mockReset());
  afterEach(() => cleanup());

  it("reports findings that the vulnerability scans below cannot see", () => {
    setAnalysis(
      analysis([script("package.json#scripts.preinstall", [finding("high")])]),
    );
    render(<InstallScriptFindingsSummary artifact={ARTIFACT} enabled />);

    const panel = screen.getByTestId("install-script-findings-summary");
    expect(panel.textContent).toContain("1 static-analysis finding");
  });

  it("surfaces the worst severity present, not the first", () => {
    setAnalysis(
      analysis([
        script("package.json#scripts.preinstall", [finding("low")]),
        script("package.json#scripts.postinstall", [finding("critical")]),
      ]),
    );
    render(<InstallScriptFindingsSummary artifact={ARTIFACT} enabled />);

    const panel = screen.getByTestId("install-script-findings-summary");
    expect(panel.textContent?.toLowerCase()).toContain("critical");
  });

  // -------------------------------------------------------------------------
  // The distinction this component exists to preserve.
  // -------------------------------------------------------------------------

  it("says a script was NOT INSPECTED rather than implying it was clean", () => {
    setAnalysis(
      analysis([script("info/post-link.sh", [], /* contentAvailable */ false)]),
    );
    render(<InstallScriptFindingsSummary artifact={ARTIFACT} enabled />);

    const note = screen.getByTestId("install-scripts-not-inspected");
    expect(note.textContent).toContain("not inspected");
    // An unread script must never be described as having no findings.
    expect(note.textContent).toContain("not the same as finding nothing");
  });

  it("stays silent when scripts were read and nothing was found", () => {
    // A real result, but it belongs on the Analysis tab. A "0 findings" line
    // on the Security summary reads as an assurance this component cannot give.
    setAnalysis(analysis([script("package.json#scripts.postinstall", [])]));
    render(<InstallScriptFindingsSummary artifact={ARTIFACT} enabled />);

    expect(
      screen.queryByTestId("install-script-findings-summary"),
    ).toBeNull();
  });

  it("renders nothing when the package has no install scripts", () => {
    setAnalysis(analysis([]));
    render(<InstallScriptFindingsSummary artifact={ARTIFACT} enabled />);

    expect(
      screen.queryByTestId("install-script-findings-summary"),
    ).toBeNull();
  });

  it("renders nothing when there is no analysis row or the load failed", () => {
    setAnalysis(undefined);
    render(<InstallScriptFindingsSummary artifact={ARTIFACT} enabled />);

    expect(
      screen.queryByTestId("install-script-findings-summary"),
    ).toBeNull();
  });

  it("skips the request entirely when the format is not analysed", () => {
    setAnalysis(undefined);
    render(
      <InstallScriptFindingsSummary artifact={ARTIFACT} enabled={false} />,
    );

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("offers a route to the Analysis tab where the detail lives", () => {
    const onOpenAnalysis = vi.fn();
    setAnalysis(
      analysis([script("package.json#scripts.postinstall", [finding("high")])]),
    );
    render(
      <InstallScriptFindingsSummary
        artifact={ARTIFACT}
        enabled
        onOpenAnalysis={onOpenAnalysis}
      />,
    );

    fireEvent.click(screen.getByText("View in Analysis"));
    expect(onOpenAnalysis).toHaveBeenCalledTimes(1);
  });
});
