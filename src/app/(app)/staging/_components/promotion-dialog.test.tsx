// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StagingArtifact } from "@/types/promotion";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // Radix Select relies on these in jsdom.
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
  (Element.prototype as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = () => false;
  (Element.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
  (Element.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {};
});

afterEach(() => cleanup());

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const mockListReleaseRepos = vi.fn();
const mockPromoteBulk = vi.fn();
vi.mock("@/lib/api/promotion", () => ({
  promotionApi: {
    listReleaseRepos: (...args: unknown[]) => mockListReleaseRepos(...args),
    promoteBulk: (...args: unknown[]) => mockPromoteBulk(...args),
  },
}));

const mockGetReleaseTarget = vi.fn();
vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: {
    getReleaseTarget: (...args: unknown[]) => mockGetReleaseTarget(...args),
  },
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ user: { is_admin: false } }),
}));

vi.mock("@/lib/error-utils", async () => {
  const { toast } = await import("sonner");
  return { mutationErrorToast: (label: string) => () => toast.error(label) };
});

// Not under test here; keep the dialog logic isolated.
vi.mock("./artifact-list-preview", () => ({ ArtifactListPreview: () => null }));

import { PromotionDialog } from "./promotion-dialog";

const UNLINKED = { linked: false, release_repository_key: null, release_repository_id: null };
const LINKED = { linked: true, release_repository_key: "maven-release", release_repository_id: "rel-1" };

const releaseRepo = {
  id: "rel-1",
  key: "maven-release",
  name: "Maven Release",
  format: "maven",
  repo_type: "local",
  is_public: true,
  storage_used_bytes: 0,
  created_at: "2025-01-01",
  updated_at: "2025-01-01",
};

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PromotionDialog
        open
        onOpenChange={() => {}}
        sourceRepoKey="stg"
        sourceRepoFormat="maven"
        selectedArtifacts={[{ id: "a1", name: "art-1.0.0" } as StagingArtifact]}
      />
    </QueryClientProvider>
  );
}

describe("PromotionDialog release-target linking (#658)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListReleaseRepos.mockResolvedValue({
      items: [releaseRepo],
      pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
    });
    mockPromoteBulk.mockResolvedValue({ promoted: 1, total: 1, failed: 0 });
  });

  it("locks the target to the linked release repo and promotes to it", async () => {
    mockGetReleaseTarget.mockResolvedValue(LINKED);
    renderDialog();

    // Locked: shows the linked repo + badge, and no free-choice picker.
    expect(await screen.findByText("Linked release target")).toBeInTheDocument();
    expect(screen.getByText("maven-release")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Promote" }));

    await waitFor(() =>
      expect(mockPromoteBulk).toHaveBeenCalledWith(
        "stg",
        expect.objectContaining({ target_repository: "maven-release", artifact_ids: ["a1"] })
      )
    );
  });

  it("falls back to the free picker when no target is linked", async () => {
    mockGetReleaseTarget.mockResolvedValue(UNLINKED);
    renderDialog();

    const combo = await screen.findByRole("combobox");
    expect(screen.queryByText("Linked release target")).not.toBeInTheDocument();

    fireEvent.click(combo);
    fireEvent.click(await screen.findByText(/maven-release \(Maven Release\)/));
    fireEvent.click(screen.getByRole("button", { name: "Promote" }));

    await waitFor(() =>
      expect(mockPromoteBulk).toHaveBeenCalledWith(
        "stg",
        expect.objectContaining({ target_repository: "maven-release" })
      )
    );
  });
});

describe("PromotionDialog gate results (conda walkthrough)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReleaseTarget.mockResolvedValue(LINKED);
  });

  it("keeps the dialog open with each rule's decision when an artifact is refused", async () => {
    mockPromoteBulk.mockResolvedValue({
      total: 2,
      promoted: 1,
      failed: 1,
      results: [
        {
          promoted: true,
          source: "conda-staging/noarch/acme-report-1.0.0-py_0.conda",
          target: "conda-internal/noarch/acme-report-1.0.0-py_0.conda",
          policy_violations: [],
          gate_results: [
            { rule: "attestation", passed: true, reason: "verified with key SHA256:k" },
            { rule: "vulnerability_scan", passed: true },
          ],
        },
        {
          promoted: false,
          source: "conda-staging/noarch/acme-unsigned-1.0.0-py_0.conda",
          target: "conda-internal/noarch/acme-unsigned-1.0.0-py_0.conda",
          policy_violations: [],
          gate_results: [{ rule: "attestation", passed: false, reason: "no attestation stored" }],
        },
      ],
    });
    renderDialog();
    await screen.findByText("Linked release target");
    fireEvent.click(screen.getByRole("button", { name: "Promote" }));

    expect(await screen.findByText("Promotion result")).toBeInTheDocument();
    expect(screen.getByText("Refused")).toBeInTheDocument();
    expect(screen.getByText(/no attestation stored/)).toBeInTheDocument();
    expect(screen.getAllByText("Verified attestation")).toHaveLength(2);
  });

  it("falls back to the server message when gate_results is absent", async () => {
    mockPromoteBulk.mockResolvedValue({
      total: 1,
      promoted: 0,
      failed: 1,
      results: [
        {
          promoted: false,
          source: "stg/a",
          target: "maven-release/a",
          policy_violations: [],
          message: "Promotion blocked by policy violations",
        },
      ],
    });
    renderDialog();
    await screen.findByText("Linked release target");
    fireEvent.click(screen.getByRole("button", { name: "Promote" }));
    expect(await screen.findByText("Promotion blocked by policy violations")).toBeInTheDocument();
  });

  it("lists each blocked artifact's violations with rule and severity (#917)", async () => {
    mockPromoteBulk.mockResolvedValue({
      total: 2,
      promoted: 1,
      failed: 1,
      results: [
        { promoted: true, source: "stg/a", target: "rel/a", policy_violations: [] },
        {
          promoted: false,
          source: "stg/b",
          target: "rel/b",
          message: "Promotion blocked by policy violations",
          policy_violations: [
            { rule: "policy-predicate", severity: "high", message: "channel conda-forge is not allowed" },
            { rule: "cve", severity: "critical", message: "CVE-2026-0001" },
          ],
        },
      ],
    });
    renderDialog();
    await screen.findByText("Linked release target");
    fireEvent.click(screen.getByRole("button", { name: "Promote" }));
    const list = await screen.findByTestId("promotion-violations");
    expect(list).toHaveTextContent("high");
    expect(list).toHaveTextContent("Scan policy predicate: channel conda-forge is not allowed");
    expect(list).toHaveTextContent("critical");
    expect(screen.getByText("Promoted")).toBeInTheDocument();
    expect(screen.getByText("Refused")).toBeInTheDocument();
    expect(screen.getByText(/Promoted 1 of 2/)).toBeInTheDocument();
  });
});
