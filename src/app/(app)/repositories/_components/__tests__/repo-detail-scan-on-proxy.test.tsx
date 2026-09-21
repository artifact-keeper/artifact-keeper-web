// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// "Scan on Proxy" in the repository Security tab (backend artifact-keeper#1274).
//
// The backend accepts `scan_on_proxy` for a repository of any format but only
// enforces the inline scan-and-block gate in four handlers (npm, PyPI,
// OCI/Docker, VS Code). Offering an enableable toggle on, say, a Maven remote
// tells the operator that proxied content is being scanned when it is not, so
// the control is rendered disabled with a note there instead.
//
// Kept out of repo-detail-content.test.tsx because that suite pins a single
// virtual/generic repository fixture; these cases vary the format per test.
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
  useSearchParams: () => new URLSearchParams(),
}));

// Mutable per-test state driving the react-query mock.
const repository: Record<string, unknown> = {
  id: "11111111-1111-1111-1111-111111111111",
  key: "proxy",
  name: "Proxy",
  format: "npm",
  format_key: null,
  repo_type: "remote",
  storage_backend: "filesystem",
  versioning_enabled: false,
};

// The stored scan config the Security form initialises from.
let storedScanOnProxy = false;

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => {
    const key = Array.isArray(opts.queryKey) ? opts.queryKey[0] : undefined;
    if (key === "repository") {
      return { data: repository, isLoading: false, isFetching: false };
    }
    if (key === "repository-security") {
      return {
        data: {
          config: {
            scan_enabled: true,
            scan_on_upload: true,
            scan_on_proxy: storedScanOnProxy,
            block_on_policy_violation: false,
            severity_threshold: "high",
          },
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
vi.mock("../image-build-tab", () => ({ ImageBuildTab: () => <div /> }));
vi.mock("../artifact-folder-tree", () => ({ ArtifactFolderTree: () => <div /> }));
vi.mock("@/components/common/data-table", () => ({ DataTable: () => <div /> }));
vi.mock("@/components/common/file-upload", () => ({ FileUpload: () => <div /> }));
vi.mock("@/components/common/copy-button", () => ({ CopyButton: () => <div /> }));

import { RepoDetailContent } from "../repo-detail-content";

/**
 * Render the detail view, open the Security tab and return the proxy switch.
 * Radix unmounts inactive tab content, and `?tab=` only accepts the two
 * format-driven primary tabs (`resolveInitialRepoTab`), so the tab is opened
 * by clicking it rather than by deep-link.
 */
async function proxySwitch(format: string, repoType = "remote") {
  repository.format = format;
  repository.repo_type = repoType;
  render(<RepoDetailContent repoKey="proxy" />);
  await userEvent.click(screen.getByRole("tab", { name: /Security/i }));
  return screen.getByRole("switch", { name: "Scan on Proxy" });
}

const UNENFORCED_NOTE = /the backend accepts the setting but serves proxied content unscanned/i;
const VERDICTS_HELP = /proxy scan verdicts/i;

beforeEach(() => {
  cleanup();
  repository.format = "npm";
  repository.format_key = null;
  repository.repo_type = "remote";
  storedScanOnProxy = false;
});
afterEach(() => cleanup());

describe("Scan on Proxy toggle (#1274)", () => {
  it.each(["npm", "pypi", "docker", "vscode"])(
    "stays enableable on a %s remote, with the verdicts pointer",
    async (format) => {
      expect(await proxySwitch(format)).toBeEnabled();
      expect(screen.getByText(VERDICTS_HELP)).toBeInTheDocument();
      expect(screen.queryByText(UNENFORCED_NOTE)).not.toBeInTheDocument();
    },
  );

  it.each(["maven", "cargo", "helm"])(
    "is disabled with a note on a %s remote",
    async (format) => {
      // The regression: an operator could switch this on and believe proxied
      // Maven/Cargo/Helm artifacts were being scanned.
      expect(await proxySwitch(format)).toBeDisabled();
      expect(screen.getByText(UNENFORCED_NOTE)).toBeInTheDocument();
      expect(screen.queryByText(VERDICTS_HELP)).not.toBeInTheDocument();
    },
  );

  it("names the repository's own format in the note", async () => {
    await proxySwitch("maven");

    expect(screen.getByText(/For MAVEN the backend accepts the setting/i)).toBeInTheDocument();
    expect(
      screen.getByText(/enforced for npm, PyPI, Docker\/OCI and VS Code remotes/i),
    ).toBeInTheDocument();
  });

  it("applies the gate to virtual repositories too", async () => {
    expect(await proxySwitch("maven", "virtual")).toBeDisabled();
    cleanup();
    expect(await proxySwitch("docker", "virtual")).toBeEnabled();
  });

  it("leaves a hosted repository's control untouched", async () => {
    // Local/staging repos proxy nothing, so neither the note nor the verdicts
    // pointer applies and the pre-existing control is unchanged.
    expect(await proxySwitch("maven", "local")).toBeEnabled();
    expect(screen.queryByText(UNENFORCED_NOTE)).not.toBeInTheDocument();
    expect(screen.queryByText(VERDICTS_HELP)).not.toBeInTheDocument();
  });

  it("still lets an operator turn a stored-true setting off", async () => {
    // Repos configured before this fix carry `scan_on_proxy: true`. Disabling
    // the control outright would strand them on a setting that does nothing.
    storedScanOnProxy = true;
    const toggle = await proxySwitch("maven");

    expect(toggle).toBeEnabled();
    expect(toggle).toBeChecked();
    expect(screen.getByText(UNENFORCED_NOTE)).toBeInTheDocument();

    await userEvent.click(toggle);

    expect(screen.getByRole("switch", { name: "Scan on Proxy" })).not.toBeChecked();
  });

  it("does not re-offer the toggle once a stored-true setting is turned off", async () => {
    storedScanOnProxy = true;
    const toggle = await proxySwitch("maven");

    await userEvent.click(toggle);

    expect(screen.getByRole("switch", { name: "Scan on Proxy" })).toBeDisabled();
  });
});
