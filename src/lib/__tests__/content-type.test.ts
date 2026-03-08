import { describe, it, expect } from "vitest";
import {
  classifyContent,
  shikiLanguage,
  isLikelyText,
  hexDump,
} from "../content-type";

describe("classifyContent", () => {
  describe("code files", () => {
    it.each([
      ["script.js", "code"],
      ["module.py", "code"],
      ["main.rs", "code"],
      ["config.yaml", "code"],
      ["data.json", "code"],
      ["Cargo.toml", "code"],
      ["pom.xml", "code"],
      ["app.ts", "code"],
      ["main.go", "code"],
      ["App.java", "code"],
      ["deploy.sh", "code"],
      ["schema.sql", "code"],
      ["service.proto", "code"],
      ["infra.tf", "code"],
      ["cert.pem", "code"],
      ["readme.txt", "code"],
      ["style.css", "code"],
      ["index.html", "code"],
      ["query.graphql", "code"],
      ["build.gradle", "code"],
      ["settings.ini", "code"],
      ["data.csv", "code"],
    ] as const)("classifies %s as %s", (filename, expected) => {
      expect(classifyContent(filename)).toBe(expected);
    });
  });

  describe("markdown files", () => {
    it.each([
      ["README.md", "markdown"],
      ["guide.mdx", "markdown"],
      ["CHANGELOG.markdown", "markdown"],
    ] as const)("classifies %s as %s", (filename, expected) => {
      expect(classifyContent(filename)).toBe(expected);
    });
  });

  describe("image files", () => {
    it.each([
      ["logo.png", "image"],
      ["photo.jpg", "image"],
      ["photo.jpeg", "image"],
      ["animation.gif", "image"],
      ["icon.webp", "image"],
      ["favicon.ico", "image"],
      ["diagram.bmp", "image"],
      ["scan.tiff", "image"],
    ] as const)("classifies %s as %s", (filename, expected) => {
      expect(classifyContent(filename)).toBe(expected);
    });

    it("does not classify .svg as image (it is code/xml)", () => {
      expect(classifyContent("icon.svg")).toBe("code");
    });
  });

  describe("PDF files", () => {
    it("classifies .pdf as pdf", () => {
      expect(classifyContent("document.pdf")).toBe("pdf");
    });
  });

  describe("binary fallback", () => {
    it.each([
      ["program.exe", "binary"],
      ["library.dll", "binary"],
      ["module.wasm", "binary"],
      ["data.bin", "binary"],
      ["archive.tar", "binary"],
      ["unknown.xyz", "binary"],
    ] as const)("classifies %s as %s", (filename, expected) => {
      expect(classifyContent(filename)).toBe(expected);
    });
  });

  describe("special filenames without standard extensions", () => {
    it("classifies Dockerfile as code", () => {
      expect(classifyContent("Dockerfile")).toBe("code");
    });

    it("classifies Makefile as code", () => {
      expect(classifyContent("Makefile")).toBe("code");
    });

    it("handles Dockerfile in a path", () => {
      expect(classifyContent("project/docker/Dockerfile")).toBe("code");
    });

    it("handles Makefile in a path", () => {
      expect(classifyContent("src/Makefile")).toBe("code");
    });
  });

  describe("edge cases", () => {
    it("handles files with dots in the path", () => {
      expect(classifyContent("com.example.app/Main.java")).toBe("code");
    });

    it("handles uppercase extensions", () => {
      expect(classifyContent("IMAGE.PNG")).toBe("image");
      expect(classifyContent("README.MD")).toBe("markdown");
      expect(classifyContent("DATA.JSON")).toBe("code");
    });

    it("handles mixed-case filenames via case-insensitive matching", () => {
      // getExtension lowercases the input, so DockerFile -> dockerfile
      expect(classifyContent("DockerFile")).toBe("code");
      expect(classifyContent("DOCKERFILE")).toBe("code");
      expect(classifyContent("MAKEFILE")).toBe("code");
    });

    it("handles files with multiple dots", () => {
      expect(classifyContent("my.config.json")).toBe("code");
      expect(classifyContent("app.module.ts")).toBe("code");
    });
  });
});

