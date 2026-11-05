// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api/fetch";
import { PINS, SERVER, capsOf, entryOf, renderWithClient } from "@/components/mcp/test-utils";
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
  setVersionStatus: vi.fn(),
  deleteVersion: vi.fn(),
  probe: vi.fn(),
}));
vi.mock("@/lib/api/mcp", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api/mcp")>();
  return { mcpApi: api, mcpProblemMessage: () => "refused by registry", mcpWriteRefusal: real.mcpWriteRefusal };
});
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
    // No served entry and no origin on the package row: no source badge.
    expect(screen.queryByText(/^source:/)).toBeNull();
    expect(screen.getByText("held")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install / Connect" })).toBeNull();
    expect(api.getVersion).toHaveBeenCalledWith("mcp-local", SERVER.name, "2.0.0");
    expect(api.getStoredMetadata).toHaveBeenCalledWith("mcp-local", SERVER.name, "2.0.0", undefined);
  });

  it("labels a held version's source from the package row's origin, never as verified", async () => {
    setUrl("version=2.0.0&tab=versions");
    api.getVersion.mockResolvedValue({ kind: "held", problem: { status: 404, hold: "curation", error: "mcp_pending_review" } });
    renderWithClient(<McpServerDetail pkg={{ ...PKG, metadata: { origin: "mirror" } }} />);
    expect(await screen.findByText("source:mirror")).toBeInTheDocument();
  });

  it("shows the stored bundle of an MCPB package", async () => {
    setUrl("tab=packages");
    const url = "https://ak.example/mcp/mcp-local/bundles/weather-1.4.2.mcpb";
    const mcpb = {
      ...SERVER,
      packages: [{ registryType: "mcpb", identifier: url, fileSha256: "abc123", transport: { type: "stdio" } }],
      remotes: [],
    };
    api.listVersions.mockResolvedValue([entryOf(mcpb)]);
    api.getStoredMetadata.mockResolvedValue({
      artifactId: "a",
      metadata: {
        server: mcpb,
        registry: { status: "active" },
        packages: [],
        bundles: [{ index: 0, file: "weather-1.4.2.mcpb", fileSha256: "abc123", signature: { state: "valid", signer: "Acme" } }],
      },
    });
    renderDetail();
    expect(await screen.findByText("signed, trusted signer")).toBeInTheDocument();
    expect(screen.getByText("weather-1.4.2.mcpb")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Download bundle/ })).toHaveAttribute("href", url);
  });

  it("stays neutral when the version is hidden and nothing is readable", async () => {
    setUrl("version=9.9.9&tab=install");
    api.getVersion.mockResolvedValue({ kind: "hidden" });
    api.getStoredMetadata.mockResolvedValue(null);
    renderDetail();
    expect(await screen.findByText(/Only a holder of this repository can see why/)).toBeInTheDocument();
    expect(await screen.findByText("No metadata readable for this version")).toBeInTheDocument();
  });

  it("hides version actions from an anonymous caller", async () => {
    auth.user = null;
    renderDetail();
    await screen.findByText("weather");
    expect(screen.queryByRole("button", { name: "Version actions" })).toBeNull();
  });

  // Soft delete and status changes need only repository write, not
  // repository administration (artifact-keeper#5257 docs/mcp-registry.md):
  // `mcp_caller_is_repo_admin` must not gate them.
  it("lets a signed-in writer who is no repository admin delete a version through the soft-delete route", async () => {
    auth.user = { is_admin: false };
    repoApi.get.mockResolvedValue({ key: "mcp-local", format: "mcp", repo_type: "local", mcp_caller_is_repo_admin: false });
    api.capabilities.mockResolvedValue(
      capsOf(null, [], { introspection: { remoteProbe: "all", probeEnabled: true, sandbox: "off", sandboxEnabled: false } }),
    );
    api.deleteVersion.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => expect(api.capabilities).toHaveBeenCalled());
    await user.click(await screen.findByRole("button", { name: "Version actions" }));
    // Administration items stay with repository admins.
    expect(screen.queryByRole("menuitem", { name: "Open in curation queue" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Re-probe tools" })).toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "Delete version" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Reason/), "superseded");
    await user.click(within(dialog).getByRole("button", { name: "Delete version" }));
    await waitFor(() =>
      expect(api.deleteVersion).toHaveBeenCalledWith("mcp-local", SERVER.name, "1.4.2", "superseded"),
    );
    expect(api.setVersionStatus).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Version deleted");
  });

  // A Remote or Virtual registry refuses every version write with
  // `405 mcp_read_only` (docs/mcp-registry.md "Write path"), whoever asks.
  it.each(["remote", "virtual"])("offers a writer on a %s MCP repository no version writes", async (repoType) => {
    auth.user = { is_admin: false };
    repoApi.get.mockResolvedValue({ key: "mcp-local", format: "mcp", repo_type: repoType, mcp_caller_is_repo_admin: false });
    renderDetail();
    await screen.findByText("weather");
    await waitFor(() => expect(repoApi.get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("button", { name: "Version actions" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Deprecate" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Delete version" })).toBeNull();
  });

  it("keeps the curation link but no version writes for a repository admin of a Remote", async () => {
    auth.user = { is_admin: false };
    repoApi.get.mockResolvedValue({ key: "mcp-remote", format: "mcp", repo_type: "remote", mcp_caller_is_repo_admin: true });
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "Version actions" }));
    expect(await screen.findByRole("menuitem", { name: "Open in curation queue" })).toBeInTheDocument();
    for (const item of ["Deprecate", "Mark active", "Delete version"]) {
      expect(screen.queryByRole("menuitem", { name: item })).toBeNull();
    }
  });

  it("offers no version writes on a Virtual even to an instance admin", async () => {
    repoApi.get.mockResolvedValue({ key: "mcp-virtual", format: "mcp", repo_type: "virtual" });
    renderDetail();
    await waitFor(() => expect(repoApi.get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    await screen.findByText("weather");
    expect(screen.queryByRole("button", { name: "Version actions" })).toBeNull();
  });

  it("holds version writes back until the repository type is known", async () => {
    auth.user = { is_admin: false };
    repoApi.get.mockReturnValue(new Promise(() => {}));
    renderDetail();
    await screen.findByText("weather");
    expect(screen.queryByRole("button", { name: "Version actions" })).toBeNull();
  });

  it("still offers version writes when the repository cannot be read", async () => {
    auth.user = { is_admin: false };
    repoApi.get.mockRejectedValue(new ApiError(500, "{}"));
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "Version actions" }));
    expect(screen.getByRole("menuitem", { name: "Delete version" })).toBeInTheDocument();
  });

  it("explains a 403 mcp_namespace_not_granted on delete", async () => {
    auth.user = { is_admin: false };
    api.deleteVersion.mockRejectedValue(
      new ApiError(
        403,
        JSON.stringify({
          status: 403,
          error: "mcp_namespace_not_granted",
          detail: "this credential holds no grant for namespace 'io.github.acme' in this repository",
        }),
      ),
    );
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "Version actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete version" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete version" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const msg = String(toast.error.mock.calls[0][0]);
    expect(msg).toMatch(/requires a namespace grant/);
    expect(msg).toContain("no grant for namespace 'io.github.acme'");
  });

  it("says write access is missing on another 403", async () => {
    auth.user = { is_admin: false };
    api.setVersionStatus.mockRejectedValue(new ApiError(403, JSON.stringify({ status: 403, error: "mcp_forbidden" })));
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "Version actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Deprecate" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Deprecate" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("You need write access to this repository to change or delete a version."),
    );
  });

  it("shows admin actions to a repository admin who is not an instance admin", async () => {
    auth.user = { is_admin: false };
    repoApi.get.mockResolvedValue({ key: "mcp-local", format: "mcp", repo_type: "local", mcp_caller_is_repo_admin: true });
    renderDetail();
    expect(await screen.findByRole("button", { name: "Version actions" })).toBeInTheDocument();
  });

  it("deprecates a version with a reason", async () => {
    api.setVersionStatus.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "Version actions" }));
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
    await user.click(await screen.findByRole("button", { name: "Version actions" }));
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
    api.capabilities.mockResolvedValue(
      capsOf(null, [], { introspection: { remoteProbe: "all", probeEnabled: true, sandbox: "off", sandboxEnabled: false } }),
    );
    api.probe.mockResolvedValue({ queued: ["job-1"] });
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => expect(repoApi.get).toHaveBeenCalled());
    await user.click(await screen.findByRole("button", { name: "Version actions" }));
    expect(await screen.findByRole("menuitem", { name: "Open in curation queue" })).toHaveAttribute("href", "/curation?repo=mcp-local");
    await user.click(screen.getByRole("menuitem", { name: "Re-probe tools" }));
    await waitFor(() => expect(api.probe).toHaveBeenCalledWith("mcp-local", SERVER.name, "1.4.2"));
  });

  it("offers no re-probe when the repository allows no introspection", async () => {
    repoApi.get.mockResolvedValue({ key: "mcp-local", format: "mcp", repo_type: "remote" });
    api.capabilities.mockResolvedValue(capsOf(null, []));
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => expect(api.capabilities).toHaveBeenCalled());
    await user.click(await screen.findByRole("button", { name: "Version actions" }));
    expect(await screen.findByRole("menuitem", { name: "Open in curation queue" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Re-probe tools" })).toBeNull();
  });

  it("orders merged version rows newest first", () => {
    const rows = mergeVersionRows([LATEST], [{ version: "0.1.0", created_at: "2020-01-01T00:00:00Z" }]);
    expect(rows.map((r) => [r.version, r.served])).toEqual([
      ["1.4.2", true],
      ["0.1.0", false],
    ]);
  });
});
