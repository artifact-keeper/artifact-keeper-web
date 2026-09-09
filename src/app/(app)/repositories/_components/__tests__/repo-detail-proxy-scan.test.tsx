// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Repository Security tab audience (proxy scan visibility).
//
// The tab used to be admin-only and rendered nothing but the scan-config form.
// The proxy verdict endpoint authorizes any authenticated user with repository
// visibility, so gating the summary behind `is_admin` would leave non-admin
// developers with the per-artifact panel and no way to see which digests are
// affected. This suite pins that decision, plus the fact that the config form
// stays admin-only.
//
// Kept out of repo-detail-content.test.tsx because that suite hardcodes an
// admin viewer and a virtual/generic repository at module scope.
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  // No `?tab=` override: the default tab is format-driven and the Security
  // panel is opened by click below.
  useSearchParams: () => new URLSearchParams(),
}));

// Mutable per-test knobs.
let repository: Record<string, unknown> = {
  id: "11111111-1111-1111-1111-111111111111",
  key: "npm-remote",
  name: "npm remote",
  format: "npm",
  repo_type: "remote",
  storage_backend: "filesystem",
  versioning_enabled: false,
};
let isAdmin = false;
let isAuthenticated = true;

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => {
    const key = Array.isArray(opts.queryKey) ? opts.queryKey[0] : undefined;
    if (key === "repository") {
      return { data: repository, isLoading: false, isFetching: false };
    }
    if (key === "artifacts") {
      return {
        data: {
          items: [],
          pagination: { page: 1, per_page: 20, total: 0, total_pages: 0 },
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
  useAuth: () => ({ isAuthenticated, user: { is_admin: isAdmin } }),
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
  securityApi: {
    getRepoSecurity: vi.fn(),
    triggerScan: vi.fn(),
    updateRepoSecurity: vi.fn(),
  },
}));
vi.mock("@/lib/api/quarantine", () => ({
  quarantineApi: {
    getStatus: vi.fn(),
    release: vi.fn(),
    reject: vi.fn(),
    quarantine: vi.fn(),
  },
}));

// The section under observation is stubbed: it has its own suite
// (proxy-scan-summary.test.tsx). Here we assert only where it is mounted.
const summaryProps = vi.hoisted(() => vi.fn());
vi.mock("../proxy-scan-summary", () => ({
  ProxyScanSummarySection: (props: { repositoryKey: string }) => {
    summaryProps(props);
    return <div data-testid="stub-proxy-scan-summary" />;
  },
}));

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
}));
vi.mock("@/components/common/data-table", () => ({ DataTable: () => <div /> }));
vi.mock("@/components/common/file-upload", () => ({ FileUpload: () => <div /> }));
vi.mock("@/components/common/copy-button", () => ({ CopyButton: () => <div /> }));

import { RepoDetailContent } from "../repo-detail-content";

const REMOTE_NPM = {
  id: "11111111-1111-1111-1111-111111111111",
  key: "npm-remote",
  name: "npm remote",
  format: "npm",
  repo_type: "remote",
  storage_backend: "filesystem",
  versioning_enabled: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  repository = { ...REMOTE_NPM };
  isAdmin = false;
  isAuthenticated = true;
});
afterEach(() => cleanup());

/**
 * Radix only mounts the active tab panel, and the format-driven default tab
 * (#2793) is only ever Artifacts or Packages, so the Security panel has to be
 * opened before its contents can be asserted.
 */
async function openSecurityTab() {
  render(<RepoDetailContent repoKey="npm-remote" />);
  await userEvent.click(screen.getByRole("tab", { name: /security/i }));
}

describe("Repository Security tab — proxy scan audience", () => {
  it("gives a non-admin authenticated user the Security tab and the proxy summary", async () => {
    await openSecurityTab();

    expect(screen.getByTestId("stub-proxy-scan-summary")).toBeInTheDocument();
    expect(summaryProps).toHaveBeenCalledWith({ repositoryKey: "npm-remote" });
  });

  it("does not give a non-admin the scan-config form", async () => {
    await openSecurityTab();

    expect(screen.queryByLabelText(/Scan on Proxy/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /save settings/i })).toBeNull();
  });

  it("gives an admin both the summary and the config form", async () => {
    isAdmin = true;

    await openSecurityTab();

    expect(screen.getByTestId("stub-proxy-scan-summary")).toBeInTheDocument();
    expect(screen.getByLabelText(/Scan on Proxy/i)).toBeInTheDocument();
  });

  it("keeps the tab hidden from anonymous non-admin viewers", () => {
    // The endpoint 401s them, so there is nothing to show; the per-artifact
    // panel is where they get the sign-in prompt.
    isAuthenticated = false;

    render(<RepoDetailContent repoKey="npm-remote" />);

    expect(screen.queryByRole("tab", { name: /security/i })).toBeNull();
    expect(screen.queryByTestId("stub-proxy-scan-summary")).toBeNull();
  });

  it("does not mount the summary on a repository with no proxy cache", async () => {
    repository = { ...REMOTE_NPM, repo_type: "local" };
    isAdmin = true;

    await openSecurityTab();

    expect(screen.queryByTestId("stub-proxy-scan-summary")).toBeNull();
    // The admin config form is unaffected.
    expect(screen.getByLabelText(/Scan on Proxy/i)).toBeInTheDocument();
  });

  it("does not mount the summary on a Remote repository whose format has no proxy gate", async () => {
    repository = { ...REMOTE_NPM, format: "maven" };
    isAdmin = true;

    await openSecurityTab();

    expect(screen.queryByTestId("stub-proxy-scan-summary")).toBeNull();
  });
});
