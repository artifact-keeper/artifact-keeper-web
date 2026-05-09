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

async function renderPageWithRepos(repos: Repository[]) {
  mockUseQuery.mockReturnValue({
    data: { items: repos, pagination: { total: repos.length } },
    isLoading: false,
  });
  const mod = await import("./page");
  const Page = mod.default;
  return render(<Page />);
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
    const user = userEvent.setup();
    await renderPageWithRepos([makeRepo({ format: "maven" })]);

    // Open the setup dialog by clicking the repo card
    const card = screen.getByText("my-jvm-repo").closest("div[data-slot='card']");
    expect(card).toBeTruthy();
    await user.click(card!);

    // Dialog title appears
    expect(await screen.findByText(/Set Up: my-jvm-repo/i)).toBeTruthy();

    // All four client tabs are rendered
    expect(screen.getByRole("tab", { name: "Maven" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Gradle (Groovy)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Gradle (Kotlin)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "SBT" })).toBeTruthy();
  });

  it("shows pom.xml snippet on the Maven tab (the default for maven format)", async () => {
    const user = userEvent.setup();
    await renderPageWithRepos([makeRepo({ format: "maven", key: "my-jvm-repo" })]);

    const card = screen.getByText("my-jvm-repo").closest("div[data-slot='card']");
    await user.click(card!);

    await screen.findByRole("dialog");
    // For a maven-format repo, Maven tab is selected by default
    expect(screen.getByRole("tab", { name: "Maven", selected: true })).toBeTruthy();
    const mavenPanel = screen.getByRole("tabpanel", { name: "Maven" });
    expect(mavenPanel.textContent).toContain("<dependency>");
    expect(mavenPanel.textContent).toContain("<artifactId>");
    expect(mavenPanel.textContent).toContain("settings.xml");
  });

  it("opens on the Gradle (Groovy) tab for a gradle-format repo", async () => {
    const user = userEvent.setup();
    await renderPageWithRepos([makeRepo({ format: "gradle", key: "my-jvm-repo" })]);

    const card = screen.getByText("my-jvm-repo").closest("div[data-slot='card']");
    await user.click(card!);

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
    const user = userEvent.setup();
    await renderPageWithRepos([makeRepo({ format: "sbt", key: "my-jvm-repo" })]);

    const card = screen.getByText("my-jvm-repo").closest("div[data-slot='card']");
    await user.click(card!);

    await screen.findByRole("dialog");
    expect(screen.getByRole("tab", { name: "SBT", selected: true })).toBeTruthy();
  });

  it("shows Groovy DSL snippet on the Gradle (Groovy) tab", async () => {
    const user = userEvent.setup();
    await renderPageWithRepos([makeRepo({ format: "gradle", key: "my-jvm-repo" })]);

    const card = screen.getByText("my-jvm-repo").closest("div[data-slot='card']");
    await user.click(card!);

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
    const user = userEvent.setup();
    await renderPageWithRepos([makeRepo({ format: "gradle", key: "my-jvm-repo" })]);

    const card = screen.getByText("my-jvm-repo").closest("div[data-slot='card']");
    await user.click(card!);

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
    const user = userEvent.setup();
    await renderPageWithRepos([makeRepo({ format: "sbt", key: "my-jvm-repo" })]);

    const card = screen.getByText("my-jvm-repo").closest("div[data-slot='card']");
    await user.click(card!);

    await screen.findByRole("dialog");
    await user.click(screen.getByRole("tab", { name: "SBT" }));

    const sbtPanel = screen.getByRole("tabpanel", { name: "SBT" });
    const text = sbtPanel.textContent ?? "";
    expect(text).toContain("build.sbt");
    expect(text).toContain("libraryDependencies");
    expect(text).toContain("resolvers");
  });

  it("interpolates the repo key into all JVM variant snippets", async () => {
    const user = userEvent.setup();
    await renderPageWithRepos([makeRepo({ format: "maven", key: "acme-libs" })]);

    const card = screen.getByText("acme-libs").closest("div[data-slot='card']");
    await user.click(card!);

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
    const user = userEvent.setup();
    await renderPageWithRepos([makeRepo({ format: "npm", key: "my-npm" })]);

    const card = screen.getByText("my-npm").closest("div[data-slot='card']");
    await user.click(card!);

    const dialog = await screen.findByRole("dialog");
    // npm snippet text should be present
    expect(dialog.textContent).toContain("npm config set");
    // No client-variant tablist inside the dialog (the outer page tabs don't
    // count -- those are the Repositories/CI-CD tabs at the page level).
    const tablistsInDialog = within(dialog).queryAllByRole("tablist");
    expect(tablistsInDialog.length).toBe(0);
  });

  it("renders docker steps as a flat list, not tabs", async () => {
    const user = userEvent.setup();
    await renderPageWithRepos([makeRepo({ format: "docker", key: "my-docker" })]);

    const card = screen.getByText("my-docker").closest("div[data-slot='card']");
    await user.click(card!);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("docker login");
    const tablistsInDialog = within(dialog).queryAllByRole("tablist");
    expect(tablistsInDialog.length).toBe(0);
  });
});
