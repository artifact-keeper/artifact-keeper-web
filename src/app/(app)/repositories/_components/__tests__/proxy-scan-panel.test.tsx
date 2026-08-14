// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { ApiError } from "@/lib/api/fetch";
import type { ProxyScanEntry, ProxyScanPathResponse } from "@/types/proxy-scans";

const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

const mockGetByPath = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/proxy-scans", () => ({
  proxyScansApi: { getByPath: mockGetByPath, list: vi.fn() },
}));

import { ProxyScanPanel } from "../proxy-scan-panel";

function entry(overrides: Partial<ProxyScanEntry> = {}): ProxyScanEntry {
  return {
    path: "left-pad/-/left-pad-1.3.0.tgz",
    state: "clean",
    reason: null,
    critical_count: 0,
    high_count: 0,
    medium_count: 0,
    low_count: 0,
    findings_count: 0,
    scanned_at: "2026-08-01T12:00:00Z",
    ...overrides,
  };
}

function stubQuery(result: {
  data?: Partial<ProxyScanPathResponse>;
  isLoading?: boolean;
  error?: unknown;
}) {
  mockUseQuery.mockReturnValue({
    data: result.data,
    isLoading: result.isLoading ?? false,
    error: result.error ?? null,
  });
}

function renderPanel() {
  return render(
    <ProxyScanPanel
      repositoryKey="npm-remote"
      path="left-pad/-/left-pad-1.3.0.tgz"
    />,
  );
}

