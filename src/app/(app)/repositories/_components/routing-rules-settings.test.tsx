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

const mockGetRoutingRules = vi.fn();
const mockSetRoutingRules = vi.fn();
const mockDeleteRoutingRules = vi.fn();
vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: {
    getRoutingRules: (...args: unknown[]) => mockGetRoutingRules(...args),
    setRoutingRules: (...args: unknown[]) => mockSetRoutingRules(...args),
    deleteRoutingRules: (...args: unknown[]) => mockDeleteRoutingRules(...args),
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

import { RoutingRulesSettings } from "./routing-rules-settings";
import { toast } from "sonner";

const repo: Repository = {
  id: "r1",
  key: "npm-proxy",
  name: "NPM Proxy",
  description: undefined,
  format: "npm",
  repo_type: "remote",
  is_public: false,
  storage_used_bytes: 0,
  quota_bytes: undefined,
  upstream_url: "https://registry.npmjs.org/",
  upstream_auth_type: undefined,
  upstream_auth_configured: false,
  created_at: "2025-01-01",
  updated_at: "2025-01-01",
};

function renderWith() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RoutingRulesSettings repository={repo} />
    </QueryClientProvider>
  );
}

describe("RoutingRulesSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows skeletons while rules are loading", () => {
    mockGetRoutingRules.mockReturnValue(new Promise(() => {}));
    const { container } = renderWith();
    expect(container.querySelectorAll(".h-10").length).toBeGreaterThan(0);
  });

  it("renders the empty state when there are no rules", async () => {
    mockGetRoutingRules.mockResolvedValue({ repository_key: "npm-proxy", rules: [] });
    renderWith();
    expect(await screen.findByText(/No routing rules configured/i)).toBeInTheDocument();
  });

  // Helper: the editable table is populated from a save response (the
  // component does not seed it from the initial server fetch while a length
  // mismatch keeps the local copy "dirty"). Adding a rule via the mutation is
  // the reliable way to get rows into the table.
  async function addRule(pattern: string, rewrite: string, returnedRules: { path_pattern: string; rewrite_to: string }[]) {
    mockSetRoutingRules.mockResolvedValueOnce({ repository_key: "npm-proxy", rules: returnedRules });
    fireEvent.change(screen.getByLabelText("Path pattern"), { target: { value: pattern } });
    fireEvent.change(screen.getByLabelText("Rewrite to"), { target: { value: rewrite } });
    fireEvent.click(screen.getByText("Add rule").closest("button")!);
  }

  it("populates the editable table from a save response", async () => {
    mockGetRoutingRules.mockResolvedValue({ repository_key: "npm-proxy", rules: [] });
    renderWith();
    await screen.findByText(/No routing rules configured/i);

    await addRule("releases/(.+)", "download/$1", [
      { path_pattern: "releases/(.+)", rewrite_to: "download/$1" },
    ]);

    expect(await screen.findByLabelText("Rule 1 path pattern")).toHaveValue("releases/(.+)");
    expect(screen.getByLabelText("Rule 1 rewrite to")).toHaveValue("download/$1");
  });

  it("disables Add while the draft fields are empty", async () => {
    mockGetRoutingRules.mockResolvedValue({ repository_key: "npm-proxy", rules: [] });
    renderWith();
    const addBtn = (await screen.findByText("Add rule")).closest("button")!;
    expect(addBtn).toBeDisabled();
  });

  it("shows a validation error when the regex is invalid", async () => {
    mockGetRoutingRules.mockResolvedValue({ repository_key: "npm-proxy", rules: [] });
    renderWith();
    await screen.findByText(/No routing rules configured/i);

    fireEvent.change(screen.getByLabelText("Path pattern"), { target: { value: "(" } });
    fireEvent.change(screen.getByLabelText("Rewrite to"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Add rule").closest("button")!);

    expect(
      await screen.findByText(/not a valid regular expression/i)
    ).toBeInTheDocument();
    expect(mockSetRoutingRules).not.toHaveBeenCalled();
  });

  it("clears the validation error when the pattern is edited", async () => {
    mockGetRoutingRules.mockResolvedValue({ repository_key: "npm-proxy", rules: [] });
    renderWith();
    await screen.findByText(/No routing rules configured/i);

    fireEvent.change(screen.getByLabelText("Path pattern"), { target: { value: "(" } });
    fireEvent.change(screen.getByLabelText("Rewrite to"), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Add rule").closest("button")!);
    expect(await screen.findByText(/not a valid regular expression/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Path pattern"), { target: { value: "valid/(.+)" } });
    expect(screen.queryByText(/not a valid regular expression/i)).not.toBeInTheDocument();
  });

  it("adds a valid rule and toasts success", async () => {
    mockGetRoutingRules.mockResolvedValue({ repository_key: "npm-proxy", rules: [] });
    mockSetRoutingRules.mockResolvedValue({
      repository_key: "npm-proxy",
      rules: [{ path_pattern: "releases/(.+)", rewrite_to: "download/$1" }],
    });
    renderWith();
    await screen.findByText(/No routing rules configured/i);

    fireEvent.change(screen.getByLabelText("Path pattern"), { target: { value: " releases/(.+) " } });
    fireEvent.change(screen.getByLabelText("Rewrite to"), { target: { value: " download/$1 " } });
    fireEvent.click(screen.getByText("Add rule").closest("button")!);

    await waitFor(() =>
      expect(mockSetRoutingRules).toHaveBeenCalledWith("npm-proxy", [
        { path_pattern: "releases/(.+)", rewrite_to: "download/$1" },
      ])
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Routing rule added"));
  });

  it("removing the only rule clears all rules", async () => {
    mockGetRoutingRules.mockResolvedValue({ repository_key: "npm-proxy", rules: [] });
    mockDeleteRoutingRules.mockResolvedValue(undefined);
    renderWith();
    await screen.findByText(/No routing rules configured/i);

    await addRule("a/(.+)", "b/$1", [{ path_pattern: "a/(.+)", rewrite_to: "b/$1" }]);
    const removeBtn = await screen.findByLabelText("Remove rule 1");
    fireEvent.click(removeBtn);

    await waitFor(() => expect(mockDeleteRoutingRules).toHaveBeenCalledWith("npm-proxy"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Routing rules cleared"));
  });

  it("removing one of several rules saves the remaining set", async () => {
    mockGetRoutingRules.mockResolvedValue({ repository_key: "npm-proxy", rules: [] });
    renderWith();
    await screen.findByText(/No routing rules configured/i);

    await addRule("a/(.+)", "b/$1", [
      { path_pattern: "a/(.+)", rewrite_to: "b/$1" },
      { path_pattern: "c/(.+)", rewrite_to: "d/$1" },
    ]);
    await screen.findByLabelText("Remove rule 2");

    mockSetRoutingRules.mockResolvedValueOnce({
      repository_key: "npm-proxy",
      rules: [{ path_pattern: "c/(.+)", rewrite_to: "d/$1" }],
    });
    fireEvent.click(screen.getByLabelText("Remove rule 1"));

    await waitFor(() =>
      expect(mockSetRoutingRules).toHaveBeenLastCalledWith("npm-proxy", [
        { path_pattern: "c/(.+)", rewrite_to: "d/$1" },
      ])
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Routing rule removed"));
  });

  it("editing a rule shows Save changes and saves edits", async () => {
    mockGetRoutingRules.mockResolvedValue({ repository_key: "npm-proxy", rules: [] });
    renderWith();
    await screen.findByText(/No routing rules configured/i);

    await addRule("a/(.+)", "b/$1", [{ path_pattern: "a/(.+)", rewrite_to: "b/$1" }]);
    const rewrite = await screen.findByLabelText("Rule 1 rewrite to");
    fireEvent.change(rewrite, { target: { value: "z/$1" } });

    mockSetRoutingRules.mockResolvedValueOnce({
      repository_key: "npm-proxy",
      rules: [{ path_pattern: "a/(.+)", rewrite_to: "z/$1" }],
    });
    const save = await screen.findByText("Save changes");
    fireEvent.click(save);

    await waitFor(() =>
      expect(mockSetRoutingRules).toHaveBeenLastCalledWith("npm-proxy", [
        { path_pattern: "a/(.+)", rewrite_to: "z/$1" },
      ])
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Routing rules saved"));
  });

  it("Discard reverts local edits to the last server copy", async () => {
    mockGetRoutingRules.mockResolvedValue({ repository_key: "npm-proxy", rules: [] });
    renderWith();
    await screen.findByText(/No routing rules configured/i);

    await addRule("a/(.+)", "b/$1", [{ path_pattern: "a/(.+)", rewrite_to: "b/$1" }]);
    const rewrite = await screen.findByLabelText("Rule 1 rewrite to");
    fireEvent.change(rewrite, { target: { value: "z/$1" } });
    expect(rewrite).toHaveValue("z/$1");

    // Discard resets to data?.rules, which is the original empty server copy,
    // so the editable table collapses back to the empty state.
    fireEvent.click(await screen.findByText("Discard"));
    await waitFor(() =>
      expect(screen.getByText(/No routing rules configured/i)).toBeInTheDocument()
    );
  });

  it("toasts an error when saving an added rule fails", async () => {
    mockGetRoutingRules.mockResolvedValue({ repository_key: "npm-proxy", rules: [] });
    mockSetRoutingRules.mockRejectedValue(new Error("boom"));
    renderWith();
    await screen.findByText(/No routing rules configured/i);

    fireEvent.change(screen.getByLabelText("Path pattern"), { target: { value: "x/(.+)" } });
    fireEvent.change(screen.getByLabelText("Rewrite to"), { target: { value: "y/$1" } });
    fireEvent.click(screen.getByText("Add rule").closest("button")!);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to save routing rules"));
  });
});
