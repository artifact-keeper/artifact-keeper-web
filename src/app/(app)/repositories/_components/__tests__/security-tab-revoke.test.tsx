// @vitest-environment jsdom
// The by-CVE path of the Security tab (backend artifact-keeper#5224): Reopen
// revokes decisions, and the answer can say that some stay in force.
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { Artifact } from "@/types";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

afterEach(() => cleanup());

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

const sbom = vi.hoisted(() => ({ getCveHistory: vi.fn(), updateCveStatus: vi.fn() }));
vi.mock("@/lib/api/sbom", () => ({ sbomApi: sbom }));

vi.mock("@/lib/api/security", () => ({
  securityApi: {
    listArtifactScans: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  },
}));

vi.mock("@/lib/api/dependency-track", () => ({
  dtApi: {
    getStatus: vi.fn().mockResolvedValue({ enabled: false, healthy: false }),
    listProjects: vi.fn(),
    getProjectMetrics: vi.fn(),
    getProjectFindings: vi.fn(),
    updateAnalysis: vi.fn(),
  },
}));

vi.mock("../artifact-scans-section", () => ({ ArtifactScansSection: () => null }));
vi.mock("../proxy-scan-panel", () => ({ ProxyScanPanel: () => null }));

// Flat menu: the items are what is under test, not Radix's portal.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

import { SecurityTabContent } from "../security-tab-content";

const ARTIFACT = {
  id: "a1",
  repository_key: "libs",
  name: "lib.jar",
  path: "lib.jar",
  version: "1.0",
  size_bytes: 1,
  checksum_sha256: "a".repeat(64),
  content_type: "application/java-archive",
  download_count: 0,
  created_at: "2026-11-01T00:00:00Z",
} as unknown as Artifact;

function cve(over: Record<string, unknown> = {}) {
  return {
    id: "synth-1",
    artifact_id: "a1",
    sbom_id: null,
    component_id: null,
    scan_result_id: null,
    cve_id: "CVE-2024-1",
    affected_component: "openssl",
    affected_version: "1.1",
    fixed_version: null,
    severity: "high",
    cvss_score: null,
    cve_published_at: null,
    first_detected_at: "2026-11-01T00:00:00Z",
    last_detected_at: "2026-11-01T00:00:00Z",
    status: "acknowledged",
    acknowledged_by: null,
    acknowledged_at: null,
    acknowledged_reason: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...over,
  };
}

function renderTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SecurityTabContent artifact={ARTIFACT} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sbom.getCveHistory.mockResolvedValue([cve()]);
});

describe("SecurityTabContent reopen", () => {
  it("is a success when nothing stays in force", async () => {
    sbom.updateCveStatus.mockResolvedValue(
      cve({ status: "open", acknowledgements_left_effective: 0 }),
    );
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /reopen/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("warns, and does not report success, when copies stay in force", async () => {
    sbom.updateCveStatus.mockResolvedValue(
      cve({ status: "open", acknowledgements_left_effective: 1 }),
    );
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /reopen/i }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(toast.warning.mock.calls[0][0]).toMatch(/remains accepted elsewhere/i);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("warns when the answer still reads as acknowledged", async () => {
    sbom.updateCveStatus.mockResolvedValue(
      cve({ status: "acknowledged", acknowledgements_left_effective: 0 }),
    );
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /reopen/i }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("keeps the plain message for an acknowledge", async () => {
    sbom.getCveHistory.mockResolvedValue([cve({ status: "open" })]);
    sbom.updateCveStatus.mockResolvedValue(cve({ status: "acknowledged" }));
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /^acknowledge$/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("CVE status updated"));
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
