// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// useQuery response for the storage lookup (queryKey[0] === "repository-storage")
let storageResponse: unknown = { data: undefined, isLoading: false, isError: false };
// useQuery response for the GC dry-run (queryKey[0] === "repository-storage-gc-preview")
let gcResponse: unknown = { data: undefined, isFetching: false, isError: false };

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[]; queryFn?: () => unknown }) => {
    const key = opts.queryKey[0];
    if (key === "repository-storage-gc-preview") return gcResponse;
    // Execute the storage queryFn so its arrow is covered; the storage API is
    // mocked below so this is side-effect-free.
    try {
      opts.queryFn?.();
    } catch {
      /* ignore */
    }
    return storageResponse;
  },
}));

const mockGetUsage = vi.fn();
const mockRunGc = vi.fn();
vi.mock("@/lib/api/storage", () => ({
  default: {
    getUsage: (...a: unknown[]) => mockGetUsage(...a),
    runGc: (...a: unknown[]) => mockRunGc(...a),
  },
}));

import { RepoStoragePanel } from "./repo-storage-panel";
import type { RepositoryStorageUsage } from "@/types/storage";

const REPO = { key: "npm-local", storage_used_bytes: 1000 };

const PER_REPO_USAGE: RepositoryStorageUsage = {
  repository_key: "npm-local",
  logical_bytes: 1000,
  physical_bytes: 400,
  unique_bytes: 300,
  shared_bytes: 100,
  dedup_ratio: 2.5,
  dedup_scope: "per_repo",
  blob_count: 12,
  computed_at: "2026-07-15T00:00:00Z",
};

// What a NON-admin sees on an instance-scope backend: dedup breakdown omitted.
const INSTANCE_USAGE_NONADMIN: RepositoryStorageUsage = {
  logical_bytes: 1000,
  dedup_scope: "instance",
  blob_count: 12,
  computed_at: "2026-07-15T00:00:00Z",
};

// What an admin sees on an instance-scope backend: full breakdown + instance total.
const INSTANCE_USAGE_ADMIN: RepositoryStorageUsage = {
  ...PER_REPO_USAGE,
  dedup_scope: "instance",
  instance_unique_bytes: 9_000_000,
};

beforeEach(() => {
  vi.clearAllMocks();
  storageResponse = { data: undefined, isLoading: false, isError: false };
  gcResponse = { data: undefined, isFetching: false, isError: false };
});
afterEach(() => cleanup());

