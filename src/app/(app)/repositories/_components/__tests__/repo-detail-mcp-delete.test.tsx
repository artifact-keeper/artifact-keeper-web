// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// No generic artifact delete on an MCP repository (artifact-keeper#5253).
//
// The backend refuses `DELETE /api/v1/repositories/{key}/artifacts/{path}`
// with 400 on every `mcp` repository, administrators included
// (artifact-keeper#5257): a server version is soft-deleted through the
// registry (`DELETE /mcp/{repo}/v0.1/servers/{name}/versions/{version}`),
// which the server page's "Delete version" action does. So the artifact row
// and the artifact detail dialog must not offer the generic Delete there, and
// instead send the user to the server in the Servers tab.
// ---------------------------------------------------------------------------

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

// `?tab=artifacts` pins the artifact browser: package-oriented formats
// (pypi, cargo, …) default to the Packages tab, which does not mount the
// artifacts table at all.
const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
  useSearchParams: () => new URLSearchParams("tab=artifacts"),
}));

// Mutable per-test state driving the react-query mock.
const repository: Record<string, unknown> = {
  id: "11111111-1111-1111-1111-111111111111",
  key: "mcp-local",
  name: "MCP local",
  format: "mcp",
  format_key: null,
  repo_type: "local",
  storage_backend: "filesystem",
  versioning_enabled: false,
};

// One server version is one artifact at servers/<name>/<version>/server.json.
const MCP_ROW: Record<string, unknown> = {
  id: "22222222-2222-2222-2222-222222222222",
  repository_key: "mcp-local",
  path: "servers/com.acme/echo/1.0.0/server.json",
  name: "server.json",
  size_bytes: 512,
  checksum_sha256: "c".repeat(64),
  content_type: "application/json",
  download_count: 0,
  created_at: "2026-07-01T00:00:00Z",
  analyzable: false,
  uploaded_by: null,
};

