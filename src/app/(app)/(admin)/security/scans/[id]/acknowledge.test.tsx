// @vitest-environment jsdom
// Durable acknowledgements (web #1072, backend artifact-keeper#5224): what the
// scan detail page sends and what it tells the user. Uses a real QueryClient so
// the mutations and their handlers actually run.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

afterEach(() => cleanup());

const searchParams = vi.hoisted(() => ({ value: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "source-scan" }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => searchParams.value,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks/use-document-title", () => ({ useDocumentTitle: () => {} }));
vi.mock("@/lib/api/blast-radius", () => ({ blastRadiusHref: () => "/br" }));

const api = vi.hoisted(() => ({
  getScan: vi.fn(),
  listFindings: vi.fn(),
  acknowledgeFinding: vi.fn(),
  revokeAcknowledgment: vi.fn(),
}));
vi.mock("@/lib/api/security", () => ({ securityApi: api }));

const decisions = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/api/acknowledgements", () => ({ acknowledgementsApi: decisions }));

vi.mock("@/hooks/use-repositories", () => ({
  useRepositories: () => ({
    data: {
      items: [
        { id: "dev-repo", key: "libs-dev" },
        { id: "prod-repo", key: "libs-prod" },
      ],
    },
  }),
}));

// Native select stub (this directory's convention), labelled by the trigger.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children: React.ReactNode;
  }) => {
    const items: Array<{ value: string; label: string }> = [];
    let label: string | undefined;
    React.Children.forEach(children, (c) => {
      if (!React.isValidElement(c)) return;
      const props = c.props as { children?: React.ReactNode; "aria-label"?: string };
      if (props["aria-label"]) label = props["aria-label"];
      React.Children.forEach(props.children, (s) => {
        if (React.isValidElement(s) && (s.props as Record<string, unknown>).value) {
          const p = s.props as { value: string; children: React.ReactNode };
          items.push({ value: p.value, label: React.Children.toArray(p.children).join("") });
        }
      });
    });
    return (
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
      >
        {items.map((i) => (
          <option key={i.value} value={i.value}>
            {i.label}
          </option>
        ))}
      </select>
    );
  },
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

