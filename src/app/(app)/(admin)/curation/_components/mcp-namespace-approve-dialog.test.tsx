// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { McpBulkResult } from "@/types/mcp";

const api = vi.hoisted(() => ({ bulkApprovePattern: vi.fn(), bulkBlockPattern: vi.fn() }));
vi.mock("@/lib/api/mcp", () => ({ mcpApi: api }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import {
  McpNamespaceApproveDialog,
  namespaceResultMessage,
  validateNamespaceGlob,
} from "./mcp-namespace-approve-dialog";

const NAMES = Array.from({ length: 12 }, (_, i) => `io.github.acme/s${i}`);

const result = (over: Partial<McpBulkResult> = {}): McpBulkResult => ({
  approved: 0,
  blocked: 0,
  names: [],
  skippedDenied: 0,
  skippedReview: 0,
  dryRun: false,
  ...over,
});

function setup(action: "approve" | "block" = "approve", onOpenChange = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <McpNamespaceApproveDialog repoKey="mcp-proxy" action={action} open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { spy, onOpenChange, user: userEvent.setup() };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("validateNamespaceGlob", () => {
  it.each([
    ["", /Enter a full-name glob/],
    ["com acme/*", /letters, digits/],
    ["a/b/c", /exactly one slash/],
    ["io.github.acme/*", null],
    ["com.acme.*", null],
    ["*", null],
    ["io.github.acme/weather", null],
    ["io.github.acme", "Match the full name: write io.github.acme/* for this namespace's servers"],
    ["  com.acme  ", "Match the full name: write com.acme/* for this namespace's servers"],
    ["com.acme/weathe?", /letters, digits/],
    [`a/${"b".repeat(198)}`, null],
    [`a/${"b".repeat(199)}`, /At most 200 characters/],
  ])("%s", (glob, expected) => {
    const r = validateNamespaceGlob(glob);
    if (expected === null) expect(r).toBeNull();
    else expect(r).toMatch(expected);
  });
});

describe("namespaceResultMessage", () => {
  it("mentions skipped names only when there are some", () => {
    expect(namespaceResultMessage(result({ approved: 1, names: ["a/b"] }))).toBe("Approved 1 server");
    expect(namespaceResultMessage(result({ approved: 3, skippedDenied: 2 }))).toBe(
      "Approved 3 servers; 2 refused by a deny glob",
    );
    expect(namespaceResultMessage(result({ skippedDenied: 1, skippedReview: 4 }))).toBe(
      "Approved 0 servers; 1 refused by a deny glob; 4 flagged left for review",
    );
    expect(namespaceResultMessage(result({ blocked: 2 }), "block")).toBe("Blocked 2 servers");
  });
});

describe("McpNamespaceApproveDialog", () => {
  it("previews the backend's dry run before Approve is enabled", async () => {
    api.bulkApprovePattern.mockResolvedValue(result({ approved: 12, names: NAMES, dryRun: true, skippedReview: 1 }));
    const { user } = setup();
    await user.type(screen.getByLabelText("Namespace glob"), " io.github.acme/* ");
    await user.type(screen.getByLabelText("Reason"), "trusted");
    expect(screen.getByRole("button", { name: "Approve namespace" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() =>
      expect(api.bulkApprovePattern).toHaveBeenCalledWith("mcp-proxy", {
        pattern: "io.github.acme/*",
        includeReview: false,
        reason: "trusted",
        dryRun: true,
      }),
    );
    expect(await screen.findByText("Would approve 12 servers; 1 flagged left for review.")).toBeInTheDocument();
    expect(screen.getByText("io.github.acme/s0")).toBeInTheDocument();
    expect(screen.getByText("and 2 more")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve namespace" })).toBeEnabled();
    expect(screen.getByText(/Deny globs always win/)).toBeInTheDocument();
  });

  it("drops the preview when the glob or include-review choice changes", async () => {
    api.bulkApprovePattern.mockResolvedValue(result({ approved: 1, names: ["com.other/x"], dryRun: true }));
    const { user } = setup();
    await user.type(screen.getByLabelText("Namespace glob"), "com.other/*");
    await user.type(screen.getByLabelText("Reason"), "r");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByText("Would approve 1 server.");
    await user.click(screen.getByRole("checkbox", { name: /Also approve flagged names/ }));
    expect(screen.queryByTestId("mcp-pattern-preview")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve namespace" })).toBeDisabled();
  });

  it("keeps Approve disabled when the dry run matches nothing", async () => {
    api.bulkApprovePattern.mockResolvedValue(result({ dryRun: true, skippedDenied: 2 }));
    const { user } = setup();
    await user.type(screen.getByLabelText("Namespace glob"), "com.other/*");
    await user.type(screen.getByLabelText("Reason"), "r");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByText("Would approve 0 servers; 2 refused by a deny glob.");
    expect(screen.getByRole("button", { name: "Approve namespace" })).toBeDisabled();
  });

  it("warns on a broad glob", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Namespace glob"), "io.github.*");
    expect(screen.getByRole("alert")).toHaveTextContent(/This glob is broad/);
  });

  it("refuses a bare namespace, which matches no full name", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Namespace glob"), "io.github.acme");
    expect(screen.getByText("Match the full name: write io.github.acme/* for this namespace's servers")).toBeInTheDocument();
    expect(screen.getByLabelText("Namespace glob")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
  });

  it("approves after the preview and reports approved and skipped counts", async () => {
    api.bulkApprovePattern
      .mockResolvedValueOnce(result({ approved: 5, names: NAMES.slice(0, 5), dryRun: true }))
      .mockResolvedValueOnce(result({ approved: 5, names: NAMES.slice(0, 5), skippedDenied: 1, skippedReview: 2 }));
    const { user, spy, onOpenChange } = setup();
    await user.type(screen.getByLabelText("Namespace glob"), "io.github.acme/*");
    await user.click(screen.getByRole("checkbox", { name: /Also approve flagged names/ }));
    await user.type(screen.getByLabelText("Reason"), " trusted publisher ");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByTestId("mcp-pattern-preview");
    await user.click(screen.getByRole("button", { name: "Approve namespace" }));
    await waitFor(() =>
      expect(api.bulkApprovePattern).toHaveBeenLastCalledWith("mcp-proxy", {
        pattern: "io.github.acme/*",
        includeReview: true,
        reason: "trusted publisher",
        dryRun: false,
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Approved 5 servers; 1 refused by a deny glob; 2 flagged left for review"),
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ["mcp"] });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("blocks by pattern through bulk-block, with its own preview", async () => {
    api.bulkBlockPattern
      .mockResolvedValueOnce(result({ blocked: 2, names: ["x.evil/a", "x.evil/b"], dryRun: true }))
      .mockResolvedValueOnce(result({ blocked: 2, names: ["x.evil/a", "x.evil/b"] }));
    const { user } = setup("block");
    expect(screen.getByText("Block a namespace")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Namespace glob"), "*.evil/*");
    await user.type(screen.getByLabelText("Reason"), "squatters");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByText("Would block 2 servers.");
    await user.click(screen.getByRole("button", { name: "Block namespace" }));
    await waitFor(() =>
      expect(api.bulkBlockPattern).toHaveBeenLastCalledWith("mcp-proxy", {
        pattern: "*.evil/*",
        reason: "squatters",
        dryRun: false,
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Blocked 2 servers"));
    expect(api.bulkApprovePattern).not.toHaveBeenCalled();
  });

  it("toasts the error when the preview or the approval fails", async () => {
    api.bulkApprovePattern.mockRejectedValueOnce(new Error("nope"));
    const { user } = setup();
    await user.type(screen.getByLabelText("Namespace glob"), "com.other/*");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    api.bulkApprovePattern
      .mockResolvedValueOnce(result({ approved: 1, names: ["com.other/x"], dryRun: true }))
      .mockRejectedValueOnce(new Error("locked"));
    await user.type(screen.getByLabelText("Reason"), "r");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByTestId("mcp-pattern-preview");
    await user.click(screen.getByRole("button", { name: "Approve namespace" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));
  });

  it("cancels", async () => {
    const { user, onOpenChange } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
