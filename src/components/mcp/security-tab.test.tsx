// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { screen, cleanup } from "@testing-library/react";
import { PINS, SERVER, renderWithClient } from "./test-utils";

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
    api.health.mockResolvedValue({
      state: "warning",
      packages: [{ package: "npm:@acme/weather-mcp@1.4.2", scan_state: "completed", max_severity: "high", high: 2, gate: "scan_policy" }],
    });
    renderTab();
    expect(await screen.findByText("2 high")).toBeInTheDocument();
    expect(screen.getByTestId("severity-badge")).toHaveTextContent("high");
    expect(screen.getByText("held: scan_policy")).toBeInTheDocument();
    expect(document.querySelector('[data-signal="runs_locally"]')).toHaveTextContent(/runs on the user's machine/);
    expect(document.querySelector('[data-signal="tag_moved"]')).toBeInTheDocument();
    expect(document.querySelector('[data-signal="cve_high"]')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See docker-local security" })).toHaveAttribute("href", "/repositories/docker-local?tab=security");
  });

  it("falls back to the backing repository's Security tab without health", async () => {
    api.health.mockResolvedValue(null);
    renderTab();
    expect(await screen.findByRole("link", { name: "See npm-local security" })).toHaveAttribute("href", "/repositories/npm-local?tab=security");
    expect(screen.getAllByText(/Scan roll-up is not available on this server/)).toHaveLength(2);
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
