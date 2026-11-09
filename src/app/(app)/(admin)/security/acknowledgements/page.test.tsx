// @vitest-environment jsdom
// The decisions view (backend artifact-keeper#5224): a decision can outlive any
// finding row that reaches it, so it has its own place to be seen and undone.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

afterEach(() => cleanup());

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/use-document-title", () => ({ useDocumentTitle: () => {} }));

const api = vi.hoisted(() => ({ list: vi.fn(), revoke: vi.fn() }));
vi.mock("@/lib/api/acknowledgements", () => ({ acknowledgementsApi: api }));

vi.mock("@/hooks/use-repositories", () => ({
  useRepositories: () => ({
    data: { items: [{ id: "r1", key: "libs-prod" }] },
  }),
}));

interface Row {
  id: string;
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
        <div key={r.id} data-testid="row">
          {columns.map((c) => (
            <div key={c.id}>{c.cell?.(r)}</div>
          ))}
        </div>
      ))}
    </div>
  ),
}));

import AcknowledgementsPage from "./page";

function decision(over: Record<string, unknown> = {}) {
  return {
    id: "d1",
    lineage_id: "l1",
    repository_id: "r1",
    checksum_sha256: "a".repeat(64),
    finding_class: "vulnerability",
    advisory: "CVE-2024-1",
    component: "openssl",
    component_version: "1.1",
    max_severity: "high",
    reason: "risk_accepted",
    acknowledged_by: "u1",
    acknowledged_at: "2026-11-01T00:00:00Z",
    expires_at: null,
    created_via: "api",
    carried_by: null,
    revoked_at: null,
    revoked_by: null,
    revoked_reason: null,
    state: "active",
    ...over,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AcknowledgementsPage />
    </QueryClientProvider>,
  );
}

async function revoke() {
  fireEvent.click(await screen.findByRole("button", { name: /^revoke$/i }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: /^revoke$/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue({ items: [decision()], total: 1 });
  api.revoke.mockResolvedValue({ revoked: 1, left_effective: 0 });
});

describe("AcknowledgementsPage", () => {
  it("lists live decisions by default, naming the repository", async () => {
    renderPage();
    expect(await screen.findByText("CVE-2024-1")).toBeInTheDocument();
    expect(screen.getByText("libs-prod")).toBeInTheDocument();
    expect(api.list.mock.calls[0][0].include_inactive).toBeUndefined();
  });

  it("names a decision for every repository as such", async () => {
    api.list.mockResolvedValue({
      items: [decision({ repository_id: null })],
      total: 1,
    });
    renderPage();
    expect(await screen.findByText("Every repository")).toBeInTheDocument();
  });

  it("includes expired and revoked ones when asked", async () => {
    renderPage();
    await screen.findByText("CVE-2024-1");
    fireEvent.click(screen.getByRole("switch", { name: /include expired and revoked/i }));
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ include_inactive: true }),
      ),
    );
  });

  it("offers no revoke on a decision already revoked", async () => {
    api.list.mockResolvedValue({
      items: [decision({ state: "revoked", revoked_at: "2026-11-02T00:00:00Z" })],
      total: 1,
    });
    renderPage();
    await screen.findByText("CVE-2024-1");
    expect(screen.queryByRole("button", { name: /^revoke$/i })).toBeNull();
  });

  it("revokes by id and reports a complete revoke as a success", async () => {
    renderPage();
    await revoke();
    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith("d1"));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("warns and does not report success when decisions stay in force", async () => {
    api.revoke.mockResolvedValue({ revoked: 1, left_effective: 2 });
    renderPage();
    await revoke();
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(toast.warning.mock.calls[0][0]).toMatch(/remains accepted/i);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not claim a revoke when nothing was revoked", async () => {
    api.revoke.mockResolvedValue({ revoked: 0, left_effective: 0 });
    renderPage();
    await revoke();
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("explains a refusal for a caller who cannot act everywhere", async () => {
    api.list.mockRejectedValue({ status: 403, message: "nope" });
    renderPage();
    expect(await screen.findByTestId("acknowledgements-error")).toHaveTextContent(
      /every repository/i,
    );
  });
});
