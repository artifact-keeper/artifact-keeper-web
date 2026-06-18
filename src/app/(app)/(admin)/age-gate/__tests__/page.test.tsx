// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import AgeGatePage from "../page";
import ageGateApi from "@/lib/api/age-gate";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ user: { is_admin: true } }),
}));

vi.mock("@/lib/api/age-gate", () => ({
  default: {
    listReviews: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
  },
}));

describe("AgeGatePage", () => {
  beforeEach(() => {
    vi.mocked(ageGateApi.listReviews).mockResolvedValue({
      items: [],
      pagination: { page: 1, per_page: 20, total: 0, total_pages: 0 },
    });
  });

  it("renders pending tab and empty state", async () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <AgeGatePage />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Age Gate" })).toBeInTheDocument();
    expect(await screen.findByText("No pending reviews")).toBeInTheDocument();
  });
});
