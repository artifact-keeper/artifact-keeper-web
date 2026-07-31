// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Quarantine admin actions in the artifact detail dialog (#650).
//
// Kept out of repo-detail-content.test.tsx because that suite stubs the
// quarantine components away to focus on the tab strip; here they are rendered
// for real, and the react-query mock actually runs mutation functions so the
// calls reaching `quarantineApi` can be asserted.
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

const repository = {
  id: "11111111-1111-1111-1111-111111111111",
  key: "demo",
  name: "Demo",
  format: "generic",
  repo_type: "local",
  storage_backend: "filesystem",
  versioning_enabled: false,
};

const BASE_ARTIFACT = {
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

// Mutable per-test state driving the react-query mock.
let artifactRow: Record<string, unknown> = { ...BASE_ARTIFACT };
let quarantineStatusData: unknown = undefined;
let isAdmin = true;

interface QueryOpts {
  queryKey: unknown[];
  queryFn?: () => unknown;
  enabled?: boolean;
}
const queryCalls: QueryOpts[] = [];
const mockInvalidate = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: QueryOpts) => {
    queryCalls.push(opts);
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
    if (key === "quarantine-status") {
      return {
        data: opts.enabled ? quarantineStatusData : undefined,
        isLoading: false,
        isFetching: false,
      };
    }
    return { data: undefined, isLoading: false, isFetching: false };
  },
  // Runs the real mutationFn and onSuccess so the API calls and the cache
  // invalidation that follows them are observable.
  useMutation: (config: {
    mutationFn: (vars: unknown) => unknown;
    onSuccess?: (result: unknown, vars: unknown) => void;
    onError?: (err: unknown) => void;
  }) => ({
    mutate: (vars: unknown) => {
      Promise.resolve(config.mutationFn(vars))
        .then((result) => config.onSuccess?.(result, vars))
        .catch((err) => config.onError?.(err));
    },
    isPending: false,
  }),
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ isAuthenticated: true, user: { is_admin: isAdmin } }),
}));

vi.mock("@/providers/system-config-provider", () => ({
  useSystemConfig: () => ({ config: { max_upload_size_bytes: 1_000_000 } }),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  },
}));

const quarantineApiMock = {
  getStatus: vi.fn(),
  release: vi.fn(),
  reject: vi.fn(),
  quarantine: vi.fn(),
};
vi.mock("@/lib/api/quarantine", () => ({
  default: {
    getStatus: (...a: unknown[]) => quarantineApiMock.getStatus(...a),
    release: (...a: unknown[]) => quarantineApiMock.release(...a),
    reject: (...a: unknown[]) => quarantineApiMock.reject(...a),
    quarantine: (...a: unknown[]) => quarantineApiMock.quarantine(...a),
  },
}));