let artifactRow: Record<string, unknown> = { ...MCP_ROW };

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => {
    const key = Array.isArray(opts.queryKey) ? opts.queryKey[0] : undefined;
    if (key === "repository") {
      return { data: repository, isLoading: false, isFetching: false };
    }
    if (key === "artifacts") {
      return {
        data: {
          items: [artifactRow],
          pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
        },
        isLoading: false,
        isFetching: false,
      };
    }
    return { data: undefined, isLoading: false, isFetching: false };
  },
  // Runs the real mutationFn, so a generic delete reaching the API shows up
  // on `artifactsApi.delete`.
  useMutation: (opts: { mutationFn?: (v: unknown) => Promise<unknown> }) => ({
    mutate: (v: unknown) => {
      opts.mutationFn?.(v)?.catch?.(() => {});
    },
    isPending: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ isAuthenticated: true, user: { is_admin: true } }),
}));
vi.mock("@/providers/system-config-provider", () => ({
  useSystemConfig: () => ({ config: { max_upload_size_bytes: 1_000_000 } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/api/repositories", () => ({ repositoriesApi: { get: vi.fn() } }));
vi.mock("@/lib/api/artifacts", () => ({
  artifactsApi: {
    listGrouped: vi.fn(),
    getAbsoluteDownloadUrl: () => "http://localhost/download",
    getDownloadUrl: () => "/download",
    createDownloadTicket: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    invalidateCache: vi.fn(),
    upload: vi.fn(),
  },
}));
vi.mock("@/lib/api/security", () => ({
  securityApi: { getRepoSecurity: vi.fn(), triggerScan: vi.fn(), updateRepoSecurity: vi.fn() },
}));
vi.mock("@/lib/api/quarantine", () => ({
  quarantineApi: { getStatus: vi.fn(), release: vi.fn(), reject: vi.fn(), quarantine: vi.fn() },
}));

// Heavy / out-of-scope children stubbed out.
vi.mock("../artifact-versions-section", () => ({ ArtifactVersionsSection: () => <div /> }));
vi.mock("../sbom-tab-content", () => ({ SbomTabContent: () => <div /> }));
vi.mock("../security-tab-content", () => ({ SecurityTabContent: () => <div /> }));
vi.mock("../package-analysis-tab-content", () => ({ PackageAnalysisTabContent: () => <div /> }));
vi.mock("../health-tab-content", () => ({ HealthTabContent: () => <div /> }));
vi.mock("../notifications-tab-content", () => ({ NotificationsTabContent: () => <div /> }));
vi.mock("../virtual-members-panel", () => ({ VirtualMembersPanel: () => <div /> }));
vi.mock("../packages-tab-content", () => ({ PackagesTabContent: () => <div /> }));
vi.mock("../repo-settings-tab", () => ({ RepoSettingsTab: () => <div /> }));
vi.mock("../repo-labels-panel", () => ({ RepoLabelsPanel: () => <div /> }));
vi.mock("../repo-storage-panel", () => ({ RepoStoragePanel: () => <div /> }));
vi.mock("../repo-folder-storage-panel", () => ({ RepoFolderStoragePanel: () => <div /> }));
vi.mock("../pypi-tracks-panel", () => ({ PypiTracksPanel: () => <div /> }));
vi.mock("../maven-component-list", () => ({ MavenComponentList: () => <div /> }));
vi.mock("../docker-tag-list", () => ({ DockerTagList: () => <div /> }));
vi.mock("../artifact-folder-tree", () => ({ ArtifactFolderTree: () => <div /> }));
vi.mock("../artifact-browser-toggle", () => ({
  ArtifactBrowserToggle: () => <div />,
  supportsGrouping: () => false,
  supportsTree: () => false,
  DOCKER_FAMILY_FORMATS: new Set(["docker", "podman", "buildx", "oras", "helm_oci", "wasm_oci"]),
}));
// Renders the real `actions` column cell (the thing under test) plus a row
// button so the artifact detail dialog can be opened.
vi.mock("@/components/common/data-table", () => ({
  DataTable: ({
    data,
    columns,
    onRowClick,
  }: {
    data?: Array<{ id: string; name: string }>;
    columns?: Array<{ id: string; cell?: (row: unknown) => React.ReactNode }>;
    onRowClick?: (row: unknown) => void;
  }) => (
    <div>
      {(data ?? []).map((row) => (
        <div key={row.id}>
          <button data-testid={`stub-row-${row.id}`} onClick={() => onRowClick?.(row)}>
            {row.name}
          </button>
          <div data-testid="actions-cell">
            {columns?.find((c) => c.id === "actions")?.cell?.(row)}
          </div>
        </div>
      ))}
    </div>
  ),
}));
vi.mock("@/components/common/file-upload", () => ({ FileUpload: () => <div /> }));
vi.mock("@/components/common/copy-button", () => ({ CopyButton: () => <div /> }));

import { RepoDetailContent } from "../repo-detail-content";
import { artifactsApi } from "@/lib/api/artifacts";
import { MCP_GENERIC_DELETE_REASON, MCP_SOFT_DELETE_ROUTE } from "@/lib/mcp/format";

const MCP_ROW_ACTION = /delete through the mcp registry/i;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  repository.key = "mcp-local";
  repository.format = "mcp";
  repository.repo_type = "local";
  artifactRow = { ...MCP_ROW };
});
afterEach(() => cleanup());

function lastReplace(): URLSearchParams {
  const calls = routerReplace.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const href = String(calls[calls.length - 1][0]);
  return new URLSearchParams(href.replace(/^\?/, ""));
}

describe("MCP repository: no generic artifact delete (#5253)", () => {
  it("names the registry's soft delete route in the reason", () => {
    expect(MCP_GENERIC_DELETE_REASON).toContain(MCP_SOFT_DELETE_ROUTE);
    expect(MCP_SOFT_DELETE_ROUTE).toBe(
      "DELETE /mcp/{repository}/v0.1/servers/{serverName}/versions/{version}",
    );
  });

  it("row action opens the server in the Servers tab and never calls the generic delete", async () => {
    render(<RepoDetailContent repoKey="mcp-local" />);
    const cell = screen.getByTestId("actions-cell");

    // Every button the row offers: none may reach the generic delete.
    for (const b of within(cell).getAllByRole("button")) {
      if (MCP_ROW_ACTION.test(b.getAttribute("aria-label") ?? "")) continue;
      fireEvent.click(b);
    }
    cleanup();
    render(<RepoDetailContent repoKey="mcp-local" />);
    await userEvent.click(
      within(screen.getByTestId("actions-cell")).getByRole("button", { name: MCP_ROW_ACTION }),
    );

    expect(artifactsApi.delete).not.toHaveBeenCalled();
    const params = lastReplace();
    expect(params.get("tab")).toBe("packages");
    expect(params.get("server")).toBe("com.acme/echo");
  });

  it("detail dialog offers no generic Delete, only the way to the MCP soft delete", async () => {
    render(<RepoDetailContent repoKey="mcp-local" />);
    await userEvent.click(screen.getByTestId(`stub-row-${MCP_ROW.id}`));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
    const go = within(dialog).getByRole("button", { name: /delete in the mcp registry/i });
    expect(go).toHaveAttribute("title", MCP_GENERIC_DELETE_REASON);

    await userEvent.click(go);

    expect(artifactsApi.delete).not.toHaveBeenCalled();
    expect(lastReplace().get("server")).toBe("com.acme/echo");
  });

  // A Remote or Virtual MCP registry refuses version writes with
  // `405 mcp_read_only`; the server page offers no Delete there, so the
  // repository page must not send the caller to it (#1088).
  it.each(["remote", "virtual"])("offers no delete on a %s MCP repository", async (repoType) => {
    repository.repo_type = repoType;
    render(<RepoDetailContent repoKey="mcp-local" />);
    expect(
      within(screen.getByTestId("actions-cell")).queryByRole("button", { name: MCP_ROW_ACTION }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId(`stub-row-${MCP_ROW.id}`));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: /delete in the mcp registry/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
  });

  it("keeps the generic Delete on other formats", async () => {
    repository.key = "gen";
    repository.format = "generic";
    artifactRow = { ...MCP_ROW, repository_key: "gen", path: "a/b.bin", name: "b.bin" };
    render(<RepoDetailContent repoKey="gen" />);
    await userEvent.click(screen.getByTestId(`stub-row-${MCP_ROW.id}`));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    expect(artifactsApi.delete).toHaveBeenCalledWith("gen", "a/b.bin");
    expect(screen.queryByRole("button", { name: MCP_ROW_ACTION })).not.toBeInTheDocument();
  });
});
