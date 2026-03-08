export type ContentCategory =
  | "code"
  | "markdown"
  | "image"
  | "pdf"
  | "binary";

const CODE_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  "py", "pyi",
  "rs",
  "go",
  "java", "kt", "kts", "scala",
  "c", "h", "cpp", "hpp", "cc",
  "cs",
  "rb",
  "php",
  "swift",
  "sh", "bash", "zsh", "fish",
  "sql",
  "r",
  "lua",
  "zig",
  "nim",
  "ex", "exs",
  "clj", "cljs",
  "hs",
  "ml", "mli",
  "json", "jsonc", "json5",
  "yaml", "yml",
  "toml",
  "xml", "xsl", "xsd", "svg",
  "html", "htm", "xhtml",
  "css", "scss", "sass", "less",
  "graphql", "gql",
  "proto", "protobuf",
  "tf", "tfvars", "hcl",
  "dockerfile",
  "makefile", "cmake",
  "gradle", "groovy",
  "pom",
  "ini", "cfg", "conf",
  "env", "env.local",
  "gitignore", "gitattributes", "editorconfig",
  "lock",
  "txt", "text", "log", "csv", "tsv",
  "pem", "crt", "csr", "key", "pub",
]);

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "tiff", "tif",
]);

const MARKDOWN_EXTENSIONS = new Set(["md", "mdx", "markdown"]);

const PDF_EXTENSIONS = new Set(["pdf"]);

function getExtension(filename: string): string {
  const lower = filename.toLowerCase();
  const basename = lower.split("/").pop() || lower;
  if (basename === "dockerfile" || basename === "makefile" || basename === "cmakelists.txt") {
    return basename;
  }
  const dot = basename.lastIndexOf(".");
  if (dot === -1 || dot === 0) return basename;
  return basename.slice(dot + 1);
}

export function classifyContent(filename: string): ContentCategory {
  const ext = getExtension(filename);
  if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  return "binary";
}

export function shikiLanguage(filename: string): string {
  const ext = getExtension(filename);
  const map: Record<string, string> = {
    js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
    ts: "typescript", tsx: "tsx",
    py: "python", pyi: "python",
    rs: "rust",
    go: "go",
    java: "java", kt: "kotlin", kts: "kotlin", scala: "scala",
    c: "c", h: "c", cpp: "cpp", hpp: "cpp", cc: "cpp",
    cs: "csharp",
    rb: "ruby",
    php: "php",
    swift: "swift",
    sh: "bash", bash: "bash", zsh: "bash", fish: "fish",
    sql: "sql",
    r: "r",
    lua: "lua",
    zig: "zig",
    ex: "elixir", exs: "elixir",
    hs: "haskell",
    json: "json", jsonc: "jsonc",
    yaml: "yaml", yml: "yaml",
    toml: "toml",
    xml: "xml", xsl: "xml", xsd: "xml", pom: "xml",
    html: "html", htm: "html", xhtml: "html",
    css: "css", scss: "scss", sass: "sass", less: "less",
    graphql: "graphql", gql: "graphql",
    proto: "protobuf",
    tf: "hcl", tfvars: "hcl", hcl: "hcl",
    dockerfile: "dockerfile",
    makefile: "makefile",
    gradle: "groovy", groovy: "groovy",
    ini: "ini", cfg: "ini", conf: "ini",
    csv: "csv",
    txt: "text", text: "text", log: "text",
    pem: "text", crt: "text", csr: "text", key: "text", pub: "text",
    md: "markdown", mdx: "mdx",
    svg: "xml",
  };
  return map[ext] || "text";
}

export function isLikelyText(buffer: ArrayBuffer): boolean {
  const sample = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 8192));
  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    if (byte === 0) return false;
  }
  return true;
}

export function hexDump(buffer: ArrayBuffer, maxBytes = 256): string {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, maxBytes));
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.slice(offset, offset + 16);
    const hex = Array.from(chunk)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    const ascii = Array.from(chunk)
      .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : "."))
      .join("");
    lines.push(
      `${offset.toString(16).padStart(8, "0")}  ${hex.padEnd(48)}  ${ascii}`
    );
  }
  return lines.join("\n");
}
