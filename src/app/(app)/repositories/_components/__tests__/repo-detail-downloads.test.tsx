// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// The Downloads column on a Remote (proxy) repository (#808, backend
// artifact-keeper#3446).
//
// Proxy-cached rows come back from the same artifacts listing as hosted ones
// (synthetic ids, `analyzable: false`, `cache_cached_at` set) and carry a real
// `download_count` since backend artifact-keeper#3388. But only some formats
// increment it, so the column must show a real count where one exists AND
// distinguish a measured zero from a format that counts nothing — a bare "0"
// on a busy Docker proxy is what gets a live repository deleted.
//
// Kept out of repo-detail-content.test.tsx because that suite's DataTable stub
// deliberately renders only the `name` column.
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("tab=artifacts"),
}));

// Mutable per-test state driving the react-query mock.
const repository: Record<string, unknown> = {
  id: "11111111-1111-1111-1111-111111111111",
  key: "proxy",
  name: "Proxy",
  format: "pypi",
  format_key: null,
  repo_type: "remote",
  storage_backend: "filesystem",
  versioning_enabled: false,
};

// A proxy-cached listing row, in the shape the backend serializes it:
// synthetic id, no uploader, `analyzable: false`, `cache_cached_at` set.
const CACHED_ROW: Record<string, unknown> = {
  id: "cache:proxy:pkg/thing-1.0.tar.gz",
  repository_key: "proxy",
  path: "pkg/thing-1.0.tar.gz",
  name: "thing-1.0.tar.gz",
  size_bytes: 1024,
  checksum_sha256: "c".repeat(64),
  content_type: "application/gzip",
  download_count: 0,
  created_at: "2026-07-01T00:00:00Z",
  cache_cached_at: "2026-07-02T00:00:00Z",
  cache_expires_at: "2026-08-02T00:00:00Z",
  analyzable: false,
  uploaded_by: null,
};

let artifactRow: Record<string, unknown> = { ...CACHED_ROW };
let formatHandlers: unknown = undefined;

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
    if (key === "format-handlers") {
      return { data: formatHandlers, isLoading: false, isFetching: false };
    }
    return { data: undefined, isLoading: false, isFetching: false };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
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
// Renders the real `downloads` column cell — the thing under test — plus a row
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
          <div data-testid="downloads-cell">
            {columns?.find((c) => c.id === "downloads")?.cell?.(row)}
          </div>
        </div>
      ))}
    </div>
  ),
}));
vi.mock("@/components/common/file-upload", () => ({ FileUpload: () => <div /> }));
vi.mock("@/components/common/copy-button", () => ({ CopyButton: () => <div /> }));

import { RepoDetailContent } from "../repo-detail-content";
import {
  PROXY_DOWNLOADS_UNTRACKED_LABEL,
  PROXY_DOWNLOADS_UNTRACKED_REASON,
  PROXY_DOWNLOADS_UNTRACKED_SYMBOL,
} from "@/lib/proxy-downloads";

function downloadsCell() {
  render(<RepoDetailContent repoKey="proxy" />);
  return screen.getByTestId("downloads-cell");
}

beforeEach(() => {
  cleanup();
  repository.format = "pypi";
  repository.format_key = null;
  repository.repo_type = "remote";
  artifactRow = { ...CACHED_ROW };
  formatHandlers = undefined;
});
afterEach(() => cleanup());

describe("Downloads column on a proxy repository (#808)", () => {
  it("renders the real count on a proxy-cached row", () => {
    // The regression: the count reaching the UI for a cached row must be
    // rendered, not assumed to be zero (backend artifact-keeper#3388).
    artifactRow = { ...CACHED_ROW, download_count: 1234 };

    expect(downloadsCell()).toHaveTextContent("1,234");
  });

  it("shows a measured zero as 0 for a format that counts proxy downloads", () => {
    const cell = downloadsCell();

    expect(cell).toHaveTextContent("0");
    expect(cell).not.toHaveTextContent(PROXY_DOWNLOADS_UNTRACKED_LABEL);
  });

  it("shows a dash, not 0, for a format that records no proxied downloads", () => {
    repository.format = "docker";

    const cell = downloadsCell();

    expect(cell.textContent).toContain(PROXY_DOWNLOADS_UNTRACKED_SYMBOL);
    expect(cell.textContent).not.toContain("0");
    // The dash alone is silence in a screen reader, so the cell also carries
    // the reason as text, and as a hover title for sighted users.
    expect(cell).toHaveTextContent(PROXY_DOWNLOADS_UNTRACKED_LABEL);
    expect(
      within(cell).getByTitle(PROXY_DOWNLOADS_UNTRACKED_REASON),
    ).toBeInTheDocument();
  });

  it("never hides a real count behind the dash", () => {
    // cargo records nothing today; if a count shows up anyway the backend has
    // started counting and the number wins over the frontend's list.
    repository.format = "cargo";
    artifactRow = { ...CACHED_ROW, download_count: 7 };

    const cell = downloadsCell();

    expect(cell).toHaveTextContent("7");
    expect(cell.textContent).not.toContain(PROXY_DOWNLOADS_UNTRACKED_SYMBOL);
  });

  it("believes the API when a format handler reports the capability", () => {
    // What artifact-keeper#3446 should ship: the backend states which formats
    // count proxied downloads, and the frontend stops guessing.
    repository.format = "cargo";
    formatHandlers = [
      { format_key: "cargo", capabilities: { records_proxy_downloads: true } },
    ];

    const cell = downloadsCell();

    expect(cell).toHaveTextContent("0");
    expect(cell.textContent).not.toContain(PROXY_DOWNLOADS_UNTRACKED_SYMBOL);
  });

  it("leaves a hosted repository's zero alone", () => {
    repository.repo_type = "local";
    repository.format = "docker";

    expect(downloadsCell()).toHaveTextContent("0");
  });
});

describe("Downloads row in the artifact detail dialog (#808)", () => {
  it("says 'Not tracked' rather than 0 for an uncounted format", async () => {
    repository.format = "docker";
    render(<RepoDetailContent repoKey="proxy" />);

    await userEvent.click(screen.getByTestId(`stub-row-${CACHED_ROW.id}`));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(PROXY_DOWNLOADS_UNTRACKED_LABEL),
    ).toHaveAttribute("title", PROXY_DOWNLOADS_UNTRACKED_REASON);
  });

  it("shows the number for a counted format", async () => {
    artifactRow = { ...CACHED_ROW, download_count: 9 };
    render(<RepoDetailContent repoKey="proxy" />);

    await userEvent.click(screen.getByTestId(`stub-row-${CACHED_ROW.id}`));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("9")).toBeInTheDocument();
  });
});
