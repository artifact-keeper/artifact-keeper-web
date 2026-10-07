// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockListMembers = vi.fn();
vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: {
    listMembers: (...a: unknown[]) => mockListMembers(...a),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    reorderMembers: vi.fn(),
  },
}));
vi.mock("@/hooks/use-repositories", () => ({
  useRepositories: () => ({ data: undefined, isLoading: false }),
}));

import { VirtualMembersPanel, memberTypeLabel } from "./virtual-members-panel";
import type { Repository } from "@/types";

function repo(format: string): Repository {
  return {
    id: "v",
    key: "conda-virtual",
    name: "conda-virtual",
    format,
    repo_type: "virtual",
    is_public: false,
    storage_used_bytes: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as Repository;
}

const MEMBERS = {
  members: [
    // Deliberately out of order: the panel sorts by priority.
    {
      id: "2", virtual_repo_id: "", member_repo_id: "r2", member_repo_key: "conda-forge",
      member_repo_name: "conda-forge proxy", member_repo_type: "remote", priority: 2,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "1", virtual_repo_id: "", member_repo_id: "r1", member_repo_key: "conda-internal",
      member_repo_name: "conda-internal", member_repo_type: "local", priority: 1,
      created_at: "2026-01-01T00:00:00Z",
    },
  ],
};

function renderPanel(format: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <VirtualMembersPanel repository={repo(format)} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  mockListMembers.mockReset();
});

describe("VirtualMembersPanel", () => {
  it("lists members in priority order with their type, hosted first", async () => {
    mockListMembers.mockResolvedValue(MEMBERS);
    renderPanel("conda");
    const first = await screen.findByText("conda-internal");
    const second = screen.getByText("conda-forge");
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const firstRow = first.closest("div.flex.items-center.gap-3") as HTMLElement;
    expect(within(firstRow).getByText("hosted")).toBeInTheDocument();
    expect(within(firstRow).getByText("Priority 1")).toBeInTheDocument();
    // The display name is shown only when it differs from the key.
    expect(screen.getByText("conda-forge proxy")).toBeInTheDocument();
  });

  it("states the name-ownership rule for conda virtual channels", async () => {
    mockListMembers.mockResolvedValue(MEMBERS);
    renderPanel("conda");
    expect(await screen.findByTestId("conda-name-ownership-note")).toHaveTextContent(
      /Hosted members own their package names/,
    );
  });

  it("does not show the conda note for other formats", async () => {
    mockListMembers.mockResolvedValue(MEMBERS);
    renderPanel("npm");
    await screen.findByText("conda-internal");
    expect(screen.queryByTestId("conda-name-ownership-note")).not.toBeInTheDocument();
  });

  it("labels a local member as hosted and leaves other types as sent", () => {
    expect(memberTypeLabel("local")).toBe("hosted");
    expect(memberTypeLabel("remote")).toBe("remote");
  });
});
