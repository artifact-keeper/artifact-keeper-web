// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

vi.mock("@tanstack/react-query", () => ({
  // Return canned data by the first element of the query key; never execute
  // queryFn (so the mocked API modules are never actually called).
  useQuery: (opts: { queryKey: unknown[] }) => {
    const key = Array.isArray(opts.queryKey) ? opts.queryKey[0] : undefined;
    if (key === "repository") {
      return { data: repository, isLoading: false, isFetching: false };
    }
    if (key === "artifacts") {
      return {
        data: {
          items: [artifactFixture],
          pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
        },
        isLoading: false,
        isFetching: false,
      };
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

// API modules — imported at module load; never invoked (queryFn is not run).
vi.mock("@/lib/api/repositories", () => ({ repositoriesApi: { get: vi.fn() } }));
vi.mock("@/lib/api/artifacts", () => ({
  artifactsApi: {
    listGrouped: vi.fn(),
    getAbsoluteDownloadUrl: () => "http://localhost/download",
    getDownloadUrl: () => "/download",
    createDownloadTicket: vi.fn(),
  },
}));
vi.mock("@/lib/api/security", () => ({ default: { getRepoSecurity: vi.fn() } }));

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
vi.mock("./docker-tag-list", () => ({ DockerTagList: () => <div data-stub="docker" /> }));
vi.mock("./artifact-browser-toggle", () => ({
  ArtifactBrowserToggle: () => <div data-stub="ArtifactBrowserToggle" />,
  supportsGrouping: () => false,
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
    // artifacts, packages, upload, members, security, notifications, settings
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
    const row = screen.getByTestId("stub-row-a1");
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
