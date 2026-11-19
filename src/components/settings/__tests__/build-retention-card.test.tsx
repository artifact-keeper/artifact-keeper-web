// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/sdk-client", () => ({}));

const mockGet = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/api/settings", () => ({
  settingsApi: {
    getBuildRetention: (...args: unknown[]) => mockGet(...args),
    updateBuildRetention: (...args: unknown[]) => mockUpdate(...args),
  },
}));

import { BuildRetentionCard, parseRetentionValue } from "../build-retention-card";

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BuildRetentionCard />
    </QueryClientProvider>,
  );
}

describe("parseRetentionValue", () => {
  it("takes whole numbers of 0 or more only", () => {
    expect(parseRetentionValue("0")).toBe(0);
    expect(parseRetentionValue(" 30 ")).toBe(30);
    expect(parseRetentionValue("-1")).toBeNull();
    expect(parseRetentionValue("1.5")).toBeNull();
    expect(parseRetentionValue("")).toBeNull();
    expect(parseRetentionValue("99999999999")).toBeNull();
  });
});

describe("BuildRetentionCard", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("renders nothing against a backend without build retention", async () => {
    mockGet.mockResolvedValue(null);
    const { container } = renderCard();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("saves both values", async () => {
    mockGet.mockResolvedValue({ days: 0, keep_last: 0 });
    mockUpdate.mockResolvedValue(undefined);
    renderCard();
    const days = await screen.findByLabelText("Delete builds older than (days)");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    fireEvent.change(days, { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Keep the newest builds per name"), {
      target: { value: "5" },
    });
    fireEvent.click(save);
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({ days: 30, keep_last: 5 }),
    );
  });

  it("refuses a negative value", async () => {
    mockGet.mockResolvedValue({ days: 7, keep_last: 0 });
    renderCard();
    const days = await screen.findByLabelText("Delete builds older than (days)");
    fireEvent.change(days, { target: { value: "-3" } });
    expect(screen.getByText("Use a whole number, 0 or more")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
