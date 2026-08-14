// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { ApiError } from "@/lib/api/fetch";
import type {
  ProxyScanEntry,
  ProxyScanListResponse,
} from "@/types/proxy-scans";

const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

const mockList = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/proxy-scans", () => ({
  proxyScansApi: { list: mockList, getByPath: vi.fn() },
}));

import { ProxyScanSummarySection } from "../proxy-scan-summary";

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

function response(
  overrides: Partial<ProxyScanListResponse> = {},
): ProxyScanListResponse {
  return {
    scan_on_proxy: true,
    proxy_scan_action: "fail_closed",
    summary: { clean: 4, vulnerable: 2, not_scanned: 1, pending_ingest: 3 },
    items: [entry()],
    total: 1,
    page: 1,
    per_page: 20,
    ...overrides,
  };
}

function stubQuery(result: {
  data?: ProxyScanListResponse;
  isLoading?: boolean;
  error?: unknown;
}) {
  mockUseQuery.mockReturnValue({
    data: result.data,
    isLoading: result.isLoading ?? false,
    error: result.error ?? null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe("ProxyScanSummarySection — access", () => {
  it("renders the sign-in copy for an anonymous viewer, not an empty table", () => {
    // An empty table would read as "nothing cached, nothing wrong" — the same
    // implied all-clear the per-artifact panel had to remove.
    stubQuery({ error: new ApiError(401, "unauthorized") });

    render(<ProxyScanSummarySection repositoryKey="npm-remote" />);

    expect(screen.getByText("Sign in to view scan status.")).toBeInTheDocument();
    expect(screen.queryByTestId("proxy-summary-clean")).toBeNull();
  });

  it("says the endpoint is unavailable rather than reporting a scan failure on a 404", () => {
    stubQuery({ error: new ApiError(404, "not found") });

    render(<ProxyScanSummarySection repositoryKey="npm-remote" />);

    expect(screen.getByTestId("proxy-scan-unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/not a clean result/i)).toBeNull();
  });
});

describe("ProxyScanSummarySection — summary", () => {
  it("renders counts by state plus the pending-ingest count", () => {
    stubQuery({ data: response() });

    render(<ProxyScanSummarySection repositoryKey="npm-remote" />);

    expect(screen.getByTestId("proxy-summary-clean")).toHaveTextContent("4");
    expect(screen.getByTestId("proxy-summary-vulnerable")).toHaveTextContent("2");
    expect(screen.getByTestId("proxy-summary-not-scanned")).toHaveTextContent("1");
    // NULL-checksum placeholder rows are excluded from the state counts, so
    // they are reported separately for the totals to reconcile with the
    // artifact listing.
    expect(screen.getByTestId("proxy-summary-pending-ingest")).toHaveTextContent(
      "3",
    );
  });

  it("labels the counts as distinct digests, not cache paths", () => {
    stubQuery({ data: response() });

    render(<ProxyScanSummarySection repositoryKey="npm-remote" />);

    expect(
      screen.getByText(/distinct content digests, not cache paths/i),
    ).toBeInTheDocument();
  });

  it("shows the enforcement banner when a non-scanning repository displays verdicts", () => {
    stubQuery({
      data: response({ scan_on_proxy: false, proxy_scan_action: "fail_open" }),
    });

    render(<ProxyScanSummarySection repositoryKey="npm-remote" />);

    expect(screen.getByTestId("proxy-scan-enforcement-banner")).toBeInTheDocument();
  });

  it("omits the enforcement banner when the repository scans its own downloads", () => {
    stubQuery({ data: response() });

    render(<ProxyScanSummarySection repositoryKey="npm-remote" />);

    expect(screen.queryByTestId("proxy-scan-enforcement-banner")).toBeNull();
  });

  it("omits the enforcement banner when there is no verdict to attribute", () => {
    stubQuery({
      data: response({
        scan_on_proxy: false,
        summary: { clean: 0, vulnerable: 0, not_scanned: 9, pending_ingest: 0 },
      }),
    });

    render(<ProxyScanSummarySection repositoryKey="npm-remote" />);

    expect(screen.queryByTestId("proxy-scan-enforcement-banner")).toBeNull();
  });
});

describe("ProxyScanSummarySection — listing", () => {
  it("names which digests are affected, not only how many", () => {
    // Counts alone answer "2 vulnerable digests" but not which ones, forcing a
    // click through every artifact modal to find them.
    stubQuery({
      data: response({
        items: [
          entry({
            path: "jinja2/jinja2-2.11.2.tar.gz",
            state: "vulnerable",
            critical_count: 1,
            high_count: 4,
            findings_count: 5,
          }),
          entry({ path: "requests/requests-2.32.5-py3-none-any.whl" }),
        ],
        total: 2,
      }),
    });

    render(<ProxyScanSummarySection repositoryKey="npm-remote" />);

    expect(screen.getByText("jinja2/jinja2-2.11.2.tar.gz")).toBeInTheDocument();
    expect(
      screen.getByText("requests/requests-2.32.5-py3-none-any.whl"),
    ).toBeInTheDocument();
    expect(screen.getByText("Vulnerable")).toBeInTheDocument();
    expect(screen.getByText("Clean")).toBeInTheDocument();
    expect(screen.getByText("5 findings")).toBeInTheDocument();
  });

  it("names the remedy for missing per-CVE detail", () => {
    stubQuery({ data: response() });

    render(<ProxyScanSummarySection repositoryKey="npm-remote" />);

    expect(
      screen.getByText(/ingest this artifact into a hosted repository/i),
    ).toBeInTheDocument();
  });

  it("requests the repository-scoped page without retrying a 401", () => {
    stubQuery({ data: response() });

    render(<ProxyScanSummarySection repositoryKey="npm-remote" />);

    const opts = mockUseQuery.mock.calls[0][0] as {
      queryKey: unknown[];
      retry: boolean;
      queryFn: () => unknown;
    };
    expect(opts.queryKey).toEqual(["proxy-scans", "npm-remote", 1]);
    expect(opts.retry).toBe(false);

    opts.queryFn();
    expect(mockList).toHaveBeenCalledWith("npm-remote", { page: 1, per_page: 20 });
  });

  it("shows a skeleton before the first page arrives", () => {
    stubQuery({ isLoading: true });

    render(<ProxyScanSummarySection repositoryKey="npm-remote" />);

    expect(screen.queryByTestId("proxy-summary-clean")).toBeNull();
  });
});
