// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithClient } from "./test-utils";

const api = vi.hoisted(() => ({ capabilities: vi.fn(), probe: vi.fn() }));
vi.mock("@/lib/api/mcp", () => ({ mcpApi: api, mcpProblemMessage: () => "refused" }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const auth = vi.hoisted(() => ({ user: { is_admin: true } as { is_admin: boolean } | null }));
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => auth }));

import { McpToolsTab, provenanceOf, relativeTime } from "./tools-tab";

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { is_admin: true };
});

const SNAP = {
  source: "remote_probe",
  signature_state: "verified" as const,
  protocol_version: "2026-07-28",
  observed_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  auth_state: "auth_required",
  tools: [
    {
      name: "get_forecast",
      description: "Forecast for a lat/lon",
      inputSchema: { type: "object" },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    { name: "set_home", description: "Persists a location", annotations: { destructiveHint: true } },
  ],
  resources: [{ name: "alerts", uri: "weather://alerts" }],
  prompts: [],
  findings: [
    { rule: "param_flag", message: "flag in parameter", pointer: "/tools/1/inputSchema" },
    { rule: "general", message: "server-wide note" },
  ],
};

function renderTab() {
  return renderWithClient(<McpToolsTab repoKey="k" name="a/b" version="1" />);
}

describe("McpToolsTab", () => {
  it("shows provenance, signature, time, protocol and the auth banner", async () => {
    api.capabilities.mockResolvedValue({ probe_available: false, snapshots: [SNAP] });
    renderTab();
    expect(await screen.findByText("observed (remote)")).toBeInTheDocument();
    expect(screen.getByText("signature verified")).toBeInTheDocument();
    expect(screen.getByText("2h ago")).toBeInTheDocument();
    expect(screen.getByText("protocol 2026-07-28")).toBeInTheDocument();
    expect(screen.getByText(/Unauthenticated view: signed-in users may see different tools/)).toBeInTheDocument();
    expect(screen.getByText(/asserted by the server and are untrusted/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tools (2)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Resources (1)" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^destructive: Server-asserted/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^read-only/)).toBeInTheDocument();
    const setHome = document.querySelector('[data-tool="set_home"]') as HTMLElement;
    expect(within(setHome).getByText(/flag in parameter/)).toBeInTheDocument();
    expect(screen.getByText(/server-wide note/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Re-probe/ })).toBeNull();
  });

  it("expands the input schema", async () => {
    api.capabilities.mockResolvedValue({ snapshots: [SNAP] });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "inputSchema" }));
    expect(screen.getByLabelText("get_forecast input schema")).toHaveTextContent('"type": "object"');
    expect(screen.getByRole("button", { name: "Copy JSON" })).toBeInTheDocument();
  });

  it("switches between snapshot sources", async () => {
    api.capabilities.mockResolvedValue({
      snapshots: [SNAP, { source: "publisher_declared", signature_state: "invalid", tools: [{ name: "declared_tool" }] }],
    });
    renderTab();
    const group = await screen.findByRole("group", { name: "Snapshot source" });
    fireEvent.click(within(group).getByRole("button", { name: "declared" }));
    expect(await screen.findByText("declared_tool")).toBeInTheDocument();
    expect(screen.getByText("signature invalid")).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "declared" })).toHaveAttribute("aria-pressed", "true");
  });

  it("is hidden on a server without capabilities", async () => {
    api.capabilities.mockResolvedValue(null);
    renderTab();
    expect(await screen.findByText("Capabilities are not available on this server")).toBeInTheDocument();
  });

  it("explains how to declare tools and lets an admin probe", async () => {
    api.capabilities.mockResolvedValue({ probe_available: true, snapshots: [] });
    api.probe.mockResolvedValue(undefined);
    renderTab();
    expect(await screen.findByText("Capabilities not declared or observed")).toBeInTheDocument();
    expect(screen.getByText(/com.artifactkeeper\/capabilities/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Re-probe/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Probe queued"));
    expect(api.probe).toHaveBeenCalledWith("k", "a/b", "1");
  });

  it("reports a refused probe", async () => {
    api.capabilities.mockResolvedValue({ probe_available: true, snapshots: [SNAP] });
    api.probe.mockRejectedValue(new Error("no"));
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /Re-probe/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("refused"));
  });

  it("hides the probe from non-admins", async () => {
    auth.user = { is_admin: false };
    api.capabilities.mockResolvedValue({ probe_available: true, snapshots: [] });
    renderTab();
    await screen.findByText("Capabilities not declared or observed");
    expect(screen.queryByRole("button", { name: /Re-probe/ })).toBeNull();
  });

  it("explains a server that needs configuration", async () => {
    api.capabilities.mockResolvedValue({ snapshots: [{ source: "sandbox_run", outcome: "needs_config" }] });
    renderTab();
    expect(await screen.findByText("Server could not be started without configuration")).toBeInTheDocument();
  });

  it("labels every provenance", () => {
    expect(provenanceOf("ci_reported")).toEqual({ label: "CI-reported", color: "blue" });
    expect(provenanceOf("gateway_reported").label).toBe("gateway-reported");
    expect(provenanceOf("sandbox_run")).toEqual({ label: "observed (sandbox)", color: "green" });
    expect(provenanceOf("publisher_declared").color).toBe("default");
    expect(provenanceOf("future").label).toBe("future");
  });

  it("formats relative times", () => {
    const now = Date.parse("2026-11-03T12:00:00Z");
    expect(relativeTime("2026-11-03T11:59:30Z", now)).toBe("just now");
    expect(relativeTime("2026-11-03T11:30:00Z", now)).toBe("30m ago");
    expect(relativeTime("2026-10-30T12:00:00Z", now)).toBe("4d ago");
    expect(relativeTime("garbage", now)).toBe("garbage");
  });
});
