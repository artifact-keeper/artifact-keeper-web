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
});

afterEach(() => cleanup());

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockGet = vi.fn();
const mockSet = vi.fn();
vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: {
    getUpstreamMode: (...args: unknown[]) => mockGet(...args),
    setUpstreamMode: (...args: unknown[]) => mockSet(...args),
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

import { UpstreamModeSettings } from "./upstream-mode-settings";
import { toast } from "sonner";

const mode = (upstream_mode: string, effective_upstream_mode = upstream_mode) => ({
  repository_key: "npm-remote",
  upstream_mode,
  effective_upstream_mode,
});

function makeRepo(overrides: Partial<Repository> = {}): Repository {
  return {
    id: "r1",
    key: "npm-remote",
    name: "NPM Remote",
    format: "npm",
    repo_type: "remote",
    is_public: false,
    storage_used_bytes: 0,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

function renderWith(repo: Repository, canEdit = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UpstreamModeSettings repository={repo} canEdit={canEdit} />
    </QueryClientProvider>,
  );
}

describe("UpstreamModeSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing and reads nothing for a non-Remote", () => {
    const { container } = renderWith(makeRepo({ repo_type: "local" }));
    expect(container).toBeEmptyDOMElement();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("hides the section on a backend without upstream mode", async () => {
    mockGet.mockResolvedValue(null);
    const { container } = renderWith(makeRepo());
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("npm-remote"));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("hides the section when the mode cannot be read", async () => {
    mockGet.mockRejectedValue(new Error("API error 500: "));
    const { container } = renderWith(makeRepo());
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows the stored mode on the switch and the effective mode", async () => {
    mockGet.mockResolvedValue(mode("cache_only"));
    renderWith(makeRepo());
    const toggle = await screen.findByRole("switch", { name: "Cache-only" });
    expect(toggle).toBeChecked();
    expect(screen.getByTestId("effective-upstream-mode")).toHaveTextContent("Cache-only");
    expect(screen.queryByText(/PROXY_UPSTREAM_MODE/)).not.toBeInTheDocument();
  });

  it("says when the instance forces cache-only mode over an online setting", async () => {
    mockGet.mockResolvedValue(mode("online", "cache_only"));
    renderWith(makeRepo());
    const toggle = await screen.findByRole("switch", { name: "Cache-only" });
    expect(toggle).not.toBeChecked();
    expect(screen.getByTestId("effective-upstream-mode")).toHaveTextContent("Cache-only");
    expect(screen.getByText(/set by the instance/)).toBeInTheDocument();
    expect(screen.getByText("PROXY_UPSTREAM_MODE=cache_only")).toBeInTheDocument();
  });

  it("does not let a non-administrator switch it", async () => {
    mockGet.mockResolvedValue(mode("online"));
    renderWith(makeRepo(), false);
    const toggle = await screen.findByRole("switch", { name: "Cache-only" });
    expect(toggle).toBeDisabled();
    expect(screen.getByText(/only a repository administrator/i)).toBeInTheDocument();
  });

  it("asks before making the Remote cache-only, and sends nothing on cancel", async () => {
    mockGet.mockResolvedValue(mode("online"));
    renderWith(makeRepo());
    fireEvent.click(await screen.findByRole("switch", { name: "Cache-only" }));

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/every cache miss returns 404/)).toBeInTheDocument();
    expect(mockSet).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mockSet).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: "Cache-only" })).not.toBeChecked();
  });

  it("sets cache-only mode on confirm and shows the result", async () => {
    mockGet.mockResolvedValue(mode("online"));
    mockSet.mockResolvedValue(mode("cache_only"));
    renderWith(makeRepo());
    fireEvent.click(await screen.findByRole("switch", { name: "Cache-only" }));
    fireEvent.click(await screen.findByRole("button", { name: "Make cache-only" }));

    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("npm-remote", "cache_only"));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Cache-only" })).toBeChecked());
    expect(screen.getByTestId("effective-upstream-mode")).toHaveTextContent("Cache-only");
    expect(toast.success).toHaveBeenCalledWith("Repository is now cache-only");
  });

  it("puts a cache-only Remote back online on confirm", async () => {
    mockGet.mockResolvedValue(mode("cache_only"));
    mockSet.mockResolvedValue(mode("online"));
    renderWith(makeRepo());
    fireEvent.click(await screen.findByRole("switch", { name: "Cache-only" }));
    fireEvent.click(await screen.findByRole("button", { name: "Put online" }));

    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("npm-remote", "online"));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Cache-only" })).not.toBeChecked());
  });

  it("keeps the switch as it was when the change is refused", async () => {
    mockGet.mockResolvedValue(mode("online"));
    mockSet.mockRejectedValue(new Error("API error 403: "));
    renderWith(makeRepo());
    fireEvent.click(await screen.findByRole("switch", { name: "Cache-only" }));
    fireEvent.click(await screen.findByRole("button", { name: "Make cache-only" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to change the upstream mode"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByRole("switch", { name: "Cache-only" })).not.toBeChecked();
  });

  it("keeps the confirmation open while the change is in flight", async () => {
    mockGet.mockResolvedValue(mode("online"));
    mockSet.mockReturnValue(new Promise(() => {}));
    renderWith(makeRepo());
    fireEvent.click(await screen.findByRole("switch", { name: "Cache-only" }));
    fireEvent.click(await screen.findByRole("button", { name: "Make cache-only" }));
    await waitFor(() => expect(mockSet).toHaveBeenCalled());

    const dialog = screen.getByRole("alertdialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