/** Any wording that would let a viewer read the panel as an all-clear. */
function expectNoImpliedAllClear() {
  expect(screen.queryByText(/no vulnerabilities detected/i)).toBeNull();
  // Absent is fine; present-and-clean is the bug. `queryByTestId` returns null
  // when the callout is not rendered at all, so assert on the attribute.
  expect(
    screen.queryByTestId("proxy-scan-verdict")?.getAttribute("data-tone"),
  ).not.toBe("clean");
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// The named regression test. This is the bug the feature exists to fix, for
// its largest audience.
// ---------------------------------------------------------------------------

describe("ProxyScanPanel — anonymous viewer regression", () => {
  it("renders 'Sign in to view scan status.' for an anonymous viewer on a public proxy repository, never a green all-clear", () => {
    // The repositories pages sit outside the (protected) route group and the
    // artifact Security tab has no auth gating, so this component renders for
    // anonymous users on public repositories. The endpoint 401s them by
    // design. If that failure were treated as zero findings, the green
    // all-clear would come back for exactly this audience.
    stubQuery({ error: new ApiError(401, "unauthorized") });

    renderPanel();

    expect(screen.getByText("Sign in to view scan status.")).toBeInTheDocument();
    expect(screen.getByTestId("proxy-scan-access-notice")).toHaveAttribute(
      "data-failure",
      "unauthenticated",
    );
    expectNoImpliedAllClear();
  });
});

describe("ProxyScanPanel — access failures", () => {
  it("does not tell an already signed-in user to sign in", () => {
    stubQuery({ error: new ApiError(403, "forbidden") });

    renderPanel();

    expect(screen.queryByText("Sign in to view scan status.")).toBeNull();
    expect(
      screen.getByText(/do not have access to scan status/i),
    ).toBeInTheDocument();
    expectNoImpliedAllClear();
  });

  it("says plainly that a transport failure is not a clean result", () => {
    stubQuery({ error: new ApiError(500, "boom") });

    renderPanel();

    expect(screen.getByText(/not a clean result/i)).toBeInTheDocument();
    expectNoImpliedAllClear();
  });

  it("shows a skeleton while the verdict is in flight", () => {
    stubQuery({ isLoading: true });

    renderPanel();

    expect(screen.queryByTestId("proxy-scan-verdict")).toBeNull();
    expectNoImpliedAllClear();
  });
});

describe("ProxyScanPanel — unresolvable path", () => {
  it("renders a 404 as unknown rather than clean", () => {
    // A repository with zero catalog rows falls back to storage enumeration
    // for its listing, so a modal click there can produce a path the
    // catalog-backed endpoint cannot resolve.
    stubQuery({ error: new ApiError(404, "not found") });

    renderPanel();

    expect(screen.getByTestId("proxy-scan-verdict")).toHaveAttribute(
      "data-tone",
      "neutral",
    );
    expect(screen.getByText(/Unknown is not clean/)).toBeInTheDocument();
  });

  it("renders a resolved-but-empty response as unknown rather than clean", () => {
    // Placeholder rows whose checksum_sha256 is NULL join to nothing.
    stubQuery({
      data: { scan_on_proxy: true, proxy_scan_action: "fail_closed", entry: null },
    });

    renderPanel();

    expect(screen.getByText(/Scan status unknown for this path/i)).toBeInTheDocument();
    expectNoImpliedAllClear();
  });
});

describe("ProxyScanPanel — verdicts", () => {
  it("renders a clean verdict as a statement about when, not a guarantee about now", () => {
    stubQuery({
      data: {
        scan_on_proxy: true,
        proxy_scan_action: "fail_closed",
        entry: entry({ state: "clean" }),
      },
    });

    renderPanel();

    expect(screen.getByTestId("proxy-scan-verdict")).toHaveAttribute(
      "data-tone",
      "clean",
    );
    expect(screen.getByText(/^Clean as of /)).toBeInTheDocument();
    expect(screen.getByText(/database may have changed/i)).toBeInTheDocument();
    expect(screen.queryByTestId("proxy-scan-enforcement-banner")).toBeNull();
  });

  it("renders a vulnerable verdict with its severity breakdown", () => {
    stubQuery({
      data: {
        scan_on_proxy: true,
        proxy_scan_action: "fail_closed",
        entry: entry({
          state: "vulnerable",
          critical_count: 1,
          high_count: 2,
          findings_count: 3,
        }),
      },
    });

    renderPanel();

    expect(screen.getByTestId("proxy-scan-verdict")).toHaveAttribute(
      "data-tone",
      "danger",
    );
    expect(screen.getByText("3 findings")).toBeInTheDocument();
    expect(screen.getByText("1 critical")).toBeInTheDocument();
    expect(screen.getByText("2 high")).toBeInTheDocument();
  });

  it("does not claim a vulnerable artifact was blocked on a fail-open repository", () => {
    stubQuery({
      data: {
        scan_on_proxy: true,
        proxy_scan_action: "fail_open",
        entry: entry({ state: "vulnerable", findings_count: 1, high_count: 1 }),
      },
    });

    renderPanel();

    expect(screen.getByText(/may still be served/i)).toBeInTheDocument();
    expect(screen.queryByText(/downloads are blocked/i)).toBeNull();
  });

  it("shows the enforcement banner when a non-scanning repository displays an inherited verdict", () => {
    // Verdicts are global by digest. This repository did not record it and
    // does not enforce it.
    stubQuery({
      data: {
        scan_on_proxy: false,
        proxy_scan_action: "fail_open",
        entry: entry({ state: "vulnerable", findings_count: 1, critical_count: 1 }),
      },
    });

    renderPanel();

    expect(screen.getByTestId("proxy-scan-enforcement-banner")).toBeInTheDocument();
    expect(
      screen.getByText(/verdicts shown were recorded elsewhere/i),
    ).toBeInTheDocument();
    // And it must not claim this repository did the scanning.
    expect(screen.queryByText(/this repository scanned/i)).toBeNull();
  });

  it("renders not_scanned neutrally and never as clean", () => {
    stubQuery({
      data: {
        scan_on_proxy: false,
        proxy_scan_action: "fail_open",
        entry: entry({
          state: "not_scanned",
          reason: "scanning_disabled",
          scanned_at: null,
        }),
      },
    });

    renderPanel();

    expect(screen.getByTestId("proxy-scan-verdict")).toHaveAttribute(
      "data-tone",
      "neutral",
    );
    expect(screen.getByText(/scanning is disabled/i)).toBeInTheDocument();
    expect(screen.getByText(/not evidence of safety/i)).toBeInTheDocument();
    // not_scanned is not an inherited verdict, so no enforcement banner.
    expect(screen.queryByTestId("proxy-scan-enforcement-banner")).toBeNull();
  });

  it("names the remedy whenever a verdict is on screen", () => {
    stubQuery({
      data: {
        scan_on_proxy: true,
        proxy_scan_action: "fail_closed",
        entry: entry({ state: "vulnerable", findings_count: 1, high_count: 1 }),
      },
    });

    renderPanel();

    expect(
      screen.getByText(/Per-CVE detail is not available for proxy-cached content/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/ingest this artifact into a hosted repository/i),
    ).toBeInTheDocument();
  });

  it("queries by cache path, scoped to the repository", () => {
    stubQuery({ data: { entry: entry() } });

    renderPanel();

    const opts = mockUseQuery.mock.calls[0][0] as {
      queryKey: unknown[];
      retry: boolean;
      queryFn: () => unknown;
    };
    expect(opts.queryKey).toEqual([
      "proxy-scan",
      "npm-remote",
      "left-pad/-/left-pad-1.3.0.tgz",
    ]);
    // A 401 must surface as the sign-in state immediately, not after retries.
    expect(opts.retry).toBe(false);

    opts.queryFn();
    expect(mockGetByPath).toHaveBeenCalledWith(
      "npm-remote",
      "left-pad/-/left-pad-1.3.0.tgz",
    );
  });
});
