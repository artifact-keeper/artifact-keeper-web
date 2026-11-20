// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Repository } from "@/types";

const mockApiFetch = vi.fn();
vi.mock("@/lib/api/fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/fetch")>()),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
}));

import { ApiError } from "@/lib/api/fetch";
import { UpstreamFilterSettings, patternListProblem } from "./upstream-filter-settings";
import { adaptUpstreamFilter, parsePatternLines } from "@/lib/api/upstream-filter";

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

const API = "/api/v1/repositories/npm-proxy/upstream-filter";

const repo: Repository = {
  id: "r1",
  key: "npm-proxy",
  name: "NPM Proxy",
  format: "npm",
  repo_type: "remote",
  is_public: false,
  storage_used_bytes: 0,
  created_at: "2025-01-01",
  updated_at: "2025-01-01",
};

const ACTIVE = {
  repository_key: "npm-proxy",
  include_patterns: ["^@acme(/|%2F)", "^left-pad"],
  exclude_patterns: ["-beta\\."],
  active: true,
};
const NONE = { repository_key: "npm-proxy", include_patterns: [], exclude_patterns: [], active: false };

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UpstreamFilterSettings repository={repo} />
    </QueryClientProvider>
  );
}

function routeApi(get: unknown, write?: (init: RequestInit) => unknown) {
  mockApiFetch.mockImplementation(async (_path: string, init?: RequestInit) => {
    if (!init?.method) return get;
    if (!write) throw new Error("unexpected write");
    return write(init);
  });
}

describe("UpstreamFilterSettings (#1034)", () => {
  it("loads the stored patterns into the include and exclude editors and marks the filter active", async () => {
    routeApi(ACTIVE);
    show();

    const include = await screen.findByLabelText("Include patterns");
    await waitFor(() => expect(include).toHaveValue("^@acme(/|%2F)\n^left-pad"));
    expect(screen.getByLabelText("Exclude patterns")).toHaveValue("-beta\\.");
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith(API);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear" })).toBeEnabled();
  });

  it("saves the edited lists with a PUT, one pattern per non-empty line", async () => {
    const saved = { ...NONE, include_patterns: ["^@acme/"], exclude_patterns: ["-rc\\."], active: true };
    routeApi(NONE, () => saved);
    show();

    expect(await screen.findByText("No filter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Include patterns"), { target: { value: " ^@acme/ \n\n" } });
    fireEvent.change(screen.getByLabelText("Exclude patterns"), { target: { value: "-rc\\." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith("Upstream filter saved"));
    const put = mockApiFetch.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(put?.[0]).toBe(API);
    expect(JSON.parse(put?.[1].body)).toEqual({ include_patterns: ["^@acme/"], exclude_patterns: ["-rc\\."] });
    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(screen.getByLabelText("Include patterns")).toHaveValue("^@acme/");
  });

  it("shows the backend's refusal of a bad pattern and keeps the edits", async () => {
    routeApi(NONE, () => {
      throw new Error("include_patterns[0]: regex parse error");
    });
    show();

    const include = await screen.findByLabelText("Include patterns");
    fireEvent.change(include, { target: { value: "(" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(include).toHaveValue("(");
  });

  it("clears the filter with a DELETE after confirming", async () => {
    routeApi(ACTIVE, (init) => {
      expect(init.method).toBe("DELETE");
      return NONE;
    });
    show();

    await screen.findByText("Active");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("Clear the upstream filter?")).toBeInTheDocument();
    const confirm = screen.getAllByRole("button", { name: "Clear" }).at(-1)!;
    fireEvent.click(confirm);

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith("Upstream filter cleared"));
    expect(mockApiFetch).toHaveBeenCalledWith(API, { method: "DELETE" });
    expect(await screen.findByText("No filter")).toBeInTheDocument();
    expect(screen.getByLabelText("Include patterns")).toHaveValue("");
  });

  it("warns that an unusable stored filter refuses every fetch, and can still be cleared", async () => {
    routeApi({ ...NONE, active: true, error: "invalid regex" });
    show();
    expect(await screen.findByText("Every upstream fetch is refused")).toBeInTheDocument();
    expect(screen.getByText(/invalid regex/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeEnabled();
  });

  it("hides the section on a backend without the route (bodyless 404)", async () => {
    mockApiFetch.mockRejectedValue(new ApiError(404, ""));
    const { container } = show();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("names the repository when the session may not administer it (403)", async () => {
    mockApiFetch.mockRejectedValue(
      new ApiError(403, JSON.stringify({ code: "FORBIDDEN", message: "Repository admin required" }))
    );
    show();
    expect(
      await screen.findByText(/not allowed to administer npm-proxy/i)
    ).toBeInTheDocument();
  });

  it("refuses more patterns or longer ones than the backend accepts, before sending", async () => {
    routeApi(NONE);
    show();

    const include = await screen.findByLabelText("Include patterns");
    fireEvent.change(include, {
      target: { value: Array.from({ length: 65 }, (_, i) => `^p${i}`).join("\n") },
    });
    expect(include).toHaveAccessibleDescription(/at most 64 patterns, this list has 65/i);
    expect(include).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(include, { target: { value: "^ok" } });
    fireEvent.change(screen.getByLabelText("Exclude patterns"), {
      target: { value: `^ok\n${"é".repeat(257)}` },
    });
    expect(screen.getByLabelText("Exclude patterns")).toHaveAccessibleDescription(
      /pattern 2 is longer than 512 bytes/i
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(mockApiFetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("says so when the filter cannot be loaded", async () => {
    mockApiFetch.mockRejectedValue(new Error("403"));
    show();
    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});

describe("upstream filter helpers", () => {
  it("drops malformed patterns and falls back to the requested key", () => {
    expect(
      adaptUpstreamFilter({ include_patterns: ["^a", 3, null], exclude_patterns: "x", active: "yes" }, "k")
    ).toEqual({
      repository_key: "k",
      include_patterns: ["^a"],
      exclude_patterns: [],
      active: false,
      error: undefined,
    });
  });

  it("accepts exactly the backend's limits", () => {
    expect(patternListProblem(Array.from({ length: 64 }, () => "a".repeat(512)))).toBeNull();
    expect(patternListProblem([])).toBeNull();
  });

  it("reads one pattern per non-empty line", () => {
    expect(parsePatternLines(" ^a \r\n\n  \n-b$\n")).toEqual(["^a", "-b$"]);
  });
});