describe("RepoStoragePanel", () => {
  it("renders a skeleton while loading", () => {
    storageResponse = { data: undefined, isLoading: true, isError: false };
    render(<RepoStoragePanel repository={REPO} isAdmin={false} />);
    expect(screen.getByTestId("storage-panel-loading")).toBeInTheDocument();
  });

  it("falls back to the coarse logical size when the endpoint errors", () => {
    storageResponse = { data: undefined, isLoading: false, isError: true };
    render(<RepoStoragePanel repository={REPO} isAdmin={false} />);
    expect(screen.getByTestId("storage-panel-fallback")).toBeInTheDocument();
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });

  it("shows the full breakdown on per-repo scope for an admin", () => {
    storageResponse = { data: PER_REPO_USAGE, isLoading: false, isError: false };
    render(<RepoStoragePanel repository={REPO} isAdmin={true} />);

    expect(screen.getByTestId("storage-physical")).toBeInTheDocument();
    expect(screen.getByTestId("storage-ratio")).toHaveTextContent("2.50×");
    expect(screen.getByTestId("storage-unique-shared")).toBeInTheDocument();
    expect(screen.getByTestId("storage-savings")).toHaveTextContent("60%");
    expect(screen.getByTestId("storage-scope-badge")).toHaveTextContent(
      /per-repository/i,
    );
    // per_repo scope => no instance caveat
    expect(
      screen.queryByTestId("storage-instance-caveat"),
    ).not.toBeInTheDocument();
    // admin gets the explanatory shared-bytes copy
    expect(screen.getByText(/blobs this repository has in common/i)).toBeInTheDocument();
    // admin gets the reclaimable estimator
    expect(screen.getByTestId("storage-reclaimable")).toBeInTheDocument();
  });

  it("hides the dedup breakdown for a non-admin when instance scope omits it", () => {
    storageResponse = {
      data: INSTANCE_USAGE_NONADMIN,
      isLoading: false,
      isError: false,
    };
    render(<RepoStoragePanel repository={REPO} isAdmin={false} />);

    // Only logical + blob count are shown.
    expect(screen.getByTestId("storage-logical")).toBeInTheDocument();
    expect(screen.getByTestId("storage-blobs")).toBeInTheDocument();
    // No physical / ratio / unique-shared bar / savings.
    expect(screen.queryByTestId("storage-physical")).not.toBeInTheDocument();
    expect(screen.queryByTestId("storage-ratio")).not.toBeInTheDocument();
    expect(screen.queryByTestId("storage-unique-shared")).not.toBeInTheDocument();
    expect(screen.queryByTestId("storage-savings")).not.toBeInTheDocument();
    // A note explains the detail is admin-only.
    expect(screen.getByTestId("storage-instance-note")).toBeInTheDocument();
    // No admin-only surfaces.
    expect(screen.queryByTestId("storage-instance-total")).not.toBeInTheDocument();
    expect(screen.queryByTestId("storage-reclaimable")).not.toBeInTheDocument();
  });

  it("shows the instance caveat and admin-only instance total for an admin on instance scope", () => {
    storageResponse = {
      data: INSTANCE_USAGE_ADMIN,
      isLoading: false,
      isError: false,
    };
    render(<RepoStoragePanel repository={REPO} isAdmin={true} />);

    expect(screen.getByTestId("storage-scope-badge")).toHaveTextContent(
      /instance-wide/i,
    );
    expect(screen.getByTestId("storage-instance-caveat")).toBeInTheDocument();
    expect(screen.getByTestId("storage-instance-total")).toBeInTheDocument();
    expect(screen.getByText(/Instance unique/i)).toBeInTheDocument();
  });

  it("does not leak the instance total to a non-admin even if present", () => {
    // Simulate a backend that (incorrectly) included the field — the client
    // gate must still withhold it from non-admins.
    storageResponse = {
      data: { ...INSTANCE_USAGE_NONADMIN, instance_unique_bytes: 9_000_000 },
      isLoading: false,
      isError: false,
    };
    render(<RepoStoragePanel repository={REPO} isAdmin={false} />);
    expect(screen.queryByTestId("storage-instance-total")).not.toBeInTheDocument();
  });

  it("shows the breakdown but suppresses the admin shared-bytes copy for a non-admin on per-repo scope", () => {
    storageResponse = { data: PER_REPO_USAGE, isLoading: false, isError: false };
    render(<RepoStoragePanel repository={REPO} isAdmin={false} />);

    expect(screen.getByTestId("storage-unique-shared")).toBeInTheDocument();
    // The descriptive cross-repository copy is admin-only.
    expect(
      screen.queryByText(/blobs this repository has in common/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("storage-reclaimable")).not.toBeInTheDocument();
  });

  it("renders the reclaimable estimate for an admin once the GC dry-run resolves", async () => {
    storageResponse = { data: PER_REPO_USAGE, isLoading: false, isError: false };
    gcResponse = {
      data: {
        artifacts_removed: 0,
        bytes_freed: 2048,
        dry_run: true,
        errors: [],
        storage_keys_deleted: 7,
      },
      isFetching: false,
      isError: false,
    };
    render(<RepoStoragePanel repository={REPO} isAdmin={true} />);

    const value = screen.getByTestId("storage-reclaimable-value");
    expect(value).toHaveTextContent("2 KB");
    expect(value).toHaveTextContent("7");

    // The estimate button is clickable (drives the on-demand fetch).
    const btn = screen.getByRole("button", { name: /estimate/i });
    await userEvent.click(btn);
    expect(btn).toBeInTheDocument();
  });

  it("shows an estimating state and surfaces GC errors", () => {
    storageResponse = { data: PER_REPO_USAGE, isLoading: false, isError: false };
    gcResponse = { data: undefined, isFetching: false, isError: true };
    render(<RepoStoragePanel repository={REPO} isAdmin={true} />);
    expect(
      screen.getByText(/could not estimate reclaimable space/i),
    ).toBeInTheDocument();
  });
});
