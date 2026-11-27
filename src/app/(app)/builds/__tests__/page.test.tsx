// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Build } from "@/types/builds";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  deleteMany: vi.fn(),
  getHealth: vi.fn(),
}));

vi.mock("@/lib/api/builds", () => ({
  buildsApi: {
    list: mocks.list,
    get: mocks.get,
    diff: vi.fn(),
    deleteMany: mocks.deleteMany,
  },
}));

vi.mock("@/lib/api/admin", () => ({
  adminApi: { getHealth: mocks.getHealth },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import BuildsPage from "../page";

function build(n: number): Build {
  return {
    id: `b${n}`,
    name: "app",
    number: n,
    status: "success",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  };
}

function pageOf(items: Build[], page: number, totalPages: number) {
  return {
    items,
    pagination: {
      page,
      per_page: 20,
      total: totalPages > 1 ? totalPages * 20 : items.length,
      total_pages: totalPages,
    },
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BuildsPage />
    </QueryClientProvider>
  );
}

describe("BuildsPage delete gate", () => {
  beforeEach(() => {
    mocks.list.mockResolvedValue(pageOf([build(1), build(2)], 1, 1));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each([
    ["1.12.1", false],
    ["1.13.0-rc.1", false],
    [undefined, false],
    ["1.13.0", true],
  ])("backend %s shows the row checkboxes: %s", async (version, shown) => {
    mocks.getHealth.mockResolvedValue({ status: "healthy", version });
    renderPage();
    await screen.findByText("#1");
    await waitFor(() => expect(mocks.getHealth).toHaveBeenCalled());
    if (shown) {
      expect(await screen.findByLabelText("Select app #1")).toBeInTheDocument();
      expect(screen.getByLabelText("Select all builds on this page")).toBeInTheDocument();
    } else {
      // let the health answer land before asserting nothing appeared
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByLabelText("Select app #1")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Select all builds on this page")).not.toBeInTheDocument();
    }
  });
});

describe("BuildsPage selection", () => {
  beforeEach(() => {
    mocks.getHealth.mockResolvedValue({ status: "healthy", version: "1.13.0" });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("drops the selection when the search changes", async () => {
    mocks.list.mockResolvedValue(pageOf([build(1), build(2)], 1, 1));
    renderPage();
    fireEvent.click(await screen.findByLabelText("Select app #1"));
    expect(screen.getByRole("button", { name: /Delete selected \(1\)/ })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search builds..."), {
      target: { value: "app" },
    });
    await screen.findByLabelText("Select app #1");
    expect(screen.queryByRole("button", { name: /Delete selected/ })).not.toBeInTheDocument();
  });

  it("drops the selection when the page changes", async () => {
    mocks.list.mockImplementation(({ page }: { page: number }) =>
      Promise.resolve(pageOf(page === 1 ? [build(1)] : [build(2)], page, 2))
    );
    renderPage();
    fireEvent.click(await screen.findByLabelText("Select app #1"));
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    await screen.findByLabelText("Select app #2");
    expect(screen.queryByRole("button", { name: /Delete selected/ })).not.toBeInTheDocument();
  });

  it("steps back a page when a delete empties the last one", async () => {
    let remaining = [build(21)];
    mocks.list.mockImplementation(({ page }: { page: number }) => {
      const totalPages = remaining.length > 0 ? 2 : 1;
      if (page === 1) return Promise.resolve(pageOf([build(1)], 1, totalPages));
      return Promise.resolve(pageOf(remaining, 2, totalPages));
    });
    mocks.deleteMany.mockImplementation(async (ids: string[]) => {
      remaining = [];
      return { deleted: ids, failed: [] };
    });
    renderPage();
    await screen.findByLabelText("Select app #1");
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    fireEvent.click(await screen.findByLabelText("Select app #21"));
    fireEvent.click(screen.getByRole("button", { name: /Delete selected \(1\)/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mocks.deleteMany).toHaveBeenCalledWith(["b21"]));
    expect(await screen.findByText("#1")).toBeInTheDocument();
    expect(screen.queryByText("No builds found")).not.toBeInTheDocument();
  });
});

describe("BuildsPage modules", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("lists an artifact a module names twice without a duplicate key", async () => {
    mocks.getHealth.mockResolvedValue({ status: "healthy", version: "1.12.1" });
    mocks.list.mockResolvedValue(pageOf([build(1)], 1, 1));
    const artifact = { name: "app.jar", path: "libs/app.jar", checksum_sha256: "c", size_bytes: 1 };
    mocks.get.mockResolvedValue({
      ...build(1),
      modules: [{ id: "m1", name: "core", artifacts: [artifact, artifact] }],
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    renderPage();
    fireEvent.click(await screen.findByText("#1"));
    const tab = await screen.findByRole("tab", { name: /Modules/ });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(await screen.findAllByText("app.jar")).toHaveLength(2);
    const keyWarnings = errors.mock.calls.filter((c) => String(c[0]).includes("same key"));
    expect(keyWarnings).toEqual([]);
  });
});

describe("BuildsPage filters gate", () => {
  beforeEach(() => {
    mocks.list.mockResolvedValue(pageOf([build(1)], 1, 1));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each([["1.12.1"], ["1.13.0-rc.1"], [undefined]])(
    "backend %s hides branch, agent and date filters and never sends them",
    async (version) => {
      mocks.getHealth.mockResolvedValue({ status: "healthy", version });
      renderPage();
      await screen.findByText("#1");
      await waitFor(() => expect(mocks.getHealth).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      for (const label of ["Branch", "Agent", "Created from", "Created to"]) {
        expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
      }
      for (const [params] of mocks.list.mock.calls) {
        expect(params).not.toHaveProperty("branch");
        expect(params).not.toHaveProperty("created_after");
      }
    }
  );

  it("backend 1.13.0 sends the branch once typing stops", async () => {
    mocks.getHealth.mockResolvedValue({ status: "healthy", version: "1.13.0" });
    renderPage();
    const branch = await screen.findByLabelText("Branch");
    for (const value of ["m", "ma", "main"]) {
      fireEvent.change(branch, { target: { value } });
    }
    await waitFor(() =>
      expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ branch: "main" }))
    );
    const branches = mocks.list.mock.calls.map(([p]) => p.branch).filter(Boolean);
    expect(branches).toEqual(["main"]);
  });
});

describe("BuildsPage selection with filters", () => {
  beforeEach(() => {
    mocks.getHealth.mockResolvedValue({ status: "healthy", version: "1.13.0" });
    mocks.list.mockImplementation(({ page }: { page: number }) =>
      Promise.resolve(pageOf([build(page)], page, 2))
    );
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("drops the selection when the branch filter changes", async () => {
    renderPage();
    fireEvent.click(await screen.findByLabelText("Select app #1"));
    fireEvent.change(screen.getByLabelText("Branch"), { target: { value: "main" } });
    await waitFor(() =>
      expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ branch: "main" }))
    );
    await screen.findByLabelText("Select app #1");
    expect(screen.queryByRole("button", { name: /Delete selected/ })).not.toBeInTheDocument();
  });

  it("drops the selection when the page size changes", async () => {
    renderPage();
    fireEvent.click(await screen.findByLabelText("Select app #1"));
    fireEvent.keyDown(screen.getByLabelText("Builds per page"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "50 / page" }));
    await waitFor(() =>
      expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ per_page: 50 }))
    );
    await screen.findByLabelText("Select app #1");
    expect(screen.queryByRole("button", { name: /Delete selected/ })).not.toBeInTheDocument();
  });
});
