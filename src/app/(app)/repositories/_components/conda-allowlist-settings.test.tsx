// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Repository } from "@/types";
import { ApiError } from "@/lib/api/fetch";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockRemove = vi.fn();
vi.mock("@/lib/api/conda-allowlist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/conda-allowlist")>();
  return {
    ...actual,
    condaAllowlistApi: {
      get: (...a: unknown[]) => mockGet(...a),
      set: (...a: unknown[]) => mockSet(...a),
      remove: (...a: unknown[]) => mockRemove(...a),
    },
  };
});

import { CondaAllowlistSettings, EMPTY_ENABLED_WARNING } from "./conda-allowlist-settings";
import { CondaAllowlistSummary, allowlistSummaryText } from "./conda-allowlist-summary";

afterEach(() => {
  cleanup();
  mockGet.mockReset();
  mockSet.mockReset();
  mockRemove.mockReset();
});

const repo = {
  id: "v1",
  key: "conda-virtual",
  name: "conda-virtual",
  format: "conda",
  repo_type: "virtual",
  is_public: false,
  storage_used_bytes: 0,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
} as Repository;

function list(enabled: boolean, entries: { name: string; version?: string; subdirs?: string[] }[], error?: string) {
  return { repository_key: "conda-virtual", enabled, entries, entry_count: entries.length, error };
}

function renderSettings(readOnly = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CondaAllowlistSettings repository={repo} readOnly={readOnly} />
    </QueryClientProvider>,
  );
}

const saveButton = () => screen.getByRole("button", { name: /save allowlist/i });

