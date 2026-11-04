// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ bulkApproveNamespace: vi.fn() }));
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
  ])("%s", (glob, expected) => {
    const r = validateNamespaceGlob(glob);
    if (expected === null) expect(r).toBeNull();
    else expect(r).toMatch(expected);
  });
});

describe("namespaceResultMessage", () => {
  it("mentions deny-glob refusals only when there are some", () => {
    expect(namespaceResultMessage({ approved: 1 })).toBe("Approved 1 server");
    expect(namespaceResultMessage({ approved: 3, denied: 2 })).toBe("Approved 3 servers; 2 refused by a deny glob");
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

  it("approves the namespace and reports approved and denied counts", async () => {
    api.bulkApproveNamespace.mockResolvedValue({ approved: 5, denied: 1, warnings: ["broad glob"] });
    const { user, spy, onOpenChange } = setup();
    await user.type(screen.getByLabelText("Namespace glob"), "io.github.acme/*");
    expect(screen.getByRole("button", { name: "Approve namespace" })).toBeDisabled();
    await user.type(screen.getByLabelText("Reason"), "trusted publisher");
    await user.click(screen.getByRole("button", { name: "Approve namespace" }));
    await waitFor(() =>
      expect(api.bulkApproveNamespace).toHaveBeenCalledWith("mcp-proxy", "io.github.acme/*", "trusted publisher"),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Approved 5 servers; 1 refused by a deny glob"));
    expect(toast.warning).toHaveBeenCalledWith("broad glob");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["mcp"] });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("toasts the error when the approval fails", async () => {
    api.bulkApproveNamespace.mockRejectedValue(new Error("nope"));
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
