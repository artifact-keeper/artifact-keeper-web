// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Curation tab on a Remote MCP repository (#1087).
//
// The backend lets a Remote MCP repository's administrators (the repository
// `admin` action, reported as `mcp_caller_is_repo_admin` on the
// single-repository response) decide its catalog rows through
// `/api/v1/repositories/{key}/mcp/catalog`. `/curation` is instance-admin
// only, so the Remote's own page carries the queue for those callers, scoped
// to that repository. A writer who is no repository admin gets no tab.
// `mcp_package_repos` / `mcp_server_deny` may be absent from the response for
// non-admins (artifact-keeper#5398); the fixtures below omit them.
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
const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.query),
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

const artifactRow: Record<string, unknown> = { ...MCP_ROW };

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

const auth = vi.hoisted(() => ({ user: { is_admin: false } as { is_admin: boolean } }));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ isAuthenticated: true, user: auth.user }),
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
vi.mock("@/components/common/data-table", () => ({ DataTable: () => <div /> }));
// The queue itself is covered by mcp-curation-queue.test.tsx; here only which
// repository it is mounted for matters.
vi.mock("@/app/(app)/(admin)/curation/_components/mcp-curation-queue", () => ({
  McpCurationQueue: ({ repoKey }: { repoKey: string }) => <div data-testid="mcp-curation-queue">{repoKey}</div>,
}))
vi.mock("@/components/common/file-upload", () => ({ FileUpload: () => <div /> }));
vi.mock("@/components/common/copy-button", () => ({ CopyButton: () => <div /> }));

import { RepoDetailContent } from "../repo-detail-content";

function setRepo(fields: Record<string, unknown>) {
  for (const k of Object.keys(repository)) delete repository[k];
  Object.assign(repository, {
    id: "11111111-1111-1111-1111-111111111111",
    key: "mcp-remote",
    name: "MCP remote",
    format: "mcp",
    format_key: null,
    repo_type: "remote",
    storage_backend: "filesystem",
    versioning_enabled: false,
    ...fields,
  });
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  nav.query = "";
  auth.user = { is_admin: false };
  setRepo({ mcp_caller_is_repo_admin: true });
});
afterEach(() => cleanup());

const curationTab = () => screen.queryByRole("tab", { name: /curation/i });

describe("Remote MCP repository: Curation tab (#1087)", () => {
  it("gives a repository admin who is no instance admin the queue of this repository", async () => {
    render(<RepoDetailContent repoKey="mcp-remote" />);
    expect(screen.queryByTestId("mcp-curation-queue")).not.toBeInTheDocument();
    await userEvent.click(curationTab()!);
    expect(await screen.findByTestId("mcp-curation-queue")).toHaveTextContent(/^mcp-remote$/);
  });

  it("opens on the queue from a ?tab=curation link", () => {
    nav.query = "tab=curation";
    render(<RepoDetailContent repoKey="mcp-remote" />);
    expect(curationTab()).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("mcp-curation-queue")).toHaveTextContent("mcp-remote");
  });

  it("gives a writer who is no repository admin neither the tab nor the queue", () => {
    setRepo({ mcp_caller_is_repo_admin: false });
    nav.query = "tab=curation";
    render(<RepoDetailContent repoKey="mcp-remote" />);
    expect(curationTab()).not.toBeInTheDocument();
    expect(screen.queryByTestId("mcp-curation-queue")).not.toBeInTheDocument();
  });

  it("treats a response without mcp_caller_is_repo_admin as no repository admin", () => {
    setRepo({});
    nav.query = "tab=curation";
    render(<RepoDetailContent repoKey="mcp-remote" />);
    expect(curationTab()).not.toBeInTheDocument();
  });

  it("gives an instance admin the tab", () => {
    auth.user = { is_admin: true };
    setRepo({});
    render(<RepoDetailContent repoKey="mcp-remote" />);
    expect(curationTab()).toBeInTheDocument();
  });

  it.each([
    ["local", "mcp"],
    ["staging", "mcp"],
    ["virtual", "mcp"],
    ["remote", "npm"],
  ])("offers no MCP curation tab on a %s %s repository", (repoType, format) => {
    setRepo({ repo_type: repoType, format, mcp_caller_is_repo_admin: true });
    nav.query = "tab=curation";
    render(<RepoDetailContent repoKey="mcp-remote" />);
    expect(curationTab()).not.toBeInTheDocument();
    expect(screen.queryByTestId("mcp-curation-queue")).not.toBeInTheDocument();
  });
});
