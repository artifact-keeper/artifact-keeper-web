// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { screen, cleanup } from "@testing-library/react";
import { PINS, SERVER, capsOf, healthOf, renderWithClient, snapshot } from "./test-utils";

const api = vi.hoisted(() => ({ health: vi.fn(), capabilities: vi.fn() }));
vi.mock("@/lib/api/mcp", () => ({ mcpApi: api }));
vi.mock("@/components/mcp/risk-badges", () => ({
  McpRiskLevelBadge: ({ level }: { level: string }) => <span data-testid="level">{level}</span>,
}));

import { McpSecurityTab } from "./security-tab";

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  api.capabilities.mockResolvedValue(null);
});

function renderTab(props: Partial<Parameters<typeof McpSecurityTab>[0]> = {}) {
  return renderWithClient(
    <McpSecurityTab repoKey="mcp-local" name={SERVER.name} version={SERVER.version} server={SERVER} pins={PINS} policy="own-repos" status="active" source="hosted" {...props} />,
  );
}

describe("McpSecurityTab", () => {
  it("lists every risk signal with its reason and per-package scans", async () => {
    api.health.mockResolvedValue(
      healthOf([{ package: "npm:@acme/weather-mcp@1.4.2", score: 61, grade: "C", high: 2, gate: "scan_policy", status: "critical" }], {
        status: "critical",
      }),
    );
    renderTab();
    expect(await screen.findByText("Scan: grade C (61)")).toBeInTheDocument();
    expect(api.health).toHaveBeenCalledWith("mcp-local", "com.acme/weather", "1.4.2");
    expect(screen.getByTestId("severity-badge")).toHaveTextContent("high");
    expect(screen.getByText("held: scan_policy")).toBeInTheDocument();
    expect(document.querySelector('[data-signal="runs_locally"]')).toHaveTextContent(/runs on the user's machine/);
    expect(document.querySelector('[data-signal="tag_moved"]')).toBeInTheDocument();
    expect(document.querySelector('[data-signal="cve_high"]')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See docker-local security" })).toHaveAttribute("href", "/repositories/docker-local?tab=security");
  });

  it("reads every scan state and count of a package row", async () => {
    api.health.mockResolvedValue(
      healthOf([
        { scanned: false, score: null, grade: null, gate: "unavailable", status: "unknown" },
        { package: "oci:acme/weather:1.4.2", grade: null, critical: 1, medium: 2, low: 3, info: 9 },
      ]),
    );
    renderTab();
    expect(await screen.findByText("Scan: not scanned yet")).toBeInTheDocument();
    expect(screen.getByText("gate unavailable")).toBeInTheDocument();
    expect(screen.getByText("Scan: scanned")).toBeInTheDocument();
    expect(screen.getAllByTestId("severity-badge").map((b) => b.textContent?.toLowerCase())).toEqual([
      "critical",
      "medium",
      "low",
    ]);
    expect(document.querySelector('[data-signal="cve_critical"]')).toBeInTheDocument();
  });

  it("raises the capability signals from the current snapshot", async () => {
    api.health.mockResolvedValue(healthOf([{}, { index: 1 }]));
    api.capabilities.mockResolvedValue(
      capsOf(snapshot({ authState: "caller_specific", tools: [{ name: "rm", annotations: { destructiveHint: true } }] })),
    );
    renderTab();
    expect(await screen.findByText(/destructive tools/)).toBeInTheDocument();
    expect(document.querySelector('[data-signal="not_observable"]')).toBeInTheDocument();
    expect(api.capabilities).toHaveBeenCalledWith("mcp-local", "com.acme/weather", "1.4.2");
  });

  it("says when a pinned package has no health row yet", async () => {
    api.health.mockResolvedValue(healthOf([{}]));
    renderTab();
    expect(await screen.findByText(/No scan result yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See docker-local security" })).toBeInTheDocument();
  });

  it("lists open lint findings by action and counts acknowledged ones", async () => {
    api.health.mockResolvedValue(
      healthOf([], {
        lint: {
          ran: true,
          scanId: "scan-1",
          lintedAt: "2026-11-01T00:00:00Z",
          block: 1,
          review: 1,
          warn: 1,
          findings: [
            { id: "f1", rule: "secret_in_args", action: "block", source: "server_json", path: "/packages/0/packageArguments/0", message: "A secret value is inlined" },
            { id: "f2", rule: "injection_phrase", action: "review", source: "capabilities:remote_probe", message: "ignore previous instructions" },
            { id: "f3", rule: "unicode_tag", action: "warn", acknowledged: true },
          ],
        },
      }),
    );
    renderTab();
    expect(await screen.findByText("block: secret_in_args")).toHaveClass("text-red-600");
    expect(screen.getByText("/packages/0/packageArguments/0")).toBeInTheDocument();
    expect(screen.getByText("A secret value is inlined")).toBeInTheDocument();
    expect(screen.getByText("review: injection_phrase")).toHaveClass("text-amber-700");
    expect(document.querySelector('[data-rule="unicode_tag"]')).toBeNull();
  });

  it("says when every lint finding is acknowledged, or none ran", async () => {
    api.health.mockResolvedValue(
      healthOf([], {
        lint: { ran: true, block: 0, review: 0, warn: 1, findings: [{ id: "f3", rule: "r", action: "warn", acknowledged: true }] },
      }),
    );
    const { unmount } = renderTab();
    expect(await screen.findByText(/No open lint findings \(1 acknowledged\)\./)).toBeInTheDocument();
    unmount();
    api.health.mockResolvedValue(healthOf([], { lint: { ran: false, block: 0, review: 0, warn: 0, findings: [] } }));
    renderTab();
    expect(await screen.findByText("This version has not been linted.")).toBeInTheDocument();
  });

  it("falls back to the backing repository's Security tab without health", async () => {
    api.health.mockResolvedValue(null);
    renderTab();
    expect(await screen.findByRole("link", { name: "See npm-local security" })).toHaveAttribute("href", "/repositories/npm-local?tab=security");
    expect(screen.getAllByText(/Scan roll-up is not available on this server/)).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "Lint" })).toBeNull();
  });

  it("warns about the open policy", async () => {
    api.health.mockResolvedValue(null);
    renderTab({ policy: "open" });
    expect(await screen.findByText("Open catalog")).toBeInTheDocument();
    expect(screen.getByText(/No package of this version is pinned/)).toBeInTheDocument();
    expect(document.querySelector('[data-signal="open_policy"]')).toBeInTheDocument();
  });

  it("says when no signal applies", async () => {
    api.health.mockReturnValue(new Promise(() => {}));
    renderTab({ server: { name: "a/b", version: "1", description: "" }, pins: [] });
    expect(screen.getByText(/No risk signals apply/)).toBeInTheDocument();
  });

  it("shows loading while the roll-up is in flight", () => {
    api.health.mockReturnValue(new Promise(() => {}));
    renderTab();
    expect(screen.getAllByText(/Loading scan state/)).toHaveLength(2);
  });
});
