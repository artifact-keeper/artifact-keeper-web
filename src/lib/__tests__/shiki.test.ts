import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHighlighter } from "shiki";

// ---------------------------------------------------------------------------
// Mock shiki to avoid loading the real highlighter (heavy dependency)
// ---------------------------------------------------------------------------

const mockHighlighter = {
  codeToHtml: vi.fn().mockReturnValue("<pre>highlighted</pre>"),
  getLoadedLanguages: vi.fn().mockReturnValue(["javascript"]),
  loadLanguage: vi.fn().mockResolvedValue(undefined),
};

vi.mock("shiki", () => ({
  createHighlighter: vi.fn().mockResolvedValue({
    codeToHtml: vi.fn().mockReturnValue("<pre>highlighted</pre>"),
    getLoadedLanguages: vi.fn().mockReturnValue(["javascript"]),
    loadLanguage: vi.fn().mockResolvedValue(undefined),
  }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("shiki highlighter singleton", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(createHighlighter).mockClear();
  });

  it("returns a Promise", async () => {
    const { getHighlighter } = await import("../shiki");
    const result = getHighlighter();
    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it("returns the same instance on subsequent calls (singleton)", async () => {
    const { getHighlighter } = await import("../shiki");
    const first = getHighlighter();
    const second = getHighlighter();
    expect(first).toBe(second);

    const [h1, h2] = await Promise.all([first, second]);
    expect(h1).toBe(h2);
  });

  it("only calls createHighlighter once across multiple invocations", async () => {
    const { getHighlighter } = await import("../shiki");
    await getHighlighter();
    await getHighlighter();
    await getHighlighter();
    expect(createHighlighter).toHaveBeenCalledTimes(1);
  });

  it("creates the highlighter with github-dark and github-light themes", async () => {
    const { getHighlighter } = await import("../shiki");
    await getHighlighter();

    expect(createHighlighter).toHaveBeenCalledWith(
      expect.objectContaining({
        themes: expect.arrayContaining(["github-dark", "github-light"]),
      })
    );

    // Verify exactly those two themes (no extras)
    const callArgs = vi.mocked(createHighlighter).mock.calls[0][0];
    expect(callArgs.themes).toEqual(["github-dark", "github-light"]);
  });

  it("creates the highlighter with a set of programming languages", async () => {
    const { getHighlighter } = await import("../shiki");
    await getHighlighter();

    const callArgs = vi.mocked(createHighlighter).mock.calls[0][0];
    expect(callArgs.langs).toBeDefined();
    expect(Array.isArray(callArgs.langs)).toBe(true);
    expect(callArgs.langs!.length).toBeGreaterThan(0);
    // Spot-check a few expected languages
    expect(callArgs.langs).toContain("typescript");
    expect(callArgs.langs).toContain("python");
    expect(callArgs.langs).toContain("rust");
  });

  it("returns a fresh instance after module reset", async () => {
    const mod1 = await import("../shiki");
    const h1 = await mod1.getHighlighter();

    vi.resetModules();

    const mod2 = await import("../shiki");
    const h2 = await mod2.getHighlighter();

    // After module reset, createHighlighter is called again (new module scope)
    expect(createHighlighter).toHaveBeenCalledTimes(2);
  });
});
