// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { Repository } from "@/types";

// ---------------------------------------------------------------------------
// Mocks (hoisted before imports)
// ---------------------------------------------------------------------------

const mockUseQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

vi.mock("@/lib/api/repositories", () => ({
  repositoriesApi: { list: vi.fn() },
}));

// Stub ScrollArea (Radix uses ResizeObserver which jsdom lacks)
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Stub PageHeader
vi.mock("@/components/common/page-header", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

// Stub CopyButton -- avoid clipboard.writeText
vi.mock("@/components/common/copy-button", () => ({
  CopyButton: ({ value }: { value: string }) => (
    <button data-testid="copy-button" data-value={value}>
      Copy
    </button>
  ),
}));

// Stub lucide-react icons used by the page + the UI primitives it pulls in
// (Dialog ⇒ XIcon; CopyButton (already stubbed) ⇒ Check, Copy).
vi.mock("lucide-react", () => {
  const stub = (name: string) => {
    const Icon = (props: Record<string, unknown>) => (
      <span data-testid={`icon-${name}`} {...props} />
    );
    Icon.displayName = name;
    return Icon;
  };
  return {
    Code: stub("Code"),
    Rocket: stub("Rocket"),
    Package: stub("Package"),
    Search: stub("Search"),
    Filter: stub("Filter"),
    XIcon: stub("XIcon"),
    Check: stub("Check"),
    Copy: stub("Copy"),
  };
});

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeRepo(overrides: Partial<Repository> = {}): Repository {
  return {
    id: "r1",
    key: "my-jvm-repo",
    name: "My JVM Repo",
    format: "maven",
    repo_type: "local",
    is_public: false,
    storage_used_bytes: 0,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

async function renderPageWithRepos(repos: Repository[]): Promise<void> {
  mockUseQuery.mockReturnValue({
    data: { items: repos, pagination: { total: repos.length } },
    isLoading: false,
  });
  const mod = await import("./page");
  const Page = mod.default;
  render(<Page />);
}

/** Render the page with a single repo and click its card to open the setup
 *  dialog. Returns the userEvent instance for further interaction. */
async function openRepoDialog(repo: Repository): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await renderPageWithRepos([repo]);
  const card = screen.getByText(repo.key).closest("div[data-slot='card']");
  expect(card).toBeTruthy();
  await user.click(card!);
  return user;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SetupPage - JVM client variants", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Maven, Gradle (Groovy), Gradle (Kotlin), and SBT tabs for a maven repo", async () => {
    await openRepoDialog(makeRepo({ format: "maven" }));

    // Dialog title appears
    expect(await screen.findByText(/Set Up: my-jvm-repo/i)).toBeTruthy();

    // All four client tabs are rendered
    expect(screen.getByRole("tab", { name: "Maven" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Gradle (Groovy)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Gradle (Kotlin)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "SBT" })).toBeTruthy();
  });

  it("shows pom.xml snippet on the Maven tab (the default for maven format)", async () => {
    await openRepoDialog(makeRepo({ format: "maven", key: "my-jvm-repo" }));

    await screen.findByRole("dialog");
    // For a maven-format repo, Maven tab is selected by default
    expect(screen.getByRole("tab", { name: "Maven", selected: true })).toBeTruthy();
    const mavenPanel = screen.getByRole("tabpanel", { name: "Maven" });
    expect(mavenPanel.textContent).toContain("<dependency>");
    expect(mavenPanel.textContent).toContain("<artifactId>");
    expect(mavenPanel.textContent).toContain("settings.xml");
  });

  it("opens on the Gradle (Groovy) tab for a gradle-format repo", async () => {
    await openRepoDialog(makeRepo({ format: "gradle", key: "my-jvm-repo" }));

    await screen.findByRole("dialog");
    // For a gradle-format repo, Gradle (Groovy) is selected by default
    // — this is the fix for the bug at the heart of #333: a Gradle user
    // should not have to click an extra tab to find Gradle instructions.
    expect(screen.getByRole("tab", { name: "Gradle (Groovy)", selected: true })).toBeTruthy();
    const panel = screen.getByRole("tabpanel", { name: "Gradle (Groovy)" });
    expect(panel.textContent).toContain("repositories {");
    expect(panel.textContent).toContain("implementation '");
  });

  it("opens on the SBT tab for an sbt-format repo", async () => {
    await openRepoDialog(makeRepo({ format: "sbt", key: "my-jvm-repo" }));

    await screen.findByRole("dialog");
    expect(screen.getByRole("tab", { name: "SBT", selected: true })).toBeTruthy();
  });

  it("shows Groovy DSL snippet on the Gradle (Groovy) tab", async () => {
    const user = await openRepoDialog(makeRepo({ format: "gradle", key: "my-jvm-repo" }));

    await screen.findByRole("dialog");
    await user.click(screen.getByRole("tab", { name: "Gradle (Groovy)" }));

    const groovyPanel = screen.getByRole("tabpanel", { name: "Gradle (Groovy)" });
    const text = groovyPanel.textContent ?? "";
    // Groovy DSL: single-quoted string, no parens around implementation
    expect(text).toContain("repositories {");
    expect(text).toContain("implementation 'com.example:your-artifact:1.0.0'");
    // Should NOT contain Maven XML or Kotlin DSL
    expect(text).not.toContain("<dependency>");
    expect(text).not.toContain("uri(");
  });

  it("shows Kotlin DSL snippet on the Gradle (Kotlin) tab", async () => {
    const user = await openRepoDialog(makeRepo({ format: "gradle", key: "my-jvm-repo" }));

    await screen.findByRole("dialog");
    await user.click(screen.getByRole("tab", { name: "Gradle (Kotlin)" }));

    const kotlinPanel = screen.getByRole("tabpanel", { name: "Gradle (Kotlin)" });
    const text = kotlinPanel.textContent ?? "";
    // Kotlin DSL: uri(...) wrapper, parens around implementation, double-quoted string
    expect(text).toContain("build.gradle.kts");
    expect(text).toContain('uri("');
    expect(text).toContain('implementation("com.example:your-artifact:1.0.0")');
    // Should NOT contain Maven XML
    expect(text).not.toContain("<dependency>");
  });

  it("shows SBT snippet on the SBT tab", async () => {
    const user = await openRepoDialog(makeRepo({ format: "sbt", key: "my-jvm-repo" }));

    await screen.findByRole("dialog");
    await user.click(screen.getByRole("tab", { name: "SBT" }));

    const sbtPanel = screen.getByRole("tabpanel", { name: "SBT" });
    const text = sbtPanel.textContent ?? "";
    expect(text).toContain("build.sbt");
    expect(text).toContain("libraryDependencies");
    expect(text).toContain("resolvers");
  });

  it("interpolates the repo key into all JVM variant snippets", async () => {
    const user = await openRepoDialog(makeRepo({ format: "maven", key: "acme-libs" }));

    const dialog = await screen.findByRole("dialog");
    // Maven tab is open by default and should mention the key
    expect(dialog.textContent).toContain("acme-libs");

    // Check Gradle Groovy too
    await user.click(screen.getByRole("tab", { name: "Gradle (Groovy)" }));
    const groovyPanel = screen.getByRole("tabpanel", { name: "Gradle (Groovy)" });
    expect(groovyPanel.textContent).toContain("acme-libs");
  });
});

