// @vitest-environment jsdom
// Proxy-blocked list and the enforcement preview (backend artifact-keeper#5238).
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

afterEach(() => cleanup());

const searchParams = vi.hoisted(() => ({ value: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.value,
}));
vi.mock("@/hooks/use-document-title", () => ({ useDocumentTitle: () => {} }));

const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/api/proxy-blocked", () => ({ proxyBlockedApi: api }));

interface Row {
  checksum_sha256: string;
}
vi.mock("@/components/common/data-table", () => ({
  DataTable: ({
    data,
    columns,
    emptyMessage,
  }: {
    data: Row[];
    columns: { id: string; cell?: (r: Row) => React.ReactNode }[];
    emptyMessage?: string;
  }) => (
    <div>
      {data.length === 0 && <p>{emptyMessage}</p>}
      {data.map((r) => (
        <div key={r.checksum_sha256} data-testid="row">
          {columns.map((c) => (
            <div key={c.id}>{c.cell?.(r)}</div>
          ))}
        </div>
      ))}
    </div>
  ),
}));

import ProxyBlockedPage from "./page";

const ITEM = {
  repository_id: "r1",
  repository_key: "pypi-remote",
  repository_format: "pypi",
  path: "simple/x/x-1.0.whl",
  name: "x-1.0.whl",
  checksum_sha256: "a".repeat(64),
  max_severity: "high",
  findings_count: 2,
  critical_count: 0,
  high_count: 2,
  medium_count: 0,
  low_count: 0,
  cve_ids: ["CVE-2024-1"],
  scanned_at: "2026-11-01T00:00:00Z",
  proxy_scan_action: null,
};

const PAGINATION = { page: 1, per_page: 20, total: 1, total_pages: 1 };

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProxyBlockedPage />
    </QueryClientProvider>,
  );
}

function preview(over: Record<string, unknown> = {}) {
  return {
    items: [{ ...ITEM, proxy_scan_action: "record_only" }],
    pagination: PAGINATION,
    would_block_summary: {
      would_block_digests: 3,
      no_verdict: 12,
      stale_verdict: 4,
      clean_graded_nothing: 5,
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.value = new URLSearchParams();
  api.list.mockResolvedValue({
    items: [ITEM],
    pagination: PAGINATION,
    would_block_summary: null,
  });
});

describe("ProxyBlockedPage", () => {
  it("lists what is refused now, without asking for a preview", async () => {
    renderPage();
    expect(await screen.findByText("x-1.0.whl")).toBeInTheDocument();
    expect(api.list.mock.calls[0][0].would_block).toBeUndefined();
    expect(screen.queryByTestId("would-block-summary")).toBeNull();
  });

  it("sends would_block=true when the toggle is on and shows the summary", async () => {
    renderPage();
    api.list.mockResolvedValue(preview());
    await screen.findByText("x-1.0.whl");
    fireEvent.click(screen.getByRole("switch", { name: /preview enforcement/i }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ would_block: true }),
      ),
    );
    const summary = await screen.findByTestId("would-block-summary");
    expect(summary).toHaveTextContent("3");
    expect(summary).toHaveTextContent("12");
    expect(summary).toHaveTextContent("4");
    expect(summary).toHaveTextContent("5");
  });

  it("opens in preview from the dashboard's link", async () => {
    searchParams.value = new URLSearchParams("would_block=true");
    api.list.mockResolvedValue(preview());
    renderPage();
    await screen.findByTestId("would-block-summary");
    expect(api.list.mock.calls[0][0].would_block).toBe(true);
  });

  describe("the wording of the preview", () => {
    beforeEach(() => {
      searchParams.value = new URLSearchParams("would_block=true");
      api.list.mockResolvedValue(preview());
    });

    it("calls the no-verdict counts upper bounds, not refusals", async () => {
      renderPage();
      const summary = await screen.findByTestId("would-block-summary");
      expect(screen.getByTestId("would-block-no-verdict")).toHaveTextContent(/up to 12/i);
      expect(screen.getByTestId("would-block-stale")).toHaveTextContent(/up to 4/i);
      expect(screen.getByTestId("would-block-clean-nothing")).toHaveTextContent(/up to 5/i);
      expect(summary).toHaveTextContent(/upper bound/i);
      expect(summary).toHaveTextContent(/not a count of refusals/i);
    });

    it("says those files are scanned on the next pull under fail_closed", async () => {
      renderPage();
      const summary = await screen.findByTestId("would-block-summary");
      expect(summary).toHaveTextContent(/fail_closed/);
      expect(summary).toHaveTextContent(/scanned .*on (its|the) next pull/i);
      expect(summary).toHaveTextContent(/423/);
    });

    it("does not count them with what would be refused", async () => {
      renderPage();
      expect(await screen.findByTestId("would-block-digests")).toHaveTextContent("3");
      expect(screen.getByTestId("would-block-digests")).not.toHaveTextContent("24");
    });

    it("tells what is refused today from what record_only still serves", async () => {
      api.list.mockResolvedValue(
        preview({
          items: [
            { ...ITEM, proxy_scan_action: "record_only" },
            {
              ...ITEM,
              checksum_sha256: "b".repeat(64),
              path: "simple/y/y-1.0.whl",
              name: "y-1.0.whl",
              proxy_scan_action: "fail_closed",
            },
          ],
        }),
      );
      renderPage();
      await screen.findByText("y-1.0.whl");
      expect(screen.getByText(/served today/i)).toBeInTheDocument();
      expect(screen.getByText(/^refused today/i)).toBeInTheDocument();
    });

    it("does not read as all clear when nothing is listed", async () => {
      api.list.mockResolvedValue(preview({ items: [] }));
      renderPage();
      await screen.findByTestId("would-block-summary");
      expect(screen.getByText(/no stored verdict would be refused/i)).toBeInTheDocument();
    });

    it("says the preview reads stored verdicts only", async () => {
      renderPage();
      const summary = await screen.findByTestId("would-block-summary");
      expect(summary).toHaveTextContent(/stored verdicts only/i);
    });
  });

  it("passes the repository and severity filters on", async () => {
    renderPage();
    await screen.findByText("x-1.0.whl");
    fireEvent.change(screen.getByLabelText(/^repository$/i), {
      target: { value: "pypi-remote" },
    });
    fireEvent.submit(screen.getByTestId("proxy-blocked-filters"));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ repository: "pypi-remote" }),
      ),
    );
  });

  it("explains a refusal for a credential that is not instance-wide", async () => {
    api.list.mockRejectedValue({ status: 403, message: "forbidden" });
    renderPage();
    expect(await screen.findByTestId("proxy-blocked-error")).toHaveTextContent(
      /unrestricted/i,
    );
  });

  it("shows other failures as failures, not an empty list", async () => {
    api.list.mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByTestId("proxy-blocked-error")).toHaveTextContent("boom");
    expect(screen.queryByText(/no proxied content/i)).toBeNull();
  });
});
