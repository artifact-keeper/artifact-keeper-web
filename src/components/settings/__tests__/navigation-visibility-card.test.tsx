// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

beforeAll(() => {
  // Radix's Switch measures its thumb through ResizeObserver, which jsdom
  // does not implement.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/sdk-client", () => ({
  getActiveInstanceBaseUrl: () => "http://localhost:8080",
  CSRF_HEADER_NAME: "X-Requested-With",
  CSRF_HEADER_VALUE: "XMLHttpRequest",
}));

const mockGet = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/api/navigation-settings", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/api/navigation-settings")
  >("@/lib/api/navigation-settings");
  return {
    ...actual,
    navigationSettingsApi: {
      get: (...args: unknown[]) => mockGet(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  };
});

import { toast } from "sonner";
import { NavigationVisibilityCard } from "../navigation-visibility-card";
import { SYSTEM_CONFIG_QUERY_KEY } from "@/providers/system-config-provider";

let client: QueryClient;

function renderCard() {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NavigationVisibilityCard />
    </QueryClientProvider>,
  );
}

function toggle(name: string): HTMLElement {
  return screen.getByRole("switch", { name });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue({ hiddenNavItems: ["/peers"], supported: true });
  mockUpdate.mockImplementation(async (items: string[]) => ({
    hiddenNavItems: items,
    supported: true,
  }));
});

afterEach(() => cleanup());

describe("NavigationVisibilityCard (#968)", () => {
  it("seeds the switches from the saved list", async () => {
    renderCard();

    await waitFor(() =>
      expect(toggle("Show Integration / Peers in the sidebar")).not.toBeChecked(),
    );
    expect(toggle("Show Integration / Webhooks in the sidebar")).toBeChecked();
    expect(screen.getByText("1 entry hidden.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("locks the Settings entry on", async () => {
    renderCard();

    const settings = await screen.findByRole("switch", {
      name: "Show Administration / Settings in the sidebar",
    });
    expect(settings).toBeChecked();
    expect(settings).toBeDisabled();
    expect(screen.getByText("Always shown")).toBeInTheDocument();
  });

  it("saves the sorted list and refreshes the sidebar's config", async () => {
    renderCard();
    await waitFor(() =>
      expect(toggle("Show Integration / Webhooks in the sidebar")).toBeChecked(),
    );
    const invalidate = vi.spyOn(client, "invalidateQueries");

    fireEvent.click(toggle("Show Integration / Webhooks in the sidebar"));
    fireEvent.click(toggle("Show Security / Scan Results in the sidebar"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith([
        "/peers",
        "/security/scans",
        "/webhooks",
      ]),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: SYSTEM_CONFIG_QUERY_KEY,
    });
  });

  it("shows everything again with Show all", async () => {
    renderCard();
    await waitFor(() =>
      expect(toggle("Show Integration / Peers in the sidebar")).not.toBeChecked(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));

    expect(toggle("Show Integration / Peers in the sidebar")).toBeChecked();
    expect(screen.getByText("Every entry is shown.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith([]));
  });

  it("explains when the server does not support the setting", async () => {
    mockGet.mockResolvedValue({ hiddenNavItems: [], supported: false });
    renderCard();

    expect(
      await screen.findByText("Not supported by this server"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("shows an error when the settings cannot be loaded", async () => {
    mockGet.mockRejectedValue(new Error("boom"));
    renderCard();

    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
  });
});
