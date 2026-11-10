// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Repository } from "@/types";
import { RepoSetupGuide, claudeMarketplaceName } from "./repo-setup-guide";

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

  it.each(["github", "mise", "aqua"] as const)("provides authenticated finite-cache setup for %s", (format) => {
    const { container } = render(<RepoSetupGuide repo={makeRepo({ format, repo_type: "remote", key: "gh-mirror" })} />);
    expect(container.textContent).toContain("/general/gh-mirror/$1/$2/releases/download/$3");
    expect(container.textContent).toContain("YOUR_USERNAME:YOUR_TOKEN@");
    expect(container.textContent).toContain("mise install --locked");
    expect(container.textContent).toContain("seven days");
    expect(container.textContent).toContain("does not add standalone aqua CLI integration");
    expect(container.textContent).toContain("every reader of the mirror must be trusted");
    expect(container.textContent).not.toContain("/github/gh-mirror");
    expect(container.textContent).not.toContain("Push artifacts");
  });

  // artifact-keeper#5066 / web#1064: buf push has no --registry flag and a buf
  // module name is exactly registry/owner/name, so the guide must not hand out
  // either; it points at the JSON Connect API instead.
  it("gives a local protobuf repo the JSON Connect API, not buf CLI steps", () => {
    const { container } = render(<RepoSetupGuide repo={makeRepo({ format: "protobuf", key: "proto-local" })} />);
    const text = container.textContent ?? "";
    expect(text).toContain("/proto/proto-local/buf.registry.module.v1beta1.UploadService/Upload");
    expect(text).toContain("/proto/proto-local/buf.registry.module.v1beta1.DownloadService/Download");
    expect(text).toContain("artifact-keeper/artifact-keeper#5066");
    expect(text).not.toContain("--registry");
    expect(text).not.toContain("buf.yaml");
    expect(text).not.toContain("/proto/proto-local/myorg");
  });

  it.each(["remote", "virtual"] as const)("gives a %s protobuf repo no JSON upload step", (repo_type) => {
    const { container } = render(<RepoSetupGuide repo={makeRepo({ format: "protobuf", repo_type })} />);
    const text = container.textContent ?? "";
    expect(text).toContain("artifact-keeper/artifact-keeper#5066");
    expect(text).not.toContain("UploadService");
    expect(text).not.toContain("--registry");
  });

  it("does not advertise pull-through installation for a local mirror format", () => {
    const { container } = render(<RepoSetupGuide repo={makeRepo({ format: "github", repo_type: "local" })} />);
    expect(container.textContent).toContain("Create a remote GitHub mirror");
    expect(container.textContent).not.toContain("mise install --locked");
  });

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

  // Both formats are served by the backend's conda channel routes
  // (/conda/<key>/..., artifact-keeper handlers/conda.rs), never by /pypi (#908).
  it.each(["conda", "conda_native"] as const)(
    "gives a local %s repo conda channel setup with a Basic-auth channel URL and an upload tab (#908)",
    (format) => {
      const { container } = render(
        <RepoSetupGuide repo={makeRepo({ format, key: "sci", repo_type: "local" })} />,
      );
      expect(screen.getByRole("tab", { name: "Conda", selected: true })).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Mamba / Micromamba" })).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Upload" })).toBeTruthy();
      const panel = screen.getByRole("tabpanel", { name: "Conda" });
      expect(panel.textContent).toContain("~/.condarc");
      expect(panel.textContent).toContain("channels:");
      expect(panel.textContent).toContain("://YOUR_USERNAME:YOUR_TOKEN@");
      expect(panel.textContent).toContain("/conda/sci");
      expect(panel.textContent).toContain("conda install -c ");
      expect(panel.textContent).toContain("ahead of the channels you already use");
      expect(container.textContent).not.toContain("/pypi/");
      expect(container.textContent).not.toContain("pip install");
      expect(container.textContent).not.toContain("/api/v1/repositories/");
    },
  );

  it("shows mamba and micromamba commands and the curl PUT upload for a hosted conda repo", async () => {
    const user = userEvent.setup();
    render(<RepoSetupGuide repo={makeRepo({ format: "conda_native", key: "sci", repo_type: "staging" })} />);

    await user.click(screen.getByRole("tab", { name: "Mamba / Micromamba" }));
    const mamba = screen.getByRole("tabpanel", { name: "Mamba / Micromamba" });
    expect(mamba.textContent).toContain("mamba install -c ");
    expect(mamba.textContent).toContain("micromamba install -c ");
    expect(mamba.textContent).toContain("~/.mambarc");

    await user.click(screen.getByRole("tab", { name: "Upload" }));
    const upload = screen.getByRole("tabpanel", { name: "Upload" });
    expect(upload.textContent).toContain("curl -X PUT");
    expect(upload.textContent).toContain('Authorization: Bearer YOUR_TOKEN');
    expect(upload.textContent).toContain("/conda/sci/noarch/my-package-1.0.0-py_0.conda");
    expect(upload.textContent).toContain("write:artifacts");
  });

  it.each(["remote", "virtual"] as const)(
    "omits the upload tab and routes every install through a %s conda channel",
    (repo_type) => {
      render(<RepoSetupGuide repo={makeRepo({ format: "conda", key: "cf", repo_type })} />);
      expect(screen.queryByRole("tab", { name: "Upload" })).toBeNull();
      const panel = screen.getByRole("tabpanel", { name: "Conda" });
      expect(panel.textContent).toContain("://YOUR_USERNAME:YOUR_TOKEN@");
      expect(panel.textContent).toContain("/conda/cf");
      expect(panel.textContent).toContain("routes every install through the repository");
    },
  );

  // Artifact Keeper tokens are `<8 hex>_<32 hex>`; conda's `split_anaconda_token`
  // (regex `/t/([a-zA-Z0-9-]*)`) stops at the underscore, so a `/conda/t/<token>/`
  // channel makes conda request `/t/<8 hex>/conda_<32 hex>/<key>/...` and 404.
  // Basic auth in the URL is what conda, mamba and micromamba all send intact.
  it.each(["local", "remote"] as const)(
    "never embeds the token as an anaconda.org-style /t/ segment on a %s conda repo",
    async (repo_type) => {
      const user = userEvent.setup();
      const { container } = render(
        <RepoSetupGuide repo={makeRepo({ format: "conda", key: "sci", repo_type })} />,
      );
      expect(container.textContent).not.toContain("/conda/t/");
      expect(container.textContent).not.toContain("/t/YOUR_TOKEN");
      await user.click(screen.getByRole("tab", { name: "Mamba / Micromamba" }));
      const mamba = screen.getByRole("tabpanel", { name: "Mamba / Micromamba" });
      expect(mamba.textContent).toContain("://YOUR_USERNAME:YOUR_TOKEN@");
      expect(mamba.textContent).not.toContain("/conda/t/");
      expect(container.textContent).toContain("drop YOUR_USERNAME:YOUR_TOKEN@");
    },
  );

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

  // Agent Plugins (artifact-keeper#5251): Claude Code reads the marketplace
  // document directly; other agents install through the ak CLI.
  describe("agentplugins", () => {
    const origin = window.location.origin;

    it("gives a public repo a plain Claude Code marketplace URL and the install command", () => {
      render(
        <RepoSetupGuide repo={makeRepo({ format: "agentplugins", key: "plugins", is_public: true })} />,
      );
      expect(screen.getByRole("tab", { name: "Claude Code", selected: true })).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Cursor / Codex / VS Code" })).toBeTruthy();
      expect(screen.getByRole("tab", { name: "Publish" })).toBeTruthy();
      const panel = screen.getByRole("tabpanel", { name: "Claude Code" });
      const text = panel.textContent ?? "";
      expect(text).toContain(
        `claude plugin marketplace add ${origin}/agentplugins/plugins/claude-marketplace.json`,
      );
      expect(text).toContain("claude plugin install <plugin>@plugins");
      expect(text).not.toContain("/agentplugins/t/");
      expect(text).toContain("HTTPS only");
    });

    it("recommends the settings headers route for a private repo, then the token URL with its warning", () => {
      render(
        <RepoSetupGuide repo={makeRepo({ format: "agentplugins", key: "plugins", is_public: false })} />,
      );
      const panel = screen.getByRole("tabpanel", { name: "Claude Code" });
      const text = panel.textContent ?? "";
      const settings = Array.from(panel.querySelectorAll("code"))
        .map((c) => c.textContent ?? "")
        .find((c) => c.includes("extraKnownMarketplaces"));
      expect(JSON.parse(settings!)).toEqual({
        extraKnownMarketplaces: {
          plugins: {
            source: {
              source: "url",
              url: `${origin}/agentplugins/plugins/claude-marketplace.json`,
              headers: { Authorization: "Bearer YOUR_READ_TOKEN" },
            },
          },
        },
      });
      expect(text).toContain("Option 1 (recommended)");
      expect(text.indexOf("Option 1")).toBeLessThan(text.indexOf("Option 2"));
      expect(text).toContain("/plugin install");
      expect(text).toContain("with an expiry");
      expect(text).toContain(
        `claude plugin marketplace add ${origin}/agentplugins/t/YOUR_READ_TOKEN/plugins/claude-marketplace.json`,
      );
      expect(text).toContain("read:artifacts");
      expect(text).toContain("known_marketplaces.json");
      expect(text).toContain("server access logs");
      expect(text).toContain("claude plugin install <plugin>@plugins");
    });

    it("installs for Cursor, Codex and VS Code through the ak CLI", async () => {
      const user = userEvent.setup();
      render(<RepoSetupGuide repo={makeRepo({ format: "agentplugins", key: "plugins" })} />);
      await user.click(screen.getByRole("tab", { name: "Cursor / Codex / VS Code" }));
      const text =
        screen.getByRole("tabpanel", { name: "Cursor / Codex / VS Code" }).textContent ?? "";
      for (const harness of ["cursor", "codex", "vscode"]) {
        expect(text).toContain(
          `ak agent plugins install <plugin> --repo plugins --harness ${harness}`,
        );
      }
    });

    it("publishes with ak or an authenticated curl -T to the versioned zip path", async () => {
      const user = userEvent.setup();
      render(<RepoSetupGuide repo={makeRepo({ format: "agentplugins", key: "plugins" })} />);
      await user.click(screen.getByRole("tab", { name: "Publish" }));
      const text = screen.getByRole("tabpanel", { name: "Publish" }).textContent ?? "";
      expect(text).toContain("ak agent plugins publish ./my-plugin --repo plugins");
      expect(text).toContain("curl -T my-plugin-1.0.0.zip");
      expect(text).toContain("Authorization: Bearer YOUR_TOKEN");
      expect(text).toContain(
        `${origin}/agentplugins/plugins/my-plugin/1.0.0/my-plugin-1.0.0.zip`,
      );
      expect(text).not.toContain("/api/v1/repositories/");
      expect(text).toContain("A published version cannot be overwritten");
      expect(text).toContain("re-published only with identical content");
      expect(text).toContain("1.0.0+build is refused");
    });

    it("sanitises the repository key into Claude Code's marketplace name", () => {
      expect(claudeMarketplaceName("team-plugins_v1.0")).toBe("team-plugins_v1.0");
      expect(claudeMarketplaceName("a b/c")).toBe("a-b-c");
      expect(claudeMarketplaceName("a..b")).toBe("a-b");
      expect(claudeMarketplaceName("plugins")).toBe("plugins");
      expect(claudeMarketplaceName("my.plugins_v2")).toBe("my.plugins_v2");
      expect(claudeMarketplaceName("_private")).toBe("ak-_private");
      expect(claudeMarketplaceName("npm")).toBe("npm-ak");
      expect(claudeMarketplaceName("claudeai-x")).toBe("claudeai-x-ak");
    });
  });

  // MCP registries (artifact-keeper#5253): registry-aware clients read
  // /mcp/<key>; Claude Code installs per server.
  describe("mcp", () => {
    const origin = window.location.origin;
    const base = `${origin}/mcp/mcp-local`;
    const mcp = (over: Partial<Repository> = {}) =>
      makeRepo({ format: "mcp", key: "mcp-local", ...over });
    const panelText = (name: string) => screen.getByRole("tabpanel", { name }).textContent ?? "";

    it("points the VS Code gallery at a public repository", () => {
      render(<RepoSetupGuide repo={mcp({ is_public: true, visibility: "public" })} />);
      for (const tab of ["VS Code", "GitHub Copilot", "Claude Code", "Publish", "Registry API"]) {
        expect(screen.getByRole("tab", { name: tab })).toBeTruthy();
      }
      expect(screen.getByRole("tab", { name: "VS Code", selected: true })).toBeTruthy();
      const text = panelText("VS Code");
      expect(text).toContain(`"chat.mcp.gallery.serviceUrl": "${base}"`);
      expect(text).toContain("McpGalleryServiceUrl");
      expect(text).toContain("/v0.1/servers");
    });

    it.each(["private", "internal"] as const)(
      "explains that the VS Code gallery cannot read a %s repository",
      (visibility) => {
        render(<RepoSetupGuide repo={mcp({ visibility })} />);
        const text = panelText("VS Code");
        expect(text).toContain("sends no credential");
        expect(text).toContain(`This repository is ${visibility}`);
        expect(text).not.toContain(`"chat.mcp.gallery.serviceUrl": "${base}"`);
      },
    );

    it("gives Copilot the registry base URL and Claude Code the per-server route", async () => {
      const user = userEvent.setup();
      render(<RepoSetupGuide repo={mcp({ visibility: "private" })} />);
      await user.click(screen.getByRole("tab", { name: "GitHub Copilot" }));
      const copilot = panelText("GitHub Copilot");
      expect(copilot).toContain(base);
      expect(copilot).toContain("appends /v0.1/servers");
      expect(copilot).toContain("CORS");
      expect(copilot).toContain("This repository is private");
      await user.click(screen.getByRole("tab", { name: "Claude Code" }));
      const claude = panelText("Claude Code");
      expect(claude).toContain("no registry subscription");
      expect(claude).toContain(".mcp.json");
      expect(claude).toContain("Install");
    });

    it("publishes with curl or a hand-written mcp-publisher token, packages first", async () => {
      const user = userEvent.setup();
      render(<RepoSetupGuide repo={mcp({ mcp_package_policy: "own-repos" })} />);
      await user.click(screen.getByRole("tab", { name: "Publish" }));
      const text = panelText("Publish");
      expect(text).toContain(`curl -X POST ${base}/v0.1/publish`);
      expect(text).toContain('-H "Authorization: Bearer $AK_TOKEN"');
      expect(text).toContain("--data @server.json");
      expect(text).toContain(
        `{"token": "$AK_TOKEN", "method": "none", "registry": "${base}"}`,
      );
      expect(text).toContain("~/.config/mcp-publisher/token.json");
      expect(text).toContain("mcp-publisher publish");
      expect(text).toContain(
        "publish (or pull through a Remote) your package to Artifact Keeper first, then publish the server.json",
      );
      for (const code of ["mcp_external_registry", "mcp_package_not_found", "mcp_oci_floating_tag"]) {
        expect(text).toContain(code);
      }
      expect(text).toContain("generic artifact upload routes refuse MCP repositories");
    });

    it("labels an open catalog instead of the packages-first note", async () => {
      const user = userEvent.setup();
      render(<RepoSetupGuide repo={mcp({ mcp_package_policy: "open" })} />);
      await user.click(screen.getByRole("tab", { name: "Publish" }));
      const text = panelText("Publish");
      expect(text).toContain("package policy is open");
      expect(text).not.toContain("your package to Artifact Keeper first");
    });

    it("replaces Publish with the approval note on a Remote repository", async () => {
      const user = userEvent.setup();
      render(<RepoSetupGuide repo={mcp({ repo_type: "remote" })} />);
      expect(screen.queryByRole("tab", { name: "Publish" })).toBeNull();
      await user.click(screen.getByRole("tab", { name: "Approvals" }));
      const text = panelText("Approvals");
      expect(text).toContain("Remote repositories are read-only");
      expect(text).toContain("curation queue");
      expect(text).not.toContain("/v0.1/publish");
    });

    it("reads the registry API with a credential only when the repository is not public", async () => {
      const user = userEvent.setup();
      render(<RepoSetupGuide repo={mcp({ visibility: "private" })} />);
      await user.click(screen.getByRole("tab", { name: "Registry API" }));
      const text = panelText("Registry API");
      expect(text).toContain(`curl "${base}/v0.1/servers?search=weather&version=latest"`);
      expect(text).toContain("Authorization: Bearer $AK_TOKEN");
      cleanup();
      render(<RepoSetupGuide repo={mcp({ visibility: "public", is_public: true })} />);
      await user.click(screen.getByRole("tab", { name: "Registry API" }));
      expect(panelText("Registry API")).not.toContain("Authorization");
    });
  });
});
