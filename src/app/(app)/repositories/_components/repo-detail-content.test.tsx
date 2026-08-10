// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks
//
// This suite only cares about the repo-detail tab strip, so everything below
// the tabs (data tables, tab-content panels, API calls) is stubbed out. The
// one thing we deliberately render faithfully is the *icon* element on each
// `TabsTrigger`: `lucide-react` is mocked to a proxy that turns every icon
// import into an identifiable `<svg>`, which is what the regression assertion
// below looks for.
// ---------------------------------------------------------------------------

// Hoisted, mutable knobs shared with the module mocks below: the URL query
// string (drives the `?view=` override), the artifacts query keys the
// component issued (so tests can observe page/pageSize state), and the props
// the DockerTagList stub was last rendered with.
const h = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  artifactsQueryKeys: [] as unknown[][],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => h.searchParams,
}));

// A virtual repo so the (virtual-only) Members tab renders too; admin +
// authenticated so every gated tab is present. `generic` format keeps the
// artifact browser in flat mode (no grouping toggle / maven / docker views).
const repository = {
  id: "11111111-1111-1111-1111-111111111111",
  key: "demo",
  name: "Demo",
  format: "generic",
  repo_type: "virtual",
  storage_backend: "filesystem",
  versioning_enabled: false,
};

// One canned artifact so the (stubbed) DataTable can open the detail dialog.
const artifactFixture = {
  id: "a1",
  repository_key: "demo",
  path: "team/config.yaml",
  name: "config.yaml",
  size_bytes: 10,
  checksum_sha256: "c".repeat(64),
  content_type: "application/x-yaml",
  download_count: 0,
  created_at: "2026-07-01T00:00:00Z",
};

// One server-grouped Docker tag rollup (`?group_by=docker_tag`), surfaced
// through the canned artifacts response so the Docker grouped view has a row.
const dockerTagFixture = {
  id: "tag-artifact-1",
  repository_key: "demo",
  image: "library/node",
  tag: "14",
  manifest_digest: `sha256:${"a".repeat(64)}`,
  total_size_bytes: 50_000_000,
  layer_count: 0,
  is_index: false,
  last_pushed_at: "2026-04-10T12:00:00Z",
  scan_status: "completed",
};

