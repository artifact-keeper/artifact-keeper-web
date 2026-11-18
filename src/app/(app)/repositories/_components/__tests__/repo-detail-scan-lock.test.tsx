// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// The repository Security tab's save keeps the instance lock (#1185).
//
// An instance administrator's PUT /repositories/{key}/security without
// `instance_locked` LOCKS the proxy scan policy (artifact-keeper#4363), so a
// save from this form re-locked a policy that had been handed back. Harness
// copied from repo-detail-scan-on-proxy.test.tsx, with useMutation running
// its mutationFn so the request that reaches securityApi can be checked.
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

// The stored lock the Security form loads (undefined = not reported).
let storedLock: boolean | undefined = undefined;
let isAdmin = true;
const mockUpdateRepoSecurity = vi.fn();

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
            scan_on_proxy: true,
            block_on_policy_violation: false,
            severity_threshold: "high",
            ...(storedLock === undefined ? {} : { instance_locked: storedLock }),
          },
        },
        isLoading: false,
        isFetching: false,
      };
    }
    return { data: undefined, isLoading: false, isFetching: false };
  },
  useMutation: (opts: { mutationFn?: (v: unknown) => unknown }) => ({
    mutate: (v: unknown) => opts.mutationFn?.(v),
    isPending: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ isAuthenticated: true, user: { is_admin: isAdmin } }),
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
    updateRepoSecurity: (...args: unknown[]) => mockUpdateRepoSecurity(...args),
  },
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

async function saveSecurityTab() {
  render(<RepoDetailContent repoKey="proxy" />);
  await userEvent.click(screen.getByRole("tab", { name: /Security/i }));
  await userEvent.click(screen.getByRole("switch", { name: "Scan on Proxy" }));
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
  expect(mockUpdateRepoSecurity).toHaveBeenCalledTimes(1);
  return mockUpdateRepoSecurity.mock.calls[0][1] as Record<string, unknown>;
}

beforeEach(() => {
  cleanup();
  mockUpdateRepoSecurity.mockReset();
  mockUpdateRepoSecurity.mockResolvedValue({});
  storedLock = undefined;
  isAdmin = true;
});
afterEach(() => cleanup());

describe("Security tab save keeps the instance lock (#1185)", () => {
  it("sends a handed-back lock back as false", async () => {
    storedLock = false;
    const body = await saveSecurityTab();
    expect(body.instance_locked).toBe(false);
    expect(body.scan_on_proxy).toBe(false);
  });

  it("sends a locked policy back as locked", async () => {
    storedLock = true;
    expect((await saveSecurityTab()).instance_locked).toBe(true);
  });

  it("does not send the lock when the backend does not report it", async () => {
    expect(await saveSecurityTab()).not.toHaveProperty("instance_locked");
  });
});
