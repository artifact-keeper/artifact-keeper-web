// @vitest-environment jsdom
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
});

afterEach(() => cleanup());

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockList = vi.fn();
vi.mock("@/lib/api/versions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/versions")>(
    "@/lib/api/versions"
  );
  return {
    ...actual,
    versionsApi: {
      list: (...args: unknown[]) => mockList(...args),
    },
  };
});

const mockCreateTicket = vi.fn();
vi.mock("@/lib/api/artifacts", () => ({
  artifactsApi: {
    createDownloadTicket: (...args: unknown[]) => mockCreateTicket(...args),
  },
}));

// Render tooltips as plain children so the table is queryable without Radix.
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span className="tooltip-content">{children}</span>
  ),
}));

import { ArtifactVersionsSection, shortChecksum } from "./artifact-versions-section";

const artifact: Artifact = {
  id: "art-1",
  repository_key: "configs",
  path: "team/app/config.yaml",
  name: "config.yaml",
  size_bytes: 2048,
  checksum_sha256: "b".repeat(64),
  content_type: "application/x-yaml",
  download_count: 5,
  created_at: "2026-07-10T12:00:00Z",
};

const V2 = {
  revision: 2,
  version_label: "v2.0",
  size_bytes: 2048,
  checksum_sha256: "b".repeat(64),
  content_type: "application/x-yaml",
  uploaded_by: null,
  created_at: "2026-07-10T12:00:00Z",
};

const V1 = {
  revision: 1,
  version_label: null,
  size_bytes: 1024,
  checksum_sha256: "a".repeat(64),
  content_type: "application/x-yaml",
  uploaded_by: null,
  created_at: "2026-07-01T09:00:00Z",
};

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ArtifactVersionsSection repoKey="configs" artifact={artifact} />
    </QueryClientProvider>
  );
}

describe("ArtifactVersionsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders one row per revision, newest first, with label and latest badges", async () => {
    mockList.mockResolvedValue({
      repository_key: "configs",
      path: artifact.path,
      items: [V2, V1],
    });
    renderSection();

    const rows = await screen.findAllByTestId("artifact-version-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("2");
    expect(rows[0]).toHaveTextContent("v2.0");
    expect(rows[0]).toHaveTextContent("latest");
    expect(rows[1]).toHaveTextContent("1");
    expect(rows[1]).not.toHaveTextContent("latest");
    expect(mockList).toHaveBeenCalledWith("configs", "team/app/config.yaml");
  });

  it("shows a short checksum with the full value available as title", async () => {
    mockList.mockResolvedValue({
      repository_key: "configs",
      path: artifact.path,
      items: [V1],
    });
    renderSection();

    const cell = await screen.findByTitle("a".repeat(64));
    expect(cell).toHaveTextContent(`${"a".repeat(12)}…`);
  });

  it("hides the uploader column when no revision carries uploaded_by", async () => {
    mockList.mockResolvedValue({
      repository_key: "configs",
      path: artifact.path,
      items: [V2, V1],
    });
    renderSection();

    await screen.findAllByTestId("artifact-version-row");
    expect(screen.queryByText("Uploaded by")).not.toBeInTheDocument();
  });

  it("shows the uploader column when the backend provides uploaded_by", async () => {
    mockList.mockResolvedValue({
      repository_key: "configs",
      path: artifact.path,
      items: [{ ...V2, uploaded_by: "user-1" }, V1],
    });
    renderSection();

    await screen.findAllByTestId("artifact-version-row");
    expect(screen.getByText("Uploaded by")).toBeInTheDocument();
    expect(screen.getByText("user-1")).toBeInTheDocument();
    // Rows without the field render the placeholder.
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });

  it("renders the empty state when there is no recorded history", async () => {
    mockList.mockResolvedValue({
      repository_key: "configs",
      path: artifact.path,
      items: [],
    });
    renderSection();

    expect(
      await screen.findByTestId("artifact-versions-empty")
    ).toHaveTextContent(/no version history recorded/i);
  });

  it("renders an error state when the query fails", async () => {
    mockList.mockRejectedValue(new Error("API error 500: boom"));
    renderSection();

    expect(
      await screen.findByTestId("artifact-versions-error")
    ).toHaveTextContent(/unavailable/i);
  });

  it("downloads a pinned revision with a ticket appended to the ?version= URL", async () => {
    mockList.mockResolvedValue({
      repository_key: "configs",
      path: artifact.path,
      items: [V2, V1],
    });
    mockCreateTicket.mockResolvedValue("tkt-123");

    const clicks: string[] = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicks.push(this.getAttribute("href") ?? "");
    };

    try {
      renderSection();
      const btn = await screen.findByRole("button", {
        name: /download revision 1/i,
      });
      fireEvent.click(btn);

      await waitFor(() => expect(clicks).toHaveLength(1));
      expect(clicks[0]).toBe(
        "/api/v1/repositories/configs/download/team/app/config.yaml?version=1&ticket=tkt-123"
      );
      expect(mockCreateTicket).toHaveBeenCalledWith(
        "configs",
        "team/app/config.yaml"
      );
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });

  it("falls back to a ticketless ?version= URL when the ticket cannot be issued", async () => {
    mockList.mockResolvedValue({
      repository_key: "configs",
      path: artifact.path,
      items: [V2],
    });
    mockCreateTicket.mockRejectedValue(new Error("401"));

    const clicks: string[] = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicks.push(this.getAttribute("href") ?? "");
    };

    try {
      renderSection();
      const btn = await screen.findByRole("button", {
        name: /download revision 2/i,
      });
      fireEvent.click(btn);

      await waitFor(() => expect(clicks).toHaveLength(1));
      expect(clicks[0]).toBe(
        "/api/v1/repositories/configs/download/team/app/config.yaml?version=2"
      );
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});

describe("shortChecksum", () => {
  it("truncates long digests and passes short values through", () => {
    expect(shortChecksum("c".repeat(64))).toBe(`${"c".repeat(12)}…`);
    expect(shortChecksum("abc123")).toBe("abc123");
  });
});
