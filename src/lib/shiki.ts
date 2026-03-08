import type { Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((shiki) =>
      shiki.createHighlighter({
        themes: ["github-dark", "github-light"],
        langs: [
          "javascript", "typescript", "jsx", "tsx",
          "python", "rust", "go", "java", "kotlin",
          "c", "cpp", "csharp", "ruby", "php", "swift",
          "bash", "sql", "lua", "zig", "elixir", "haskell",
          "json", "jsonc", "yaml", "toml", "xml", "html",
          "css", "scss", "graphql", "protobuf",
          "hcl", "dockerfile", "makefile", "groovy",
          "ini", "markdown", "mdx",
        ],
      })
    );
  }
  return highlighterPromise;
}