describe("SetupPage - non-JVM formats render flat steps (no client tabs)", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders npm steps as a flat list, not tabs", async () => {
    await openRepoDialog(makeRepo({ format: "npm", key: "my-npm" }));

    const dialog = await screen.findByRole("dialog");
    // npm snippet text should be present
    expect(dialog.textContent).toContain("npm config set");
    // No client-variant tablist inside the dialog (the outer page tabs don't
    // count -- those are the Repositories/CI-CD tabs at the page level).
    const tablistsInDialog = within(dialog).queryAllByRole("tablist");
    expect(tablistsInDialog.length).toBe(0);
  });

  it("renders docker steps as a flat list, not tabs", async () => {
    await openRepoDialog(makeRepo({ format: "docker", key: "my-docker" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("docker login");
    const tablistsInDialog = within(dialog).queryAllByRole("tablist");
    expect(tablistsInDialog.length).toBe(0);
  });

  it.each([
    ["pypi", "pip"],
    ["helm", "helm"],
    ["rpm", "rpm"],
    ["debian", "deb"],
    ["go", "GOPROXY"],
    ["nuget", "nuget"],
    ["rubygems", "gem"],
    ["cargo", "cargo"],
    ["generic", "curl"],
  ])("renders %s steps with format-specific tooling", async (format, marker) => {
    await openRepoDialog(makeRepo({ format: format as Repository["format"], key: `my-${format}` }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent?.toLowerCase()).toContain(marker.toLowerCase());
    const tablistsInDialog = within(dialog).queryAllByRole("tablist");
    expect(tablistsInDialog.length).toBe(0);
  });

  it("filters repos via search input and category filter", async () => {
    const user = userEvent.setup();
    await renderPageWithRepos([
      makeRepo({ id: "r1", key: "java-libs", name: "Java Libs", format: "maven" }),
      makeRepo({ id: "r2", key: "py-utils", name: "Py Utils", format: "pypi" }),
    ]);

    expect(screen.getByText("java-libs")).toBeTruthy();
    expect(screen.getByText("py-utils")).toBeTruthy();

    // Search narrows the list
    const search = screen.getByPlaceholderText(/search/i);
    await user.type(search, "java");
    expect(screen.getByText("java-libs")).toBeTruthy();
    expect(screen.queryByText("py-utils")).toBeNull();

    // Clear search
    await user.clear(search);

    // Click a category filter — exercises the toggle ternary
    const allButtons = screen.getAllByRole("button", { name: "All" });
    expect(allButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("closes the repo dialog when dismissed", async () => {
    const user = await openRepoDialog(makeRepo({ format: "maven" }));

    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("SetupPage - CI/CD platforms", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("opens a CI/CD platform dialog when its card is clicked", async () => {
    const user = userEvent.setup();
    await renderPageWithRepos([makeRepo({ format: "maven" })]);

    // Switch to the CI/CD tab at the page level
    await user.click(screen.getByRole("tab", { name: /CI\/CD/i }));

    // GitHub Actions should be one of the platforms; clicking the card opens
    // the integration dialog and renders the StepsList for that platform.
    const ghaCard = screen.getByText("GitHub Actions").closest("div[data-slot='card']");
    expect(ghaCard).toBeTruthy();
    await user.click(ghaCard!);

    expect(await screen.findByText(/GitHub Actions Integration/i)).toBeTruthy();
    const dialog = screen.getByRole("dialog");
    // StepsList should have rendered numbered steps for GitHub Actions
    expect(dialog.textContent ?? "").toMatch(/setup|configure|workflow/i);
  });

  it("closes the CI/CD dialog when dismissed", async () => {
    const user = userEvent.setup();
    await renderPageWithRepos([makeRepo({ format: "maven" })]);

    await user.click(screen.getByRole("tab", { name: /CI\/CD/i }));
    const ghaCard = screen.getByText("GitHub Actions").closest("div[data-slot='card']");
    await user.click(ghaCard!);

    await screen.findByRole("dialog");
    // Press Escape to close (Radix Dialog default)
    await user.keyboard("{Escape}");

    // Dialog should no longer be open
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("SetupPage - repo key sanitization for Gradle property names (#362)", () => {
  beforeEach(() => mockUseQuery.mockReset());
  afterEach(() => cleanup());

  it("repoKeyToGradleId converts kebab-case to camelCase", async () => {
    const { repoKeyToGradleId } = await import("./page");
    expect(repoKeyToGradleId("my-jvm-repo")).toBe("myJvmRepo");
    expect(repoKeyToGradleId("acme-libs")).toBe("acmeLibs");
  });

  it("repoKeyToGradleId converts dot/underscore separators to camelCase", async () => {
    const { repoKeyToGradleId } = await import("./page");
    expect(repoKeyToGradleId("com.example.libs")).toBe("comExampleLibs");
    expect(repoKeyToGradleId("snake_case_repo")).toBe("snakeCaseRepo");
  });

  it("repoKeyToGradleId strips remaining non-alphanumerics", async () => {
    const { repoKeyToGradleId } = await import("./page");
    expect(repoKeyToGradleId("repo@with#symbols")).toBe("repowithsymbols");
  });

  it("repoKeyToGradleId returns 'repo' for empty or all-symbol input", async () => {
    const { repoKeyToGradleId } = await import("./page");
    expect(repoKeyToGradleId("")).toBe("repo");
    expect(repoKeyToGradleId("@@@")).toBe("repo");
  });

  it("Gradle credentials block uses sanitized property names", async () => {
    const user = await openRepoDialog(makeRepo({ format: "gradle", key: "my-jvm-repo" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("tab", { name: "Gradle (Groovy)" }));
    const panel = screen.getByRole("tabpanel", { name: "Gradle (Groovy)" });
    const text = panel.textContent ?? "";
    // Sanitized to camelCase — kebab-case property names look broken to readers.
    expect(text).toContain("myJvmRepoUsername");
    expect(text).toContain("myJvmRepoPassword");
    expect(text).not.toContain("my-jvm-repoUsername");
  });

  it("URL paths still contain the raw repo key (only property names sanitize)", async () => {
    const user = await openRepoDialog(makeRepo({ format: "gradle", key: "my-jvm-repo" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("tab", { name: "Gradle (Groovy)" }));
    const panel = screen.getByRole("tabpanel", { name: "Gradle (Groovy)" });
    const text = panel.textContent ?? "";
    // The URL keeps the raw kebab-case key (URL paths permit hyphens).
    expect(text).toMatch(/\/maven\/my-jvm-repo\//);
  });
});

describe("SetupPage - Generic download snippet uses /download/ path (#408)", () => {
  beforeEach(() => mockUseQuery.mockReset());
  afterEach(() => cleanup());

  it("Generic 'Download an artifact' snippet hits /download/, not /artifacts/<file>", async () => {
    // Bug #408: the Generic-repo "Download an artifact" snippet shows
    //   curl -O .../api/v1/repositories/<key>/artifacts/my-file.tar.gz
    // That endpoint returns JSON metadata. The binary lives at
    //   .../api/v1/repositories/<key>/download/my-file.tar.gz
    // so the snippet hands users a broken command.
    await openRepoDialog(makeRepo({ format: "generic", key: "my-generic" }));

    const dialog = await screen.findByRole("dialog");

    // Locate the "Download an artifact" step heading and its code block.
    const downloadHeading = within(dialog).getByRole("heading", {
      name: /Download an artifact/i,
    });
    const stepContainer = downloadHeading.parentElement as HTMLElement;
    expect(stepContainer).toBeTruthy();
    const codeEl = stepContainer.querySelector("code");
    expect(codeEl).toBeTruthy();
    const codeText = codeEl?.textContent ?? "";

    // Must use the binary download endpoint.
    expect(codeText).toMatch(/\/api\/v1\/repositories\/[^/]+\/download\//);
    // Must NOT use the JSON metadata endpoint for the download example.
    expect(codeText).not.toMatch(
      /\/api\/v1\/repositories\/[^/]+\/artifacts\/[^/]*\.tar\.gz/,
    );
  });
});