describe("shikiLanguage", () => {
  describe("common language mappings", () => {
    it.each([
      ["script.js", "javascript"],
      ["app.ts", "typescript"],
      ["module.py", "python"],
      ["main.rs", "rust"],
      ["config.yaml", "yaml"],
      ["config.yml", "yaml"],
      ["data.json", "json"],
      ["layout.xml", "xml"],
      ["main.go", "go"],
      ["App.java", "java"],
      ["deploy.sh", "bash"],
      ["schema.sql", "sql"],
      ["service.proto", "protobuf"],
      ["infra.tf", "hcl"],
      ["style.css", "css"],
      ["index.html", "html"],
      ["Cargo.toml", "toml"],
      ["build.gradle", "groovy"],
      ["README.md", "markdown"],
      ["guide.mdx", "mdx"],
      ["icon.svg", "xml"],
      ["cert.pem", "text"],
      ["data.csv", "csv"],
    ] as const)("maps %s to %s", (filename, expected) => {
      expect(shikiLanguage(filename)).toBe(expected);
    });
  });

  describe("special file mappings", () => {
    it("maps Dockerfile to dockerfile", () => {
      expect(shikiLanguage("Dockerfile")).toBe("dockerfile");
    });

    it("maps Makefile to makefile", () => {
      expect(shikiLanguage("Makefile")).toBe("makefile");
    });

    it("maps .pom to xml", () => {
      expect(shikiLanguage("artifact.pom")).toBe("xml");
    });

    it("maps .tsx to tsx", () => {
      expect(shikiLanguage("Component.tsx")).toBe("tsx");
    });

    it("maps .jsx to jsx", () => {
      expect(shikiLanguage("Component.jsx")).toBe("jsx");
    });

    it("maps .kt to kotlin", () => {
      expect(shikiLanguage("Main.kt")).toBe("kotlin");
    });

    it("maps .scss to scss", () => {
      expect(shikiLanguage("theme.scss")).toBe("scss");
    });

    it("maps .ex to elixir", () => {
      expect(shikiLanguage("app.ex")).toBe("elixir");
    });

    it("maps .hs to haskell", () => {
      expect(shikiLanguage("Main.hs")).toBe("haskell");
    });
  });

  it("returns 'text' for unknown extensions", () => {
    expect(shikiLanguage("data.bin")).toBe("text");
    expect(shikiLanguage("archive.tar")).toBe("text");
    expect(shikiLanguage("program.exe")).toBe("text");
  });
});

describe("isLikelyText", () => {
  it("returns true for valid UTF-8 text", () => {
    const encoder = new TextEncoder();
    const buffer = encoder.encode("Hello, world! This is plain text.").buffer;
    expect(isLikelyText(buffer)).toBe(true);
  });

  it("returns true for text with high ASCII characters", () => {
    const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x0a, 0xc3, 0xa9]);
    expect(isLikelyText(bytes.buffer)).toBe(true);
  });

  it("returns false for buffer containing null bytes", () => {
    const bytes = new Uint8Array([0x48, 0x65, 0x00, 0x6c, 0x6f]);
    expect(isLikelyText(bytes.buffer)).toBe(false);
  });

  it("returns false for a null byte at the start", () => {
    const bytes = new Uint8Array([0x00, 0x50, 0x4b, 0x03, 0x04]);
    expect(isLikelyText(bytes.buffer)).toBe(false);
  });

  it("returns true for an empty buffer", () => {
    const buffer = new ArrayBuffer(0);
    expect(isLikelyText(buffer)).toBe(true);
  });

  it("returns true for a buffer with only printable ASCII", () => {
    const bytes = new Uint8Array([0x20, 0x7e, 0x41, 0x5a]);
    expect(isLikelyText(bytes.buffer)).toBe(true);
  });

  it("returns true for text with newlines and tabs", () => {
    const encoder = new TextEncoder();
    const buffer = encoder.encode("line1\nline2\ttab").buffer;
    expect(isLikelyText(buffer)).toBe(true);
  });
});

