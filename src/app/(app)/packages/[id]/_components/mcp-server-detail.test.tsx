// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api/fetch";
import { PINS, SERVER, entryOf, renderWithClient } from "@/components/mcp/test-utils";
import type { Package } from "@/types";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/packages/pkg-1",
  useSearchParams: () => nav.params,
}));
const auth = vi.hoisted(() => ({ user: { is_admin: true } as { is_admin: boolean } | null }));
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => auth }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const api = vi.hoisted(() => ({
  listVersions: vi.fn(),
  getVersion: vi.fn(),
  getStoredMetadata: vi.fn(),
  health: vi.fn(),
  capabilities: vi.fn(),
  bundle: vi.fn(),
  setVersionStatus: vi.fn(),
  probe: vi.fn(),
}));
vi.mock("@/lib/api/mcp", () => ({ mcpApi: api, mcpProblemMessage: () => "refused by registry" }));
const pkgApi = vi.hoisted(() => ({ getVersions: vi.fn() }));
vi.mock("@/lib/api/packages", () => ({ packagesApi: pkgApi }));
const repoApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/repositories", () => ({ repositoriesApi: repoApi }));

// H1-owned components: rendered as markers so these tests do not depend on them.
vi.mock("@/components/mcp/server-avatar", () => ({ McpServerAvatar: () => <span /> }));
vi.mock("@/components/mcp/transport-badges", () => ({ McpTransportBadges: () => <span>transports</span> }));
vi.mock("@/components/mcp/source-badge", () => ({ McpSourceBadge: ({ kind }: { kind: string }) => <span>source:{kind}</span> }));
vi.mock("@/components/mcp/risk-badges", () => ({
  McpRiskBadges: () => <span />,
  McpRiskLevelBadge: ({ level }: { level: string }) => <span>risk:{level}</span>,
}));
vi.mock("@/components/mcp/status-badge", () => ({ McpStatusBadge: ({ status }: { status: string }) => <span>status:{status}</span> }));
vi.mock("@/components/mcp/install-panel", () => ({
  McpInstallPanel: ({ onVersionChange }: { onVersionChange?: (v: string) => void }) => (
    <button type="button" onClick={() => onVersionChange?.("1.0.0")}>install-panel</button>
  ),
}));
vi.mock("@/components/mcp/env-vars-table", () => ({ McpInputsTable: ({ caption }: { caption: string }) => <p>inputs:{caption}</p> }));
vi.mock("@/components/mcp/runner-list", () => ({ McpRunnerList: () => <p>runner-list</p> }));
vi.mock("@/components/mcp/server-json-viewer", () => ({ McpServerJsonViewer: () => <p>raw-json</p> }));

import { McpServerDetail, mergeVersionRows } from "./mcp-server-detail";

const PKG: Package = {
  id: "pkg-1",
  repository_key: "mcp-local",
  name: SERVER.name,
  version: "1.4.2",
  format: "mcp",
  size_bytes: 0,
  download_count: 0,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};
const OLD = entryOf({ ...SERVER, version: "1.0.0" }, { isLatest: false, publishedAt: "2026-09-01T00:00:00Z" });
const LATEST = entryOf(SERVER);

function setUrl(q: string) {
  nav.params = new URLSearchParams(q);
}

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  setUrl("");
  auth.user = { is_admin: true };
  api.listVersions.mockResolvedValue([OLD, LATEST]);
  api.getStoredMetadata.mockResolvedValue({ artifactId: "a", metadata: { server: SERVER, registry: { status: "active" }, packages: PINS } });
  api.health.mockResolvedValue(null);
  api.capabilities.mockResolvedValue(null);
  api.bundle.mockResolvedValue(null);
  pkgApi.getVersions.mockResolvedValue([
    { version: "1.4.2", created_at: "2026-10-01T00:00:00Z" },
    { version: "2.0.0", created_at: "2026-11-01T00:00:00Z" },
  ]);
  repoApi.get.mockResolvedValue({ key: "mcp-local", format: "mcp", repo_type: "local" });
});

function renderDetail() {
  return renderWithClient(<McpServerDetail pkg={PKG} />);
}