describe("CondaAllowlistSettings", () => {
  it("lists the entries and keeps Save disabled until something changes", async () => {
    mockGet.mockResolvedValue(list(true, [{ name: "numpy", version: "2.2.3", subdirs: ["linux-64"] }, { name: "tzdata" }]));
    renderSettings();
    expect(await screen.findByLabelText("Entry 1 name")).toHaveValue("numpy");
    expect(screen.getByLabelText("Entry 1 version")).toHaveValue("2.2.3");
    expect(screen.getByLabelText("Entry 1 subdirs")).toHaveValue("linux-64");
    expect(screen.getByLabelText("Entry 2 name")).toHaveValue("tzdata");
    expect(screen.getByTestId("allowlist-count")).toHaveTextContent("2 entries");
    expect(screen.getByRole("switch")).toBeChecked();
    expect(saveButton()).toBeDisabled();
  });

  it("warns when an enabled list is empty", async () => {
    mockGet.mockResolvedValue(list(false, []));
    renderSettings();
    const toggle = await screen.findByRole("switch");
    expect(screen.queryByText(EMPTY_ENABLED_WARNING)).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText(EMPTY_ENABLED_WARNING)).toBeInTheDocument();
  });

  it("validates rows inline and blocks Save on an invalid entry", async () => {
    mockGet.mockResolvedValue(list(false, [{ name: "numpy" }]));
    renderSettings();
    const name = await screen.findByLabelText("Entry 1 name");
    fireEvent.change(name, { target: { value: "num py" } });
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/conda names use/i)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.change(name, { target: { value: "numpy-base" } });
    expect(saveButton()).toBeEnabled();
  });

  it("adds an entry and saves the whole list with the toggle state", async () => {
    mockGet.mockResolvedValue(list(false, [{ name: "tzdata" }]));
    mockSet.mockImplementation(async (_k: string, body: { enabled: boolean; entries: unknown[] }) =>
      list(body.enabled, body.entries as { name: string }[]),
    );
    renderSettings();
    await screen.findByLabelText("Entry 1 name");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "numpy" } });
    fireEvent.change(screen.getByLabelText("Version"), { target: { value: ">=2,<3" } });
    fireEvent.change(screen.getByLabelText("Subdirs"), { target: { value: "linux-64, noarch" } });
    fireEvent.click(screen.getByRole("button", { name: /add entry/i }));
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(saveButton());
    await waitFor(() => expect(mockSet).toHaveBeenCalled());
    expect(mockSet).toHaveBeenCalledWith("conda-virtual", {
      enabled: true,
      entries: [{ name: "numpy", version: ">=2,<3", subdirs: ["linux-64", "noarch"] }, { name: "tzdata" }],
    });
    await waitFor(() => expect(saveButton()).toBeDisabled());
  });

  it("refuses an invalid draft entry with an associated message", async () => {
    mockGet.mockResolvedValue(list(false, []));
    renderSettings();
    await screen.findByRole("switch");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "bad name" } });
    fireEvent.click(screen.getByRole("button", { name: /add entry/i }));
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByLabelText("Entry 1 name")).not.toBeInTheDocument();
  });

  it("surfaces the backend's refusal and names the entry", async () => {
    mockGet.mockResolvedValue(list(true, [{ name: "numpy" }]));
    mockSet.mockRejectedValue(
      new ApiError(400, JSON.stringify({ code: "VALIDATION_ERROR", message: 'entries[1]: version ">=>2" is not a conda version spec' })),
    );
    renderSettings();
    await screen.findByLabelText("Entry 1 name");
    fireEvent.change(screen.getByLabelText("Paste entries"), { target: { value: "pandas >=>2" } });
    fireEvent.click(screen.getByRole("button", { name: /add lines/i }));
    fireEvent.click(saveButton());
    const alert = await screen.findByTestId("allowlist-server-error");
    expect(alert).toHaveTextContent("The server refused entry 2 (pandas)");
    expect(alert).toHaveTextContent('entries[1]: version ">=>2" is not a conda version spec');
    expect(screen.getByLabelText("Entry 2 name")).toHaveAttribute("aria-invalid", "true");
  });

  it("bulk paste reports bad lines and adds nothing until they are fixed", async () => {
    mockGet.mockResolvedValue(list(false, []));
    renderSettings();
    await screen.findByRole("switch");
    const paste = screen.getByLabelText("Paste entries");
    fireEvent.change(paste, { target: { value: "numpy 2.2.3 linux-64\nbad name here too" } });
    fireEvent.click(screen.getByRole("button", { name: /add lines/i }));
    expect(screen.getByText(/^Line 2:/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Entry 1 name")).not.toBeInTheDocument();
    fireEvent.change(paste, { target: { value: "numpy 2.2.3 linux-64\ntzdata" } });
    fireEvent.click(screen.getByRole("button", { name: /add lines/i }));
    expect(screen.getByLabelText("Entry 1 name")).toHaveValue("numpy");
    expect(screen.getByLabelText("Entry 2 name")).toHaveValue("tzdata");
    expect(paste).toHaveValue("");
  });

  it("imports a pixi.lock client-side, previews the count and merges", async () => {
    mockGet.mockResolvedValue(list(false, [{ name: "numpy", version: "2.2.3", subdirs: ["linux-64"] }]));
    renderSettings();
    await screen.findByLabelText("Entry 1 name");
    const lock = [
      "version: 6",
      "packages:",
      "- conda: https://ak.internal/conda/conda-virtual/osx-arm64/numpy-2.2.3-py310h_0.conda",
      "- conda: https://ak.internal/conda/conda-virtual/noarch/tzdata-2025b-h78e105d_0.conda",
      "- pypi: https://ak.internal/pypi/rich-13.0.0-py3-none-any.whl",
      "",
    ].join("\n");
    const file = new File([lock], "pixi.lock", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText(/import from pixi.lock/i), { target: { files: [file] } });
    const preview = await screen.findByTestId("allowlist-import-preview");
    expect(preview).toHaveTextContent("2 entries from 2 conda packages in pixi.lock");
    expect(preview).toHaveTextContent("noarch 1, osx-arm64 1");
    fireEvent.click(within(preview).getByRole("button", { name: /add to list/i }));
    expect(screen.getByLabelText("Entry 1 subdirs")).toHaveValue("linux-64, osx-arm64");
    expect(screen.getByLabelText("Entry 2 name")).toHaveValue("tzdata");
    expect(screen.getByRole("status")).toHaveTextContent("1 entry added, 1 widened to more subdirs");
  });

  it("says so when the file is not a lockfile", async () => {
    mockGet.mockResolvedValue(list(false, []));
    renderSettings();
    await screen.findByRole("switch");
    const file = new File(["name: env\ndependencies:\n- numpy\n"], "environment.yml");
    fireEvent.change(screen.getByLabelText(/import from pixi.lock/i), { target: { files: [file] } });
    expect(await screen.findByText(/not a pixi.lock or conda-lock.yml file/)).toBeInTheDocument();
  });

  it("removes the list after confirmation", async () => {
    mockGet.mockResolvedValue(list(true, [{ name: "numpy" }]));
    mockRemove.mockResolvedValue(list(false, []));
    renderSettings();
    await screen.findByLabelText("Entry 1 name");
    fireEvent.click(screen.getByRole("button", { name: /remove allowlist/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith("conda-virtual"));
    await waitFor(() => expect(screen.queryByLabelText("Entry 1 name")).not.toBeInTheDocument());
  });

  it("shows the backend's unreadable-list error state", async () => {
    mockGet.mockResolvedValue(list(true, [], "expected value at line 1 column 1"));
    renderSettings();
    const alert = await screen.findByTestId("allowlist-stored-error");
    expect(alert).toHaveTextContent("expected value at line 1 column 1");
    expect(alert).toHaveTextContent(/nothing from remote members is admitted/i);
  });

  it("explains a load failure", async () => {
    mockGet.mockRejectedValue(new ApiError(403, JSON.stringify({ code: "FORBIDDEN", message: "Repository admin required" })));
    renderSettings();
    expect(await screen.findByText("Repository admin required")).toBeInTheDocument();
  });

  it("read-only: shows the list and the error state without controls", async () => {
    mockGet.mockResolvedValue(list(true, [{ name: "numpy", version: "2.2.3" }, { name: "tzdata" }]));
    renderSettings(true);
    expect(await screen.findByText("numpy")).toBeInTheDocument();
    expect(screen.getByText(/only a repository administrator can change it/i)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /entry 1 name/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save allowlist/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Paste entries")).not.toBeInTheDocument();
  });

  it("pages long lists and filters by name", async () => {
    const entries = Array.from({ length: 150 }, (_, i) => ({ name: `pkg${i}` }));
    mockGet.mockResolvedValue(list(true, entries));
    renderSettings(true);
    await screen.findByText("pkg0");
    expect(screen.queryByText("pkg120")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show 50 more/i }));
    expect(screen.getByText("pkg120")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter entries by name"), { target: { value: "pkg14" } });
    expect(screen.getByTestId("allowlist-count")).toHaveTextContent("11 of 150 entries");
  });
});

describe("CondaAllowlistSummary", () => {
  function renderSummary(r: Repository, onOpen = vi.fn(), enabled = true) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <CondaAllowlistSummary repository={r} enabled={enabled} onOpen={onOpen} />
      </QueryClientProvider>,
    );
    return onOpen;
  }

  it("shows the state and opens the section", async () => {
    mockGet.mockResolvedValue(list(true, Array.from({ length: 43 }, (_, i) => ({ name: `p${i}` }))));
    const onOpen = renderSummary(repo);
    const link = await screen.findByRole("button", { name: "Allowlist: on, 43 entries" });
    fireEvent.click(link);
    expect(onOpen).toHaveBeenCalled();
  });

  it("renders nothing for other repositories or when the backend refuses", async () => {
    renderSummary({ ...repo, repo_type: "remote" } as Repository);
    expect(mockGet).not.toHaveBeenCalled();
    cleanup();
    mockGet.mockRejectedValue(new ApiError(403, ""));
    renderSummary(repo);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.queryByTestId("allowlist-summary")).not.toBeInTheDocument();
  });

  it("does not ask when told not to (signed out)", () => {
    renderSummary(repo, vi.fn(), false);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("summarizes each state", () => {
    expect(allowlistSummaryText(list(false, []))).toBe("off");
    expect(allowlistSummaryText(list(false, [{ name: "a" }]))).toBe("off, 1 entry");
    expect(allowlistSummaryText(list(true, [], "bad"))).toMatch(/unreadable/);
  });
});