const mockCreateDownloadTicket = vi.fn();
vi.mock("@/lib/api/repositories", () => ({ repositoriesApi: { get: vi.fn() } }));
vi.mock("@/lib/api/artifacts", () => ({
  artifactsApi: {
    listGrouped: vi.fn(),
    getAbsoluteDownloadUrl: () => "http://localhost/download",
    getDownloadUrl: () => "/download",
    createDownloadTicket: (...a: unknown[]) => mockCreateDownloadTicket(...a),
    get: vi.fn(),
    delete: vi.fn(),
    invalidateCache: vi.fn(),
    upload: vi.fn(),
  },
}));
vi.mock("@/lib/api/security", () => ({
  default: { getRepoSecurity: vi.fn(), triggerScan: vi.fn(), updateRepoSecurity: vi.fn() },
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
}));
vi.mock("@/components/common/data-table", () => ({
  DataTable: ({
    data,
    onRowClick,
  }: {
    data?: Array<{ id: string; name: string }>;
    onRowClick?: (row: unknown) => void;
  }) => (
    <div>
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
vi.mock("@/components/common/file-upload", () => ({ FileUpload: () => <div /> }));
vi.mock("@/components/common/copy-button", () => ({ CopyButton: () => <div /> }));

import { RepoDetailContent } from "../repo-detail-content";

const HELD = {
  ...BASE_ARTIFACT,
  is_blocked: true,
  quarantine_status: "quarantined",
  quarantine_reason: "Policy block-critical: 3 critical findings",
  quarantine_until: "2099-01-01T00:00:00Z",
};

async function openDetailDialog() {
  render(<RepoDetailContent repoKey="demo" />);
  await userEvent.click(screen.getByTestId("stub-row-a1"));
}

/**
 * The most recent quarantine-status query. Every render records one, and the
 * first is from before the dialog opened, so only the last describes the
 * dialog's current state.
 */
function quarantineStatusQuery() {
  return queryCalls
    .filter((q) => Array.isArray(q.queryKey) && q.queryKey[0] === "quarantine-status")
    .at(-1);
}

beforeEach(() => {
  vi.clearAllMocks();
  queryCalls.length = 0;
  artifactRow = { ...BASE_ARTIFACT };
  quarantineStatusData = undefined;
  isAdmin = true;
});
afterEach(cleanup);

describe("artifact detail dialog — quarantine banner reachability", () => {
  it("shows the banner for an artifact the listing reports as blocked", async () => {
    artifactRow = HELD;
    await openDetailDialog();

    expect(screen.getByText("This artifact is quarantined")).toBeInTheDocument();
    // Banner and the Quarantine detail row both carry it.
    expect(
      screen.getAllByText("Policy block-critical: 3 critical findings").length,
    ).toBeGreaterThan(0);
  });

  it("shows no banner when the listing reports the artifact as clear", async () => {
    artifactRow = { ...BASE_ARTIFACT, is_blocked: false, quarantine_status: null };
    await openDetailDialog();

    expect(screen.queryByText("This artifact is quarantined")).not.toBeInTheDocument();
    // Already answered by the listing, so no second request for the verdict.
    expect(quarantineStatusQuery()?.enabled).toBe(false);
  });

  it("renders the banner without a reason when the reason was redacted", async () => {
    // Present status, absent reason: the caller cannot access the repository,
    // so the backend withholds the policy detail but not the verdict.
    artifactRow = {
      ...BASE_ARTIFACT,
      is_blocked: true,
      quarantine_status: "quarantined",
      quarantine_until: "2099-01-01T00:00:00Z",
    };
    await openDetailDialog();

    expect(screen.getByText("This artifact is quarantined")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Downloads are blocked until the quarantine is lifted by an administrator.",
      ),
    ).toBeInTheDocument();
    // The Quarantine detail row falls back to the status rather than blanking.
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("uses terminal wording and offers no admin action for a rejected artifact", async () => {
    artifactRow = {
      ...BASE_ARTIFACT,
      is_blocked: true,
      quarantine_status: "rejected",
      quarantine_reason: "Confirmed malware",
      quarantine_until: null,
    };
    await openDetailDialog();

    expect(screen.getByText("This artifact was rejected in review")).toBeInTheDocument();
    // quarantined -> released|rejected is the only legal transition, so both
    // buttons would only ever produce a 409.
    expect(screen.queryByRole("button", { name: "Release" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });
});

describe("artifact detail dialog — absent quarantine state is not a clean bill of health", () => {
  it("looks the verdict up when the response carried no quarantine fields", async () => {
    // The by-path detail endpoint omits all four keys. Absent means the server
    // did not look, so the dialog asks rather than assuming the artifact is
    // fine — the collapse that made the banner dead code in the first place.
    artifactRow = { ...BASE_ARTIFACT };
    await openDetailDialog();

    const statusQuery = quarantineStatusQuery();
    expect(statusQuery?.enabled).toBe(true);
    expect(statusQuery?.queryKey).toEqual(["quarantine-status", "a1"]);
  });

  it("shows the banner once the looked-up status comes back blocked", async () => {
    artifactRow = { ...BASE_ARTIFACT };
    quarantineStatusData = {
      artifact_id: "a1",
      is_blocked: true,
      quarantine_status: "quarantined",
      quarantine_until: null,
      quarantine_reason: "Held by administrator",
    };
    await openDetailDialog();

    expect(screen.getByText("This artifact is quarantined")).toBeInTheDocument();
    expect(screen.getAllByText("Held by administrator").length).toBeGreaterThan(0);
  });

  it("does not disable the download control for an artifact with no verdict", async () => {
    // Unknown is not blocked: the server still enforces the gate, and
    // disabling every download on a surface that never loads quarantine state
    // would break ordinary use.
    artifactRow = { ...BASE_ARTIFACT };
    await openDetailDialog();

    expect(screen.getByRole("button", { name: /^Download$/ })).toBeEnabled();
  });
});

describe("artifact detail dialog — download control for a blocked artifact", () => {
  it("disables the download button and says why", async () => {
    artifactRow = HELD;
    await openDetailDialog();

    const download = screen.getByRole("button", { name: /Download blocked/ });
    expect(download).toBeDisabled();
    expect(download).toHaveAttribute(
      "title",
      "Quarantined pending review. An administrator must release it before it can be downloaded.",
    );
    expect(screen.queryByRole("button", { name: /^Download$/ })).not.toBeInTheDocument();
  });

  it("never reaches the download endpoint for a blocked artifact", async () => {
    artifactRow = HELD;
    await openDetailDialog();

    await userEvent.click(screen.getByRole("button", { name: /Download blocked/ }));
    expect(mockCreateDownloadTicket).not.toHaveBeenCalled();
  });
});

describe("artifact detail dialog — admin gating", () => {
  it("offers release and reject to an admin", async () => {
    artifactRow = HELD;
    await openDetailDialog();

    expect(screen.getByRole("button", { name: "Release" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("offers neither to a non-admin", async () => {
    artifactRow = HELD;
    isAdmin = false;
    await openDetailDialog();

    // The banner still explains the hold; only the actions are withheld.
    expect(screen.getByText("This artifact is quarantined")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Release" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });
});

describe("artifact detail dialog — release and reject", () => {
  it("releases after confirmation and invalidates the affected caches", async () => {
    artifactRow = HELD;
    quarantineApiMock.release.mockResolvedValue({
      artifact_id: "a1",
      new_status: "released",
      message: "Artifact released from quarantine",
    });
    await openDetailDialog();

    await userEvent.click(screen.getByRole("button", { name: "Release" }));
    // Confirmation first: no request goes out on the button click alone.
    expect(quarantineApiMock.release).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(quarantineApiMock.release).toHaveBeenCalledWith("a1"));
    await waitFor(() =>
      expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["artifacts", "demo"] }),
    );
    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["quarantine-status", "a1"],
    });
  });

  it("drops the banner and re-enables the download once released", async () => {
    artifactRow = HELD;
    quarantineApiMock.release.mockResolvedValue({
      artifact_id: "a1",
      new_status: "released",
      message: "ok",
    });
    await openDetailDialog();

    await userEvent.click(screen.getByRole("button", { name: "Release" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(screen.queryByText("This artifact is quarantined")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /^Download$/ })).toBeEnabled();
  });

  it("sends the typed reason with a rejection", async () => {
    artifactRow = HELD;
    quarantineApiMock.reject.mockResolvedValue({
      artifact_id: "a1",
      new_status: "rejected",
      message: "ok",
    });
    await openDetailDialog();

    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    await userEvent.type(
      screen.getByLabelText("Rejection reason"),
      "Confirmed malware",
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(quarantineApiMock.reject).toHaveBeenCalledWith("a1", "Confirmed malware"),
    );
  });

  it("allows a rejection with no reason", async () => {
    artifactRow = HELD;
    quarantineApiMock.reject.mockResolvedValue({
      artifact_id: "a1",
      new_status: "rejected",
      message: "ok",
    });
    await openDetailDialog();

    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(quarantineApiMock.reject).toHaveBeenCalledWith("a1", undefined),
    );
  });

  it("keeps the artifact blocked after a rejection", async () => {
    artifactRow = HELD;
    quarantineApiMock.reject.mockResolvedValue({
      artifact_id: "a1",
      new_status: "rejected",
      message: "ok",
    });
    await openDetailDialog();

    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(
        screen.getByText("This artifact was rejected in review"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Download blocked/ })).toBeDisabled();
  });

  it("surfaces a failed action instead of reporting success", async () => {
    artifactRow = HELD;
    quarantineApiMock.release.mockRejectedValue(
      new Error("API error 403: Admin access required"),
    );
    await openDetailDialog();

    await userEvent.click(screen.getByRole("button", { name: "Release" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(screen.getByText("This artifact is quarantined")).toBeInTheDocument();
  });
});