describe("McpServerDetail", () => {
  it("renders the latest served version with its header", async () => {
    renderDetail();
    expect(await screen.findByText("weather")).toBeInTheDocument();
    expect(screen.getByText("com.acme /")).toBeInTheDocument();
    expect(screen.getByText("Acme Weather")).toBeInTheDocument();
    expect(screen.getByText("v1.4.2 (latest)")).toBeInTheDocument();
    expect(screen.getByText("status:active")).toBeInTheDocument();
    expect(screen.getAllByText("source:hosted").length).toBeGreaterThan(0);
    expect(screen.getByText("2 secrets")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /repository/ })).toHaveAttribute("href", "https://github.com/acme/weather");
    expect(screen.getByText("runner-list")).toBeInTheDocument();
    expect(screen.queryByTestId("mcp-held-panel")).toBeNull();
    expect(api.getVersion).not.toHaveBeenCalled();
    expect(api.getStoredMetadata).toHaveBeenCalledWith("mcp-local", SERVER.name, "1.4.2", "art-1.4.2");
  });

  it("jumps to the Install tab", async () => {
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "Install / Connect" }));
    expect(nav.replace).toHaveBeenCalledWith("/packages/pkg-1?tab=install", { scroll: false });
  });

  it("opens deep-linked tabs", async () => {
    setUrl("tab=install");
    renderDetail();
    fireEvent.click(await screen.findByRole("button", { name: "install-panel" }));
    expect(nav.replace).toHaveBeenCalledWith("/packages/pkg-1?tab=install&version=1.0.0", { scroll: false });
  });

  it("shows packages and remotes with their backing repositories", async () => {
    setUrl("tab=packages");
    renderDetail();
    expect(await screen.findByRole("link", { name: "npm-local" })).toHaveAttribute("href", "/repositories/npm-local?tab=artifacts");
    expect(screen.getByRole("link", { name: "docker-local" })).toBeInTheDocument();
    expect(screen.getByLabelText("Command for @acme/weather-mcp")).toHaveTextContent("npx @acme/weather-mcp@1.4.2 --units metric");
    expect(await screen.findByText("tag moved")).toBeInTheDocument();
    expect(screen.getByText("linux/amd64")).toBeInTheDocument();
    expect(screen.getByText(/Runs nothing locally/)).toBeInTheDocument();
    expect(screen.getByText("inputs:Headers for https://mcp.acme.dev/")).toBeInTheDocument();
  });

  it("lists configuration across runners", async () => {
    setUrl("tab=config");
    renderDetail();
    expect(await screen.findByText(/inputs:npm @acme\/weather-mcp/)).toBeInTheDocument();
    expect(screen.getByText(/inputs:remote streamable-http/)).toBeInTheDocument();
  });

  it("merges catalog versions so held ones appear and can be selected", async () => {
    setUrl("tab=versions");
    renderDetail();
    expect(await screen.findByRole("button", { name: "2.0.0" })).toBeInTheDocument();
    expect(screen.getByText("not visible to clients")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1.4.2" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "2.0.0" }));
    expect(nav.replace).toHaveBeenCalledWith("/packages/pkg-1?tab=versions&version=2.0.0", { scroll: false });
  });

  it("explains a held version and still shows stored metadata", async () => {
    setUrl("version=2.0.0&tab=versions");
    api.getVersion.mockResolvedValue({ kind: "held", problem: { status: 404, hold: "quarantine", error: "mcp_pending_review" } });
    api.getStoredMetadata.mockResolvedValue({
      artifactId: "a2",
      metadata: { server: { ...SERVER, version: "2.0.0" }, registry: { status: "active" }, packages: PINS },
    });
    renderDetail();
    expect(await screen.findByTestId("mcp-held-reason")).toHaveTextContent("Pending review");
    expect(screen.getByText("status:held")).toBeInTheDocument();
    expect(screen.getByText("held")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install / Connect" })).toBeNull();
    expect(api.getVersion).toHaveBeenCalledWith("mcp-local", SERVER.name, "2.0.0");
    expect(api.getStoredMetadata).toHaveBeenCalledWith("mcp-local", SERVER.name, "2.0.0", undefined);
  });

  it("stays neutral when the version is hidden and nothing is readable", async () => {
    setUrl("version=9.9.9&tab=install");
    api.getVersion.mockResolvedValue({ kind: "hidden" });
    api.getStoredMetadata.mockResolvedValue(null);
    renderDetail();
    expect(await screen.findByText(/Only a holder of this repository can see why/)).toBeInTheDocument();
    expect(await screen.findByText("No metadata readable for this version")).toBeInTheDocument();
  });

  it("hides admin actions from non-admins", async () => {
    auth.user = { is_admin: false };
    renderDetail();
    await screen.findByText("weather");
    expect(screen.queryByRole("button", { name: "Admin actions" })).toBeNull();
    expect(repoApi.get).not.toHaveBeenCalled();
  });

  it("deprecates a version with a reason", async () => {
    api.setVersionStatus.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "Admin actions" }));
    expect(screen.queryByRole("menuitem", { name: "Open in curation queue" })).toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "Deprecate" }));
    const dialog = screen.getByRole("dialog");
    const box = within(dialog).getByLabelText(/Reason/);
    expect(box).toHaveAttribute("maxLength", "500");
    await user.type(box, "use 2.x");
    expect(within(dialog).getByText("7/500")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Deprecate" }));
    await waitFor(() =>
      expect(api.setVersionStatus).toHaveBeenCalledWith("mcp-local", SERVER.name, "1.4.2", "deprecated", "use 2.x"),
    );
    expect(toast.success).toHaveBeenCalledWith("Version deprecated");
  });

  it("marks active without a message and reports refusals", async () => {
    api.listVersions.mockResolvedValue([entryOf(SERVER, { status: "deprecated" })]);
    api.setVersionStatus.mockRejectedValue(new ApiError(422, "{}"));
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "Admin actions" }));
    expect(screen.queryByRole("menuitem", { name: "Deprecate" })).toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "Mark active" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText(/Reason/)).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Mark active" }));
    await waitFor(() => expect(api.setVersionStatus).toHaveBeenCalledWith("mcp-local", SERVER.name, "1.4.2", "active", undefined));
    expect(toast.error).toHaveBeenCalledWith("refused by registry");
  });

  it("offers the curation queue on a Remote and re-probe when available", async () => {
    repoApi.get.mockResolvedValue({ key: "mcp-local", format: "mcp", repo_type: "remote" });
    api.capabilities.mockResolvedValue({ probe_available: true, snapshots: [] });
    api.probe.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => expect(repoApi.get).toHaveBeenCalled());
    await user.click(await screen.findByRole("button", { name: "Admin actions" }));
    expect(await screen.findByRole("menuitem", { name: "Open in curation queue" })).toHaveAttribute("href", "/curation?repo=mcp-local");
    await user.click(screen.getByRole("menuitem", { name: "Re-probe tools" }));
    await waitFor(() => expect(api.probe).toHaveBeenCalledWith("mcp-local", SERVER.name, "1.4.2"));
  });

  it("orders merged version rows newest first", () => {
    const rows = mergeVersionRows([LATEST], [{ version: "0.1.0", created_at: "2020-01-01T00:00:00Z" }]);
    expect(rows.map((r) => [r.version, r.served])).toEqual([
      ["1.4.2", true],
      ["0.1.0", false],
    ]);
  });
});
