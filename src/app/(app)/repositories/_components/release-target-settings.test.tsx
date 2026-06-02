// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Repository } from "@/types";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // Radix Select relies on these in jsdom
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
  (Element.prototype as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = () => false;
  (Element.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
  (Element.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {};
});

afterEach(() => cleanup());

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockList = vi.fn();
const mockSetReleaseTarget = vi.fn();
vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: {
    list: (...args: unknown[]) => mockList(...args),
    setReleaseTarget: (...args: unknown[]) => mockSetReleaseTarget(...args),
  },
}));

vi.mock("@/lib/error-utils", async () => {
  const { toast } = await import("sonner");
  return {
    mutationErrorToast: (label: string) => () => {
      toast.error(label);
    },
  };
});

import { ReleaseTargetSettings } from "./release-target-settings";
import { toast } from "sonner";

function makeRepo(overrides: Partial<Repository> = {}): Repository {
  return {
    id: "stg-1",
    key: "staging-repo",
    name: "Staging Repo",
    description: undefined,
    format: "maven",
    repo_type: "staging",
    is_public: false,
    storage_used_bytes: 0,
    quota_bytes: undefined,
    upstream_url: undefined,
    upstream_auth_type: undefined,
    upstream_auth_configured: false,
    created_at: "2025-01-01",
    updated_at: "2025-01-01",
    ...overrides,
  };
}

function renderWith(repo: Repository) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReleaseTargetSettings repository={repo} />
    </QueryClientProvider>
  );
}

describe("ReleaseTargetSettings non-staging repo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders an informational alert and no picker for a local repo", () => {
    renderWith(makeRepo({ repo_type: "local" }));
    expect(
      screen.getByText(/only available for staging repositories/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("Save release target")).not.toBeInTheDocument();
    // does not query candidates when not staging
    expect(mockList).not.toHaveBeenCalled();
  });

  it("names the current repo type in the alert", () => {
    renderWith(makeRepo({ repo_type: "remote" }));
    expect(screen.getByText("remote")).toBeInTheDocument();
  });
});

describe("ReleaseTargetSettings staging repo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a loading skeleton while candidates load", () => {
    mockList.mockReturnValue(new Promise(() => {}));
    const { container } = renderWith(makeRepo());
    expect(container.querySelector('[data-slot="skeleton"], .h-10')).toBeTruthy();
  });

  it("queries local repos of the matching format", async () => {
    mockList.mockResolvedValue({ items: [], pagination: { page: 1, per_page: 200, total: 0, total_pages: 0 } });
    renderWith(makeRepo({ format: "npm" }));
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(mockList).toHaveBeenCalledWith({ repo_type: "local", format: "npm", per_page: 200 });
  });

  it("shows the empty-state hint when no eligible candidates exist", async () => {
    mockList.mockResolvedValue({ items: [], pagination: { page: 1, per_page: 200, total: 0, total_pages: 0 } });
    renderWith(makeRepo());
    await waitFor(() =>
      expect(screen.getByText(/No eligible release repositories found/i)).toBeInTheDocument()
    );
  });

  it("excludes the staging repo itself from candidate list", async () => {
    mockList.mockResolvedValue({
      items: [
        { ...makeRepo({ id: "stg-1", key: "staging-repo", name: "Staging Repo" }) },
        { ...makeRepo({ id: "rel-1", key: "maven-release", name: "Maven Release", repo_type: "local" }) },
      ],
      pagination: { page: 1, per_page: 200, total: 2, total_pages: 1 },
    });
    renderWith(makeRepo());
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    // self should be filtered out so the empty-state hint must not appear
    await waitFor(() =>
      expect(screen.queryByText(/No eligible release repositories found/i)).not.toBeInTheDocument()
    );
  });

  it("keeps Save disabled until the selection changes", async () => {
    mockList.mockResolvedValue({
      items: [{ ...makeRepo({ id: "rel-1", key: "maven-release", name: "Maven Release", repo_type: "local" }) }],
      pagination: { page: 1, per_page: 200, total: 1, total_pages: 1 },
    });
    renderWith(makeRepo());
    const save = await screen.findByText("Save release target");
    expect(save.closest("button")).toBeDisabled();
  });

  it("saves an empty string to unlink when 'none' is re-selected", async () => {
    mockList.mockResolvedValue({
      items: [{ ...makeRepo({ id: "rel-1", key: "maven-release", name: "Maven Release", repo_type: "local" }) }],
      pagination: { page: 1, per_page: 200, total: 1, total_pages: 1 },
    });
    mockSetReleaseTarget.mockResolvedValue(makeRepo());
    renderWith(makeRepo());

    // Pick a real target first so re-selecting "none" is an actual change that
    // fires Radix's onValueChange and flips `dirty`.
    const trigger = await screen.findByRole("combobox");
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByText(/Maven Release \(maven-release\)/));

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("No release target (unlink)"));

    const save = screen.getByText("Save release target").closest("button")!;
    await waitFor(() => expect(save).not.toBeDisabled());
    fireEvent.click(save);

    await waitFor(() => expect(mockSetReleaseTarget).toHaveBeenCalledWith("staging-repo", ""));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Release target link removed"));
  });

  it("saves the selected key and toasts success", async () => {
    mockList.mockResolvedValue({
      items: [{ ...makeRepo({ id: "rel-1", key: "maven-release", name: "Maven Release", repo_type: "local" }) }],
      pagination: { page: 1, per_page: 200, total: 1, total_pages: 1 },
    });
    mockSetReleaseTarget.mockResolvedValue(makeRepo());
    renderWith(makeRepo());

    const trigger = await screen.findByRole("combobox");
    fireEvent.click(trigger);
    const option = await screen.findByText(/Maven Release \(maven-release\)/);
    fireEvent.click(option);

    const save = screen.getByText("Save release target").closest("button")!;
    await waitFor(() => expect(save).not.toBeDisabled());
    fireEvent.click(save);

    await waitFor(() => expect(mockSetReleaseTarget).toHaveBeenCalledWith("staging-repo", "maven-release"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Release target saved"));
  });

  it("toasts an error when saving fails", async () => {
    mockList.mockResolvedValue({
      items: [{ ...makeRepo({ id: "rel-1", key: "maven-release", name: "Maven Release", repo_type: "local" }) }],
      pagination: { page: 1, per_page: 200, total: 1, total_pages: 1 },
    });
    mockSetReleaseTarget.mockRejectedValue(new Error("nope"));
    renderWith(makeRepo());

    const trigger = await screen.findByRole("combobox");
    fireEvent.click(trigger);
    const option = await screen.findByText(/Maven Release \(maven-release\)/);
    fireEvent.click(option);

    const save = screen.getByText("Save release target").closest("button")!;
    await waitFor(() => expect(save).not.toBeDisabled());
    fireEvent.click(save);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to save release target"));
  });
});