interface Row {
  id: string;
}
interface DataTableProps {
  data: Row[];
  columns: { id: string; cell?: (r: Row) => React.ReactNode }[];
}
vi.mock("@/components/common/data-table", () => ({
  DataTable: ({ data, columns }: DataTableProps) => (
    <div>
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

import SecurityScanDetailPage from "./page";

const SCAN = {
  id: "source-scan",
  artifact_id: "dev-artifact",
  artifact_name: "lib.jar",
  artifact_version: "1.0",
  repository_id: "dev-repo",
  scan_type: "grype",
  status: "completed",
  findings_count: 1,
  critical_count: 0,
  high_count: 1,
  medium_count: 0,
  low_count: 0,
  info_count: 0,
  scanner_version: null,
  error_message: null,
  started_at: null,
  completed_at: null,
  created_at: "2026-11-01T00:00:00Z",
};

function finding(over: Record<string, unknown> = {}) {
  return {
    id: "finding-1",
    scan_result_id: "source-scan",
    artifact_id: "dev-artifact",
    severity: "high",
    title: "Bad thing",
    description: null,
    cve_id: "CVE-2024-1",
    affected_component: "openssl",
    affected_version: "1.1",
    fixed_version: null,
    source: "grype",
    source_url: null,
    is_acknowledged: false,
    acknowledged_by: null,
    acknowledged_reason: null,
    acknowledged_at: null,
    created_at: "2026-11-01T00:00:00Z",
    ...over,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SecurityScanDetailPage />
    </QueryClientProvider>,
  );
}

function viewCopy() {
  searchParams.value = new URLSearchParams(
    "artifact_id=prod-artifact&repository_id=prod-repo",
  );
}

async function openAckDialog() {
  fireEvent.click(await screen.findByRole("button", { name: /^acknowledge$/i }));
  return screen.findByRole("dialog");
}

async function submitAck(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole("button", { name: /^acknowledge$/i }));
}

async function revoke() {
  fireEvent.click(await screen.findByRole("button", { name: /^revoke$/i }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: /^revoke$/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.value = new URLSearchParams();
  api.getScan.mockResolvedValue(SCAN);
  api.listFindings.mockResolvedValue({ items: [finding()], total: 1 });
  api.acknowledgeFinding.mockResolvedValue(finding({ is_acknowledged: true }));
  api.revokeAcknowledgment.mockResolvedValue(
    finding({ acknowledgements_left_effective: 0 }),
  );
  // Not allowed to act everywhere unless a test says so.
  decisions.list.mockRejectedValue(new Error("forbidden"));
});

describe("which repository a decision names", () => {
  it("names the scan's own repository when not viewing a copy", async () => {
    renderPage();
    const dialog = await openAckDialog();
    await submitAck(dialog);
    await waitFor(() => expect(api.acknowledgeFinding).toHaveBeenCalled());
    expect(api.acknowledgeFinding).toHaveBeenCalledWith(
      "finding-1",
      "risk_accepted",
      expect.objectContaining({ repository_id: "dev-repo" }),
    );
  });

  it("lists a copy's own rows and names the copy's repository", async () => {
    viewCopy();
    renderPage();
    const dialog = await openAckDialog();
    await waitFor(() =>
      expect(api.listFindings).toHaveBeenCalledWith(
        "source-scan",
        expect.objectContaining({ artifact_id: "prod-artifact" }),
      ),
    );
    await submitAck(dialog);
    await waitFor(() => expect(api.acknowledgeFinding).toHaveBeenCalled());
    expect(api.acknowledgeFinding.mock.calls[0][2].repository_id).toBe("prod-repo");
  });

  it("does not put a stray artifact_id on the list when not viewing a copy", async () => {
    renderPage();
    await screen.findByRole("button", { name: /^acknowledge$/i });
    expect(api.listFindings.mock.calls[0][1].artifact_id).toBeUndefined();
  });

  it("shows in the dialog which repository the decision applies in", async () => {
    viewCopy();
    renderPage();
    const dialog = await openAckDialog();
    expect(within(dialog).getByTestId("ack-repository")).toHaveTextContent("libs-prod");
  });

  it("tells the user they are looking at a copy", async () => {
    viewCopy();
    renderPage();
    expect(await screen.findByTestId("scan-copy-notice")).toHaveTextContent("libs-prod");
  });

  it("shows no copy notice on the scan's own page", async () => {
    renderPage();
    await screen.findByRole("button", { name: /^acknowledge$/i });
    expect(screen.queryByTestId("scan-copy-notice")).toBeNull();
  });

  it("names the repository on a revoke", async () => {
    viewCopy();
    api.listFindings.mockResolvedValue({
      items: [finding({ is_acknowledged: true })],
      total: 1,
    });
    renderPage();
    await revoke();
    await waitFor(() =>
      expect(api.revokeAcknowledgment).toHaveBeenCalledWith("finding-1", {
        repository_id: "prod-repo",
      }),
    );
  });
});

describe("a 409 because the scan has copies elsewhere", () => {
  const CONFLICT = {
    code: "CONFLICT",
    message:
      "This finding's scan has copies in other repositories; say which one is meant with repository_id",
  };

  it("explains it on acknowledge and keeps the dialog open", async () => {
    api.acknowledgeFinding.mockRejectedValue(CONFLICT);
    renderPage();
    const dialog = await openAckDialog();
    await submitAck(dialog);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error.mock.calls[0][0]).toMatch(/copied into other repositories/i);
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("explains it on revoke and does not report a revoke", async () => {
    api.listFindings.mockResolvedValue({
      items: [finding({ is_acknowledged: true })],
      total: 1,
    });
    api.revokeAcknowledgment.mockRejectedValue(CONFLICT);
    renderPage();
    await revoke();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error.mock.calls[0][0]).toMatch(/copied into other repositories/i);
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("what a revoke reports", () => {
  beforeEach(() => {
    api.listFindings.mockResolvedValue({
      items: [finding({ is_acknowledged: true })],
      total: 1,
    });
  });

  it("is a success when nothing stays in force", async () => {
    renderPage();
    await revoke();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("warns, and does not report success, when copies stay in force", async () => {
    api.revokeAcknowledgment.mockResolvedValue(
      finding({ acknowledgements_left_effective: 2 }),
    );
    renderPage();
    await revoke();
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(toast.warning.mock.calls[0][0]).toMatch(/remains accepted elsewhere/i);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("warns when the finding still reads as acknowledged here", async () => {
    api.revokeAcknowledgment.mockResolvedValue(
      finding({ is_acknowledged: true, acknowledgements_left_effective: 0 }),
    );
    renderPage();
    await revoke();
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("the expiry of a decision", () => {
  it("sends none by default", async () => {
    renderPage();
    const dialog = await openAckDialog();
    await submitAck(dialog);
    await waitFor(() => expect(api.acknowledgeFinding).toHaveBeenCalled());
    expect(api.acknowledgeFinding.mock.calls[0][2].expires_at).toBeUndefined();
  });

  it("sends a future time as an instant", async () => {
    renderPage();
    const dialog = await openAckDialog();
    fireEvent.change(within(dialog).getByLabelText(/expires/i), {
      target: { value: "2099-06-01T12:30" },
    });
    await submitAck(dialog);
    await waitFor(() => expect(api.acknowledgeFinding).toHaveBeenCalled());
    expect(api.acknowledgeFinding.mock.calls[0][2].expires_at).toBe(
      new Date("2099-06-01T12:30").toISOString(),
    );
  });

  it("refuses a past time before asking the backend", async () => {
    renderPage();
    const dialog = await openAckDialog();
    fireEvent.change(within(dialog).getByLabelText(/expires/i), {
      target: { value: "2001-01-01T00:00" },
    });
    await submitAck(dialog);
    expect(await within(dialog).findByTestId("ack-expiry-error")).toHaveTextContent(
      /future/i,
    );
    expect(api.acknowledgeFinding).not.toHaveBeenCalled();
  });

  it("shows when an acknowledged finding's decision lapses", async () => {
    api.listFindings.mockResolvedValue({
      items: [
        finding({
          is_acknowledged: true,
          acknowledgement_expires_at: "2099-06-01T12:30:00Z",
        }),
      ],
      total: 1,
    });
    renderPage();
    expect(await screen.findByTestId("ack-expires")).toHaveTextContent(/2099/);
  });
});

describe("the scope of a decision", () => {
  it("is not offered to a caller who cannot act everywhere", async () => {
    renderPage();
    const dialog = await openAckDialog();
    await waitFor(() => expect(decisions.list).toHaveBeenCalled());
    expect(within(dialog).queryByLabelText(/applies in/i)).toBeNull();
  });

  it("is offered to one who can, and defaults to this repository", async () => {
    decisions.list.mockResolvedValue({ items: [], total: 0 });
    renderPage();
    const dialog = await openAckDialog();
    await within(dialog).findByLabelText(/applies in/i);
    await submitAck(dialog);
    await waitFor(() => expect(api.acknowledgeFinding).toHaveBeenCalled());
    const options = api.acknowledgeFinding.mock.calls[0][2];
    expect(options.scope).toBeUndefined();
    expect(options.repository_id).toBe("dev-repo");
  });

  it("sends all_repositories, with no repository, and says what that means", async () => {
    decisions.list.mockResolvedValue({ items: [], total: 0 });
    renderPage();
    const dialog = await openAckDialog();
    fireEvent.change(await within(dialog).findByLabelText(/applies in/i), {
      target: { value: "all_repositories" },
    });
    expect(within(dialog).getByTestId("ack-scope-warning")).toHaveTextContent(
      /every repository/i,
    );
    await submitAck(dialog);
    await waitFor(() => expect(api.acknowledgeFinding).toHaveBeenCalled());
    const options = api.acknowledgeFinding.mock.calls[0][2];
    expect(options.scope).toBe("all_repositories");
    expect(options.repository_id).toBeUndefined();
  });
});
