// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockGetRepository = vi.fn();
vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: { get: (...args: unknown[]) => mockGetRepository(...args) },
}));

import { ArtifactOriginSection, originKindLabel } from "./artifact-origin-section";
import type { ArtifactOrigin } from "@/types";

function renderSection(origin: ArtifactOrigin | null | undefined, current = "libs-release") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ArtifactOriginSection origin={origin} currentRepositoryKey={current} />
    </QueryClientProvider>,
  );
}

describe("ArtifactOriginSection (#914)", () => {
  beforeEach(() => {
    mockGetRepository.mockReset();
  });
  afterEach(() => cleanup());

  it("renders nothing without an origin (listing row or older backend)", () => {
    const { container: nullOrigin } = renderSection(null);
    expect(nullOrigin).toBeEmptyDOMElement();
    cleanup();
    const { container: absent } = renderSection(undefined);
    expect(absent).toBeEmptyDOMElement();
    expect(mockGetRepository).not.toHaveBeenCalled();
  });

  it("describes a hosted upload into the current repository without 'originally from'", () => {
    renderSection({ kind: "hosted", raw_kind: "hosted", repository_key: "libs-release" });
    const section = screen.getByTestId("artifact-origin");
    expect(section).toHaveTextContent("Origin");
    expect(section).toHaveTextContent("Uploaded");
    expect(section).toHaveTextContent("libs-release (this repository)");
    expect(section).not.toHaveTextContent("Originally from");
    expect(screen.queryByText("Upstream")).toBeNull();
    // No lookup of the current repository is needed.
    expect(mockGetRepository).not.toHaveBeenCalled();
  });

  it("labels a promoted copy as originally from its source repository and links it when reachable", async () => {
    mockGetRepository.mockResolvedValue({ key: "libs-staging" });
    renderSection({
      kind: "migration",
      raw_kind: "migration",
      repository_key: "libs-staging",
      upstream_url: "https://artifactory.example.com/artifactory",
    });
    const section = screen.getByTestId("artifact-origin");
    expect(section).toHaveTextContent("Imported by a migration");
    expect(section).toHaveTextContent("Originally from libs-staging");
    expect(section).not.toHaveTextContent("this repository");
    expect(screen.getByText("https://artifactory.example.com/artifactory")).toBeInTheDocument();
    const link = await screen.findByRole("link", { name: "libs-staging" });
    expect(link).toHaveAttribute("href", "/repositories/libs-staging");
    expect(mockGetRepository).toHaveBeenCalledWith("libs-staging");
  });

  it("keeps the source repository as plain text when the viewer cannot open it", async () => {
    mockGetRepository.mockRejectedValue({ error: "not found" });
    renderSection({ kind: "hosted", raw_kind: "hosted", repository_key: "secret-repo" });
    await waitFor(() => expect(mockGetRepository).toHaveBeenCalled());
    expect(screen.getByTestId("artifact-origin")).toHaveTextContent(
      "Originally from secret-repo",
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders an unrecognised kind as the raw value the backend sent", () => {
    renderSection({ kind: "unknown", raw_kind: "replication", repository_key: "libs-release" });
    expect(screen.getByTestId("artifact-origin")).toHaveTextContent("replication");
  });

  it("has a human label for every modelled kind", () => {
    const base = { repository_key: "r" };
    expect(originKindLabel({ ...base, kind: "hosted", raw_kind: "hosted" })).toBe("Uploaded");
    expect(originKindLabel({ ...base, kind: "proxy", raw_kind: "proxy" })).toBe(
      "Fetched from upstream through a proxy",
    );
    expect(originKindLabel({ ...base, kind: "virtual", raw_kind: "virtual" })).toBe(
      "Stored in a virtual repository",
    );
    expect(originKindLabel({ ...base, kind: "migration", raw_kind: "migration" })).toBe(
      "Imported by a migration",
    );
  });
});