describe("hexDump", () => {
  it("produces correct hex and ASCII output for a small buffer", () => {
    const encoder = new TextEncoder();
    const buffer = encoder.encode("Hello").buffer;
    const result = hexDump(buffer);

    // Should have one line for 5 bytes
    const lines = result.split("\n");
    expect(lines).toHaveLength(1);

    // Check offset
    expect(lines[0]).toMatch(/^00000000/);

    // Check hex values for "Hello" (48 65 6c 6c 6f)
    expect(lines[0]).toContain("48 65 6c 6c 6f");

    // Check ASCII portion
    expect(lines[0]).toContain("Hello");
  });

  it("formats multiple lines for buffers larger than 16 bytes", () => {
    const encoder = new TextEncoder();
    const buffer = encoder.encode("ABCDEFGHIJKLMNOPQRSTUVWXYZ").buffer;
    const result = hexDump(buffer);

    const lines = result.split("\n");
    expect(lines).toHaveLength(2);

    // First line starts at offset 0
    expect(lines[0]).toMatch(/^00000000/);
    // Second line starts at offset 16 (0x10)
    expect(lines[1]).toMatch(/^00000010/);

    // First line ASCII should be first 16 chars
    expect(lines[0]).toContain("ABCDEFGHIJKLMNOP");
    // Second line ASCII should be remaining 10 chars
    expect(lines[1]).toContain("QRSTUVWXYZ");
  });

  it("respects the maxBytes parameter", () => {
    const bytes = new Uint8Array(512);
    for (let i = 0; i < 512; i++) bytes[i] = i % 256;

    // Limit to 32 bytes: should produce 2 lines (32 / 16)
    const result = hexDump(bytes.buffer, 32);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
  });

  it("shows non-printable characters as dots", () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x41, 0x7f, 0x80, 0xff]);
    const result = hexDump(bytes.buffer);

    const lines = result.split("\n");
    expect(lines).toHaveLength(1);

    // 0x01, 0x02 are non-printable -> "."
    // 0x41 is "A"
    // 0x7f is DEL (non-printable) -> "."
    // 0x80, 0xff are non-printable -> "."
    expect(lines[0]).toContain("..A...");
  });

  it("handles an empty buffer", () => {
    const buffer = new ArrayBuffer(0);
    const result = hexDump(buffer);
    expect(result).toBe("");
  });

  it("pads hex output to align ASCII column", () => {
    // 3 bytes: hex portion should be padded to 48 chars wide
    const bytes = new Uint8Array([0x41, 0x42, 0x43]);
    const result = hexDump(bytes.buffer);

    const lines = result.split("\n");
    expect(lines).toHaveLength(1);

    // Full line format: "00000000  <48-char hex>  ABC"
    // Total: 8 (offset) + 2 (gap) + 48 (hex padded) + 2 (gap) + 3 (ascii) = 63
    expect(lines[0]).toMatch(/^00000000  41 42 43\s+ABC$/);
    // Verify the line contains the hex portion padded to 48 chars
    // by checking the ASCII "ABC" starts at the correct position
    const asciiStart = lines[0].lastIndexOf("ABC");
    // offset(8) + gap(2) + hex(48) + gap(2) = 60
    expect(asciiStart).toBe(60);
  });

  it("uses the default maxBytes of 256", () => {
    const bytes = new Uint8Array(1024);
    for (let i = 0; i < 1024; i++) bytes[i] = 0x41;

    const result = hexDump(bytes.buffer);
    const lines = result.split("\n");
    // 256 bytes / 16 per line = 16 lines
    expect(lines).toHaveLength(16);
  });
});
