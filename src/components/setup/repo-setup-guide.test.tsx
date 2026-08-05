// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import type { Repository } from "@/types";
import { RepoSetupGuide } from "./repo-setup-guide";

function makeRepo(overrides: Partial<Repository> = {}): Repository {
  return {
    id: "r1",
    key: "my-repo",
    name: "My Repo",
    format: "maven",
    repo_type: "local",
    is_public: false,
    storage_used_bytes: 0,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("RepoSetupGuide", () => {
  afterEach(() => cleanup());

  it("renders client-variant tabs for JVM formats", () => {
    render(<RepoSetupGuide repo={makeRepo({ format: "maven" })} />);
    expect(screen.getByRole("tab", { name: "Maven" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Gradle (Groovy)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "SBT" })).toBeTruthy();
  });

  it("renders a flat step list (no tabs) for formats without client variants", () => {
    render(<RepoSetupGuide repo={makeRepo({ format: "docker", key: "imgs" })} />);
    expect(screen.getByText(/docker login/i)).toBeTruthy();
    expect(screen.queryAllByRole("tablist")).toHaveLength(0);
  });

  it("interpolates the repo key and picks proxy-vs-scoped npm config by repo type", () => {
    // remote (proxy): default registry — every install flows through the repo.
    render(
      <RepoSetupGuide repo={makeRepo({ format: "npm", key: "pkgs", repo_type: "remote" })} />,
    );
    const proxyPanel = screen.getByRole("tabpanel", { name: "Npm" });
    expect(proxyPanel.textContent).toContain("npm config set registry");
    expect(proxyPanel.textContent).not.toContain("@pkgs:registry");
    cleanup();

    // local (hosted): scope-routed so only @pkgs/* hits the artifact keeper.
    render(
      <RepoSetupGuide repo={makeRepo({ format: "npm", key: "pkgs", repo_type: "local" })} />,
    );
    const hostedPanel = screen.getByRole("tabpanel", { name: "Npm" });
    expect(hostedPanel.textContent).toContain("npm config set @pkgs:registry");
  });
});
