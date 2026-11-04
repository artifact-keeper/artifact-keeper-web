// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { McpBulkApproveResult } from "@/types/mcp";

const api = vi.hoisted(() => ({ bulkApprovePattern: vi.fn() }));
vi.mock("@/lib/api/mcp", () => ({ mcpApi: api }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import {
  McpNamespaceApproveDialog,
  namespaceResultMessage,
  validateNamespaceGlob,
} from "./mcp-namespace-approve-dialog";

const NAMES = [
  "io.github.acme/a",
  "io.github.acme/b",
  "io.github.acme/c",
  "io.github.acme/d",
  "io.github.acme/e",
  "io.github.acme/f",
  "com.other/x",
];

function setup(onOpenChange = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <McpNamespaceApproveDialog repoKey="mcp-proxy" open onOpenChange={onOpenChange} pendingNames={NAMES} />
    </QueryClientProvider>,
  );
  return { spy, onOpenChange, user: userEvent.setup() };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("validateNamespaceGlob", () => {
  it.each([
    ["", /Enter a namespace glob/],
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
  const result = (over: Partial<McpBulkApproveResult> = {}): McpBulkApproveResult => ({
    approved: 0,
    names: [],
    skippedDenied: 0,
    skippedReview: 0,
    ...over,
  });

  it("mentions skipped names only when there are some", () => {
    expect(namespaceResultMessage(result({ approved: 1, names: ["a/b"] }))).toBe("Approved 1 server");
    expect(namespaceResultMessage(result({ approved: 3, skippedDenied: 2 }))).toBe(
      "Approved 3 servers; 2 refused by a deny glob",
    );
    expect(namespaceResultMessage(result({ approved: 0, skippedDenied: 1, skippedReview: 4 }))).toBe(
      "Approved 0 servers; 1 refused by a deny glob; 4 flagged left for review",
    );
  });
});

describe("McpNamespaceApproveDialog", () => {
  it("previews the pending names a glob matches", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Namespace glob"), "io.github.acme/*");
    expect(screen.getByText("Matches 6 pending servers of 7.")).toBeInTheDocument();
    expect(screen.getByText("io.github.acme/a")).toBeInTheDocument();
    expect(screen.getByText("and 1 more")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/Deny globs always win/)).toBeInTheDocument();
  });

  it("previews matches as the backend does: ignoring case, * crossing /, input trimmed", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Namespace glob"), "  IO.GITHUB.ACME*A  ");
    expect(screen.getByText("Matches 1 pending server of 7.")).toBeInTheDocument();
    expect(screen.getByText("io.github.acme/a")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/This glob is broad/);
  });

  it("warns on a broad glob", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Namespace glob"), "io.github.*");
    expect(screen.getByRole("alert")).toHaveTextContent(/This glob is broad/);
  });

  it("shows a validation error and keeps Approve disabled", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Namespace glob"), "a/b/c");
    await user.type(screen.getByLabelText("Reason"), "x");
    expect(screen.getByText(/exactly one slash/)).toBeInTheDocument();
    expect(screen.getByLabelText("Namespace glob")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Approve namespace" })).toBeDisabled();
  });

  it("refuses a bare namespace, which matches no full name", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Namespace glob"), "io.github.acme");
    await user.type(screen.getByLabelText("Reason"), "x");
    expect(screen.getByText("Match the full name: write io.github.acme/* for this namespace's servers")).toBeInTheDocument();
    expect(screen.queryByText(/^Matches /)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve namespace" })).toBeDisabled();
  });

  it("approves the pattern and reports approved and skipped counts", async () => {
    api.bulkApprovePattern.mockResolvedValue({
      approved: 5,
      names: NAMES.slice(0, 5),
      skippedDenied: 1,
      skippedReview: 2,
    } satisfies McpBulkApproveResult);
    const { user, spy, onOpenChange } = setup();
    await user.type(screen.getByLabelText("Namespace glob"), " io.github.acme/* ");
    expect(screen.getByRole("button", { name: "Approve namespace" })).toBeDisabled();
    await user.type(screen.getByLabelText("Reason"), " trusted publisher ");
    await user.click(screen.getByRole("button", { name: "Approve namespace" }));
    await waitFor(() =>
      expect(api.bulkApprovePattern).toHaveBeenCalledWith("mcp-proxy", {
        pattern: "io.github.acme/*",
        includeReview: false,
        reason: "trusted publisher",
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Approved 5 servers; 1 refused by a deny glob; 2 flagged left for review",
      ),
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ["mcp"] });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("includes flagged names when asked", async () => {
    api.bulkApprovePattern.mockResolvedValue({ approved: 1, names: ["com.other/x"], skippedDenied: 0, skippedReview: 0 });
    const { user } = setup();
    await user.type(screen.getByLabelText("Namespace glob"), "com.other/*");
    await user.click(screen.getByRole("checkbox", { name: /Also approve flagged names/ }));
    await user.type(screen.getByLabelText("Reason"), "reviewed lookalikes");
    await user.click(screen.getByRole("button", { name: "Approve namespace" }));
    await waitFor(() =>
      expect(api.bulkApprovePattern).toHaveBeenCalledWith("mcp-proxy", {
        pattern: "com.other/*",
        includeReview: true,
        reason: "reviewed lookalikes",
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Approved 1 server"));
  });

  it("toasts the error when the approval fails", async () => {
    api.bulkApprovePattern.mockRejectedValue(new Error("nope"));
    const { user } = setup();
    await user.type(screen.getByLabelText("Namespace glob"), "com.other/*");
    await user.type(screen.getByLabelText("Reason"), "r");
    await user.click(screen.getByRole("button", { name: "Approve namespace" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("cancels", async () => {
    const { user, onOpenChange } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
