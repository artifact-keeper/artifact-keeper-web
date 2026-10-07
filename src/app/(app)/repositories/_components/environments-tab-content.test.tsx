// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockList = vi.fn();
const mockLookup = vi.fn();
const mockGenerate = vi.fn();
const mockRegister = vi.fn();
const mockDownload = vi.fn();
vi.mock("@/lib/download", () => ({
  triggerBrowserDownload: (...a: unknown[]) => mockDownload(...a),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const mockTransitions = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/api/environments", () => ({
  environmentsApi: {
    list: (...a: unknown[]) => mockList(...a),
    lookup: (...a: unknown[]) => mockLookup(...a),
    generateSbom: (...a: unknown[]) => mockGenerate(...a),
    register: (...a: unknown[]) => mockRegister(...a),
    transitions: (...a: unknown[]) => mockTransitions(...a),
  },
}));

import { EnvironmentsTabContent } from "./environments-tab-content";
import { ApiError } from "@/lib/api/fetch";

function renderTab(canRegister = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EnvironmentsTabContent repoKey="conda-internal" canRegister={canRegister} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockTransitions.mockResolvedValue([]);
});

describe("EnvironmentsTabContent", () => {
  it("lists registered environments", async () => {
    mockList.mockResolvedValue([
      { id: "e1", name: "report-app", lockfileFormat: "pixi.lock", distinctPackages: 57, scopes: 2 },
    ]);
    renderTab();
    expect(await screen.findByText("report-app")).toBeInTheDocument();
    expect(screen.getByText("pixi.lock")).toBeInTheDocument();
    expect(screen.getByText("57")).toBeInTheDocument();
  });

  it("looks a PURL up across environments and shows what pulls it in", async () => {
    mockList.mockResolvedValue([]);
    mockLookup.mockResolvedValue({
      purl: "pkg:conda/acme-core@0.1.0",
      truncated: false,
      hits: [
        {
          environment: { id: "e1", name: "report-app" },
          repository: { key: "conda-internal" },
          scope: { environment: "default", platform: "linux-64" },
          package: { name: "acme-core", version: "0.1.0" },
          paths: [["acme-report@1.0.0", "acme-core@0.1.0"]],
        },
      ],
    });
    renderTab();
    fireEvent.change(screen.getByLabelText("Package URL"), {
      target: { value: "pkg:conda/acme-core@0.1.0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Look up/ }));
    expect(await screen.findByText("acme-report@1.0.0 → acme-core@0.1.0")).toBeInTheDocument();
    expect(mockLookup).toHaveBeenCalledWith("pkg:conda/acme-core@0.1.0");
  });

  it("says the feature needs a newer backend when the route is missing", async () => {
    mockList.mockRejectedValue(new ApiError(404, ""));
    renderTab();
    expect(await screen.findByText(/need backend 1.11.0/)).toBeInTheDocument();
  });

  it("generates per-scope SBOMs from a lockfile and downloads one (#912)", async () => {
    mockList.mockResolvedValue([]);
    mockGenerate.mockResolvedValue({
      lockfile: "pixi.lock",
      sbomFormat: "cyclonedx",
      graphs: [{ environment: "default", platform: "linux-64", document: { bomFormat: "CycloneDX" } }],
    });
    renderTab();
    const file = new File(["version: 6"], "pixi.lock");
    fireEvent.change(screen.getByLabelText("File"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /Generate SBOM/ }));
    const btn = await screen.findByRole("button", { name: /default \/ linux-64/ });
    expect(mockGenerate).toHaveBeenCalledWith("pixi.lock", "version: 6", "cyclonedx");
    fireEvent.click(btn);
    expect(mockDownload).toHaveBeenCalledWith(
      "pixi.lock.default.linux-64.cdx.json",
      expect.stringContaining("CycloneDX"),
      "application/json",
    );
    expect(screen.queryByRole("button", { name: /Register environment/ })).toBeNull();
  });

  it("registers a lockfile as an environment when allowed", async () => {
    mockList.mockResolvedValue([]);
    mockRegister.mockResolvedValue({ id: "e1", replaced: false });
    renderTab(true);
    fireEvent.change(screen.getByLabelText("File"), {
      target: { files: [new File(["x"], "pixi.lock")] },
    });
    fireEvent.change(screen.getByLabelText("Environment name"), { target: { value: "report-app" } });
    fireEvent.click(screen.getByRole("button", { name: /Register environment/ }));
    await vi.waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith("conda-internal", "pixi.lock", "x", "report-app"),
    );
  });

  it("shows this repository's advisory transitions (#919)", async () => {
    mockList.mockResolvedValue([]);
    mockTransitions.mockResolvedValue([
      {
        environment: { id: "e1", name: "report-app" },
        repository: { key: "conda-internal" },
        advisory: { id: "GHSA-aaaa-bbbb-cccc", severity: "high", fixedVersion: "1.0.1" },
        package: { name: "acme-core", version: "1.0.0" },
        kind: "new-affected",
        detectedAt: "2026-10-07T00:00:00Z",
      },
      {
        environment: { id: "e9", name: "elsewhere" },
        repository: { key: "other-repo" },
        advisory: { id: "GHSA-zzzz" },
        package: { name: "x" },
        kind: "no-longer-affected",
      },
    ]);
    renderTab();
    expect(await screen.findByText("Newly affected")).toBeInTheDocument();
    expect(screen.getByText("GHSA-aaaa-bbbb-cccc")).toBeInTheDocument();
    expect(screen.queryByText("elsewhere")).toBeNull();
  });
});
