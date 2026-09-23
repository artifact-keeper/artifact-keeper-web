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

  it.each([0, undefined])("preserves root RPM setup when depth is %s", (repodata_depth) => {
    const { container } = render(<RepoSetupGuide repo={makeRepo({ format: "rpm", repodata_depth })} />);
    expect(container.textContent).toContain("/rpm/my-repo/\nenabled=1");
    expect(container.textContent).not.toContain("build-a");
    expect(container.textContent).not.toContain("curl");
  });
  it.each([1, 2])("uses a depth-%i root for RPM metadata, upload and YUM", (repodata_depth) => {
    const root = repodata_depth === 1 ? "build-a" : "build-a/x86_64";
    const { container } = render(<RepoSetupGuide repo={makeRepo({ format: "rpm", repodata_depth })} />);
    expect(container.textContent).toContain(`Repodata Depth: ${repodata_depth}`);
    expect(container.textContent).toContain(`/rpm/my-repo/${root}/\nenabled=1`);
    expect(container.textContent).toContain(`/rpm/my-repo/${root}/repodata/repomd.xml`);
    const uploadCommand = Array.from(container.querySelectorAll("code"))
      .find((code) => code.textContent?.includes("curl --fail-with-body -X PUT"))
      ?.textContent;
    const sourceFilename = uploadCommand?.match(/--upload-file (\S+)/)?.[1];
    const destinationPath = uploadCommand?.match(/\/rpm\/my-repo\/([^"]+)"/)?.[1];
    expect(sourceFilename).toBe("foo-1.2.3-1.x86_64.rpm");
    expect(destinationPath).toBe(`${root}/${sourceFilename}`);
    expect(uploadCommand).toContain('Authorization: Bearer YOUR_TOKEN');
    expect(container.textContent).toContain("name-version-release.arch.rpm");
    expect(container.textContent).toContain("including deeper descendants");
    expect(container.textContent).toContain("build-a and build-b are independent");
    expect(container.textContent).toContain("does not aggregate");
  });
  it("labels large-depth placeholders rather than generating a misleading runnable path", () => {
    const { container } = render(<RepoSetupGuide repo={makeRepo({ format: "rpm", repodata_depth: 1023 })} />);
    expect(container.textContent).toContain("<root-with-1023-directories>");
    expect(container.textContent).toContain("illustrative placeholders");
  });

  it("renders client-variant tabs for JVM formats", () => {
    render(<RepoSetupGuide repo={makeRepo({ format: "maven" })} />);
    expect(screen.getByRole("tab", { name: "Maven" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Gradle (Groovy)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "SBT" })).toBeTruthy();
  });

  it("gives a jupyter repo the PyPI client tabs, opening on JupyterLab (#833)", () => {
    render(<RepoSetupGuide repo={makeRepo({ format: "jupyter", key: "lab-ext" })} />);
    expect(screen.getByRole("tab", { name: "Pip" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "JupyterLab", selected: true })).toBeTruthy();
    const panel = screen.getByRole("tabpanel", { name: "JupyterLab" });
    expect(panel.textContent).toContain("c.PyPIExtensionManager.base_url");
    expect(panel.textContent).toContain("/pypi/lab-ext/pypi");
    // The manager has no credential setting, so the repo must allow anonymous read.
    expect(panel.textContent).toContain("must allow anonymous read");
    // Install side still gets pip's index config.
    expect(panel.textContent).toContain("pip.conf");
    expect(panel.textContent).toContain("index-url = ");
    expect(panel.textContent).not.toContain("not available on remote");
  });

  // Backend faults XML-RPC `browse` (-32001) on remote repositories
  // (artifact-keeper#3788), so the config line must not be offered there.
  it("replaces the Extension Manager step with a note for a remote jupyter repo", () => {
    render(
      <RepoSetupGuide repo={makeRepo({ format: "jupyter", key: "lab-proxy", repo_type: "remote" })} />,
    );
    const panel = screen.getByRole("tabpanel", { name: "JupyterLab" });
    expect(panel.textContent).not.toContain("PyPIExtensionManager");
    expect(panel.textContent).toContain("not available on remote repositories");
    expect(panel.textContent).toContain("hosted or virtual repository");
    expect(panel.textContent).toContain("pip install --index-url");
  });

  it("keeps the Extension Manager step for a virtual jupyter repo with the hosted-members caveat", () => {
    render(
      <RepoSetupGuide repo={makeRepo({ format: "jupyter", key: "lab-all", repo_type: "virtual" })} />,
    );
    const panel = screen.getByRole("tabpanel", { name: "JupyterLab" });
    expect(panel.textContent).toContain('c.PyPIExtensionManager.base_url = "');
    expect(panel.textContent).toContain("/pypi/lab-all/pypi");
    expect(panel.textContent).toContain("Members must be hosted repositories");
  });

  it("renders a flat step list (no tabs) for formats without client variants", () => {
    render(<RepoSetupGuide repo={makeRepo({ format: "docker", key: "imgs" })} />);
    expect(screen.getByText(/docker login/i)).toBeTruthy();
    expect(screen.queryAllByRole("tablist")).toHaveLength(0);
  });

  it("renders vscode gateway steps for VSCodium, code-server, and official VS Code", () => {
    const { container } = render(
      <RepoSetupGuide
        repo={makeRepo({ format: "vscode", key: "openvsx", repo_type: "remote", is_public: true })}
      />,
    );
    expect(screen.queryAllByRole("tablist")).toHaveLength(0);
    const text = container.textContent ?? "";
    expect(text).toContain("extensionsGallery");
    // VSCodium's persistent config must set latestUrlTemplate, not just
    // extensionUrlTemplate — omitting it can leak update lookups to
    // open-vsx.org directly.
    expect(text).toContain("latestUrlTemplate");
    expect(text).toContain("EXTENSIONS_GALLERY");
    expect(text).toMatch(/enterprise policy only/i);
  });

  it("shows only the direct-download note for local and private remote vscode repos", () => {
    for (const overrides of [
      { repo_type: "local" as const, is_public: false },
      { repo_type: "remote" as const, is_public: false },
    ]) {
      const { container, unmount } = render(
        <RepoSetupGuide repo={makeRepo({ format: "vscode", key: "openvsx", ...overrides })} />,
      );
      const text = container.textContent ?? "";
      expect(text).toContain("VS Code gallery requires a public Remote repository");
      expect(text).toContain("/vscode/openvsx/extensions/<publisher>/<name>/<version>/download");
      expect(text).not.toContain("extensionsGallery");
      expect(text).not.toContain("EXTENSIONS_GALLERY");
      unmount();
    }
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