vi.mock("@tanstack/react-query", () => ({
  // Return canned data by the first element of the query key; never execute
  // queryFn (so the mocked API modules are never actually called).
  useQuery: (opts: { queryKey: unknown[] }) => {
    const key = Array.isArray(opts.queryKey) ? opts.queryKey[0] : undefined;
    if (key === "repository") {
      return { data: repository, isLoading: false, isFetching: false };
    }
    if (key === "artifacts") {
      h.artifactsQueryKeys.push(opts.queryKey);
      return {
        data: {
          items: [artifactFixture],
          pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
          docker_tags: [dockerTagFixture],
        },
        isLoading: false,
        isFetching: false,
      };
    }
    return { data: undefined, isLoading: false, isFetching: false };
  },
  // Invoke the real mutationFn when a test triggers `mutate`, so behavior
  // assertions can observe what the mutation would send to the API layer.
  useMutation: (opts: { mutationFn?: (arg: never) => unknown }) => ({
    mutate: vi.fn((arg: never) => opts.mutationFn?.(arg)),
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

// Every lucide icon becomes an identifiable <svg> so the assertion can detect
// "this trigger has an icon" without coupling to a specific glyph. Built from
// the real export list so any icon the component imports resolves.
vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const mocked: Record<string, unknown> = {};
  for (const name of Object.keys(actual)) {
    const Icon = (props: Record<string, unknown>) => (
      <svg data-testid={`icon-${name}`} {...props} />
    );
    Icon.displayName = `MockIcon(${name})`;
    mocked[name] = Icon;
  }
  return mocked;
});

// API modules — imported at module load; the query functions are never run,
// but mutation callbacks and on-demand lookups (artifact detail by path) do
// reach them, so those surface as plain spies.
vi.mock("@/lib/api/repositories", () => ({ repositoriesApi: { get: vi.fn() } }));
vi.mock("@/lib/api/artifacts", () => ({
  artifactsApi: {
    listGrouped: vi.fn(),
    get: vi.fn().mockResolvedValue({
      id: "a1",
      repository_key: "demo",
      path: "v2/library/node/manifests/14",
      name: "14",
      size_bytes: 10,
      checksum_sha256: "a".repeat(64),
      content_type: "application/vnd.oci.image.manifest.v1+json",
      download_count: 0,
      created_at: "2026-07-01T00:00:00Z",
    }),
    getAbsoluteDownloadUrl: () => "http://localhost/download",
    getDownloadUrl: () => "/download",
    createDownloadTicket: vi.fn(),
  },
}));
vi.mock("@/lib/api/security", () => ({
  securityApi: {
    getRepoSecurity: vi.fn(),
    triggerScan: vi.fn().mockResolvedValue({ artifacts_queued: 1 }),
  },
}));

// Heavy / out-of-scope children stubbed to nothing meaningful. (vi.mock
// factories are hoisted, so each stub is inlined rather than sharing a helper.)
vi.mock("./artifact-versions-section", () => ({ ArtifactVersionsSection: () => <div data-stub="versions-section" /> }));
vi.mock("./sbom-tab-content", () => ({ SbomTabContent: () => <div data-stub="sbom" /> }));
vi.mock("./security-tab-content", () => ({ SecurityTabContent: () => <div data-stub="security" /> }));
vi.mock("./health-tab-content", () => ({ HealthTabContent: () => <div data-stub="health" /> }));
vi.mock("./notifications-tab-content", () => ({ NotificationsTabContent: () => <div data-stub="notifications" /> }));
vi.mock("./virtual-members-panel", () => ({ VirtualMembersPanel: () => <div data-stub="members" /> }));
vi.mock("./packages-tab-content", () => ({ PackagesTabContent: () => <div data-stub="packages" /> }));
vi.mock("./repo-settings-tab", () => ({ RepoSettingsTab: () => <div data-stub="settings" /> }));
vi.mock("./maven-component-list", () => ({ MavenComponentList: () => <div data-stub="maven" /> }));
vi.mock("./docker-tag-list", () => ({
  // Interactive stand-in: renders one row per supplied tag and exposes the
  // component's callbacks as buttons so tests can exercise the Docker
  // grouped view's behavior (detail lookup, scan, page-size change) without
  // pulling in the real table.
  DockerTagList: (props: {
    tags?: Array<{ id: string; image: string; tag: string }>;
    onTagClick?: (tag: unknown) => void;
    onScan?: (tag: unknown) => void;
    onPageSizeChange?: (size: number) => void;
  }) => {
    const first = props.tags?.[0];
    return (
      <div data-stub="docker" data-tag-count={props.tags?.length ?? 0}>
        {first && (
          <>
            <button data-testid="stub-tag-click" onClick={() => props.onTagClick?.(first)}>
              {first.image}:{first.tag}
            </button>
            <button data-testid="stub-tag-scan" onClick={() => props.onScan?.(first)}>
              scan
            </button>
          </>
        )}
        <button data-testid="stub-page-size-50" onClick={() => props.onPageSizeChange?.(50)}>
          page-size-50
        </button>
      </div>
    );
  },
}));
vi.mock("./artifact-folder-tree", () => ({ ArtifactFolderTree: () => <div data-stub="folder-tree" /> }));
vi.mock("./artifact-browser-toggle", () => ({
  ArtifactBrowserToggle: () => <div data-stub="ArtifactBrowserToggle" />,
  supportsGrouping: () => false,
  supportsTree: () => false,
}));
vi.mock("@/components/common/data-table", () => ({
  // Minimal row rendering so tests can open the artifact detail dialog via
  // onRowClick, without pulling in the real table.
  DataTable: ({
    data,
    onRowClick,
  }: {
    data?: Array<{ id: string; name: string }>;
    onRowClick?: (row: unknown) => void;
  }) => (
    <div data-stub="DataTable">
      {(data ?? []).map((row) => (
        <button
          key={row.id}
          data-testid={`stub-row-${row.id}`}
          onClick={() => onRowClick?.(row)}
        >
          {row.name}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("@/components/common/file-upload", () => ({
  FileUpload: () => <div data-stub="FileUpload" />,
}));
vi.mock("@/components/common/copy-button", () => ({
  CopyButton: () => <div data-stub="CopyButton" />,
}));
vi.mock("@/components/common/quarantine-badge", () => ({
  QuarantineBadge: () => <div data-stub="QuarantineBadge" />,
}));
vi.mock("@/components/common/quarantine-banner", () => ({
  QuarantineBanner: () => <div data-stub="QuarantineBanner" />,
}));

import { RepoDetailContent } from "./repo-detail-content";
import { artifactsApi } from "@/lib/api/artifacts";
import { securityApi } from "@/lib/api/security";

describe("RepoDetailContent tab strip", () => {
  beforeEach(() => {
    cleanup();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders every repo-detail tab with a leading icon", () => {
    render(<RepoDetailContent repoKey="demo" />);

    const tabs = screen.getAllByRole("tab");
    // artifacts, packages, setup, upload, members, security, notifications,
    // settings, labels
    expect(tabs.length).toBeGreaterThanOrEqual(7);

    const tabsWithoutIcon = tabs
      .filter((tab) => tab.querySelector("svg") === null)
      .map((tab) => tab.textContent?.trim() || "(unlabeled)");

    expect(
      tabsWithoutIcon,
      `every tab should render a leading icon, but these did not: ${tabsWithoutIcon.join(", ")}`,
    ).toEqual([]);
  });
});

describe("RepoDetailContent Setup tab (#560)", () => {
  beforeEach(() => {
    cleanup();
    repository.format = "generic";
  });
  afterEach(() => {
    cleanup();
    repository.format = "generic";
  });

  it("exposes a Setup tab that renders the per-repo setup guide", async () => {
    render(<RepoDetailContent repoKey="demo" />);

    const setupTab = screen.getByRole("tab", { name: /setup/i });
    expect(setupTab).toBeTruthy();

    await userEvent.click(setupTab);
    expect(setupTab).toHaveAttribute("aria-selected", "true");

    // A generic repo renders flat, curl-based steps that embed the repo key,
    // proving the guide is wired to *this* repository, not the central page.
    expect(
      await screen.findByRole("heading", { name: /Upload an artifact/i }),
    ).toBeTruthy();
    const repoScopedSnippets = screen.getAllByText(
      (_, el) =>
        el?.tagName === "CODE" &&
        (el.textContent ?? "").includes("repositories/demo/"),
    );
    expect(repoScopedSnippets.length).toBeGreaterThan(0);
  });
});

describe("RepoDetailContent default primary tab (#2793)", () => {
  beforeEach(() => {
    cleanup();
    repository.format = "generic";
  });
  afterEach(() => {
    cleanup();
    repository.format = "generic";
  });

  it("defaults RAW/Generic repositories to the Artifacts tab", () => {
    repository.format = "generic";
    render(<RepoDetailContent repoKey="demo" />);

    expect(screen.getByRole("tab", { name: /artifacts/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /packages/i })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    // Active panel is the artifact browser (its stubbed row is mounted).
    expect(screen.getByTestId("stub-row-a1")).toBeInTheDocument();
  });

  it("defaults package-oriented (Maven) repositories to the Packages tab", () => {
    repository.format = "maven";
    render(<RepoDetailContent repoKey="demo" />);

    expect(screen.getByRole("tab", { name: /packages/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /artifacts/i })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    // Active panel is the Packages view (stubbed), not the artifact browser.
    expect(document.querySelector('[data-stub="packages"]')).toBeInTheDocument();
  });
});

describe("RepoDetailContent artifact detail dialog — Versions tab (#571)", () => {
  beforeEach(() => {
    cleanup();
    repository.versioning_enabled = false;
    repository.format = "generic";
  });
  afterEach(() => {
    cleanup();
    repository.versioning_enabled = false;
    repository.format = "generic";
  });

  async function openDetailDialog() {
    render(<RepoDetailContent repoKey="demo" />);
    // The artifact row lives on the Artifacts tab. For package-oriented formats
    // (e.g. maven) that tab is no longer the default (#2793), so select it
    // explicitly before opening the detail dialog.
    await userEvent.click(screen.getByRole("tab", { name: /artifacts/i }));
    const row = await screen.findByTestId("stub-row-a1", {}, { timeout: 2000 });
    row.click();
    // The dialog tablist renders synchronously once selectedArtifact is set.
    return await screen.findByText("Artifact Details", {}, { timeout: 2000 }).catch(() => null);
  }

  it("does not offer a Versions tab when the repository has versioning disabled", async () => {
    await openDetailDialog();
    expect(screen.queryByRole("tab", { name: /versions/i })).toBeNull();
    // The regular Details tab is still there — existing dialog unaffected.
    expect(screen.getAllByRole("tab", { name: /details/i }).length).toBeGreaterThan(0);
  });

  it("offers a Versions tab when versioning is enabled on a generic repository", async () => {
    repository.versioning_enabled = true;
    await openDetailDialog();
    expect(screen.getByRole("tab", { name: /versions/i })).toBeTruthy();
  });

  it("hides the Versions tab for formats without first-class versioning even if the flag is set", async () => {
    repository.versioning_enabled = true;
    repository.format = "maven";
    await openDetailDialog();
    expect(screen.queryByRole("tab", { name: /versions/i })).toBeNull();
  });
});

describe("RepoDetailContent Docker grouped view (#330 / ak#1336)", () => {
  beforeEach(() => {
    cleanup();
    repository.format = "docker";
    h.searchParams = new URLSearchParams("view=grouped");
    h.artifactsQueryKeys = [];
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    repository.format = "generic";
    h.searchParams = new URLSearchParams();
    h.artifactsQueryKeys = [];
  });

  async function renderDockerGrouped() {
    render(<RepoDetailContent repoKey="demo" />);
    // Docker is not a package-oriented format, but select the Artifacts tab
    // explicitly so the test does not depend on the default-tab heuristic.
    await userEvent.click(screen.getByRole("tab", { name: /artifacts/i }));
    return await screen.findByTestId("stub-tag-click", {}, { timeout: 2000 });
  }

  it("requests the server-side docker_tag rollup and passes its rows through", async () => {
    await renderDockerGrouped();

    // The grouped query is labelled and parametrized for the docker_tag
    // rollup rather than the flat list.
    const lastKey = h.artifactsQueryKeys.at(-1) as unknown[];
    expect(lastKey).toContain("grouped:docker");
    // The stub received the rollup rows from the response's docker_tags array.
    expect(screen.getByTestId("stub-tag-click")).toHaveTextContent("library/node:14");
  });

  it("resolves a tag click to the manifest via its deterministic v2 path", async () => {
    await renderDockerGrouped();

    await userEvent.click(screen.getByTestId("stub-tag-click"));

    // v2/{image}/manifests/{tag} — the path the OCI push handler composes.
    expect(artifactsApi.get).toHaveBeenCalledWith(
      "demo",
      "v2/library/node/manifests/14",
    );
    // …and the resolved manifest opens the same detail dialog as flat view
    // (its title is the artifact name, per DialogTitle in the component).
    const dialog = await screen.findByRole("dialog", {}, { timeout: 2000 });
    expect(dialog).toHaveTextContent("14");
    expect(
      await screen.findAllByRole("tab", { name: /details/i }),
    ).not.toHaveLength(0);
  });

  it("triggers a scan for the tag's manifest artifact id", async () => {
    await renderDockerGrouped();

    await userEvent.click(screen.getByTestId("stub-tag-scan"));

    expect(securityApi.triggerScan).toHaveBeenCalledWith({
      artifact_id: "tag-artifact-1",
    });
  });

  it("changing the page size resets to page 1 with the new size", async () => {
    await renderDockerGrouped();

    await userEvent.click(screen.getByTestId("stub-page-size-50"));

    // ["artifacts", repoKey, searchQuery, page, pageSize, mode]
    const lastKey = h.artifactsQueryKeys.at(-1) as unknown[];
    expect(lastKey[3]).toBe(1);
    expect(lastKey[4]).toBe(50);
  });
});
