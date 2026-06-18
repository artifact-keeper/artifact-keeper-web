// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AgeGateSettings } from "./age-gate-settings";
import ageGateApi from "@/lib/api/age-gate";
import type { Repository } from "@/types";

vi.mock("@/lib/api/age-gate", () => ({
  default: {
    getRepoConfig: vi.fn(),
    updateRepoConfig: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const remoteNpmRepo: Repository = {
  id: "repo-1",
  key: "npm-proxy",
  name: "npm proxy",
  format: "npm",
  repo_type: "remote",
  is_public: true,
  allow_anonymous_access: true,
  storage_used_bytes: 0,
  upstream_url: "https://registry.npmjs.org",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

describe("AgeGateSettings", () => {
  beforeEach(() => {
    vi.mocked(ageGateApi.getRepoConfig).mockResolvedValue({
      repository_key: "npm-proxy",
      enabled: false,
      min_age_days: 7,
    });
    vi.mocked(ageGateApi.updateRepoConfig).mockResolvedValue({
      repository_key: "npm-proxy",
      enabled: true,
      min_age_days: 14,
    });
  });

  it("renders for remote npm repositories", async () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <AgeGateSettings repository={remoteNpmRepo} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Age Gate")).toBeInTheDocument();
    expect(screen.getByLabelText("Enable age gate")).toBeInTheDocument();
  });

  it("submits updated config", async () => {
    const user = userEvent.setup();
    const client = new QueryClient();

    render(
      <QueryClientProvider client={client}>
        <AgeGateSettings repository={remoteNpmRepo} />
      </QueryClientProvider>,
    );

    await screen.findByLabelText("Enable age gate");
    await user.click(screen.getByLabelText("Enable age gate"));
    const daysInput = await screen.findByLabelText("Minimum age (days)");
    await user.clear(daysInput);
    await user.type(daysInput, "14");
    await user.click(screen.getAllByRole("button", { name: /save age gate settings/i })[0]);

    expect(ageGateApi.updateRepoConfig).toHaveBeenCalledWith("npm-proxy", {
      enabled: true,
      min_age_days: 14,
    });
  });
});
