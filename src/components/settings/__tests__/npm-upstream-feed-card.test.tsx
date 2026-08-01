// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  NpmUpstreamFeedCard,
  NPM_UPSTREAM_FEED_ENV_VARS,
  NPM_REPLICATION_FEED_DEFAULT_URL,
  BACKEND_ISSUE_URL,
} from "../npm-upstream-feed-card";

vi.mock("lucide-react", () => ({
  Rss: () => null,
  ExternalLink: () => null,
}));

afterEach(() => {
  cleanup();
});

describe("NpmUpstreamFeedCard (#702)", () => {
  it("renders the title and environment-configured badge", () => {
    render(<NpmUpstreamFeedCard />);

    expect(screen.getByText("npm Upstream Change-Feed")).toBeInTheDocument();
    expect(
      screen.getByText("Configured via environment")
    ).toBeInTheDocument();
  });

  it("documents both backend environment variables with their defaults", () => {
    render(<NpmUpstreamFeedCard />);

    expect(
      screen.getByText("NPM_UPSTREAM_FEED_ENABLED")
    ).toBeInTheDocument();
    expect(screen.getByText("NPM_UPSTREAM_FEED_URL")).toBeInTheDocument();
    expect(screen.getByText("false")).toBeInTheDocument();
    expect(
      screen.getByText(NPM_REPLICATION_FEED_DEFAULT_URL)
    ).toBeInTheDocument();
  });

  it("states that runtime status depends on the backend API", () => {
    render(<NpmUpstreamFeedCard />);

    expect(screen.getByText("Runtime status")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /artifact-keeper#3069/ });
    expect(link).toHaveAttribute("href", BACKEND_ISSUE_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("mentions SSRF validation for the future URL field", () => {
    render(<NpmUpstreamFeedCard />);

    expect(screen.getByText(/SSRF validation/)).toBeInTheDocument();
  });

  it("is read-only: renders no inputs, switches, or save buttons", () => {
    render(<NpmUpstreamFeedCard />);

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders one documentation row per documented env var", () => {
    render(<NpmUpstreamFeedCard />);

    for (const envVar of NPM_UPSTREAM_FEED_ENV_VARS) {
      expect(screen.getByText(envVar.name)).toBeInTheDocument();
    }
    expect(NPM_UPSTREAM_FEED_ENV_VARS.length).toBe(2);
  });
});
