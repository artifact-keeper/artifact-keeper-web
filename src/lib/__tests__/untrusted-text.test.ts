import { describe, it, expect } from "vitest";
import {
  DEFAULT_MAX_LENGTH,
  NAME_MAX_LENGTH,
  formatUntrustedText,
  safeText,
} from "../untrusted-text";

const RLO = "\u202e";

describe("formatUntrustedText", () => {
  it("leaves ordinary text untouched", () => {
    const r = formatUntrustedText("Reads files from disk.");
    expect(r).toEqual({ text: "Reads files from disk.", full: "Reads files from disk.", escaped: 0, truncated: false });
  });

  it("treats null and undefined as empty", () => {
    expect(formatUntrustedText(null).text).toBe("");
    expect(formatUntrustedText(undefined).text).toBe("");
  });

  it("makes a bidi override visible, so exe.png-looking text reads as it is", () => {
    const r = formatUntrustedText(`${RLO}gnp.exe`);
    expect(r.text).toBe("[U+202E]gnp.exe");
    expect(r.text).not.toContain(RLO);
    expect(r.escaped).toBe(1);
  });

  it.each([
    ["LRE", "\u202a"], ["RLE", "\u202b"], ["PDF", "\u202c"], ["LRO", "\u202d"], ["RLO", "\u202e"],
    ["LRI", "\u2066"], ["RLI", "\u2067"], ["FSI", "\u2068"], ["PDI", "\u2069"],
    ["LRM", "\u200e"], ["RLM", "\u200f"], ["ALM", "\u061c"],
  ])("escapes the bidi control %s", (_name, ch) => {
    const r = formatUntrustedText(`a${ch}b`);
    expect(r.text).toBe(`a[U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}]b`);
  });

  it("escapes C0 and C1 controls, DEL, and an ANSI escape's ESC byte", () => {
    expect(formatUntrustedText("a\u0007b").text).toBe("a[U+0007]b");
    expect(formatUntrustedText("a\u001b[31mred").text).toBe("a[U+001B][31mred");
    expect(formatUntrustedText("a\u007fb").text).toBe("a[U+007F]b");
    expect(formatUntrustedText("a\u0085b").text).toBe("a[U+0085]b");
    expect(formatUntrustedText("a\u0000b").text).toBe("a[U+0000]b");
  });

  it("escapes the invisible zero-width space, word joiner and BOM", () => {
    expect(formatUntrustedText("a\u200bb").text).toBe("a[U+200B]b");
    expect(formatUntrustedText("a\u2060b").text).toBe("a[U+2060]b");
    expect(formatUntrustedText("a\ufeffb").text).toBe("a[U+FEFF]b");
  });

  it("escapes line and paragraph separators", () => {
    expect(formatUntrustedText("a\u2028b\u2029c").text).toBe("a[U+2028]b[U+2029]c");
  });

  it("escapes Unicode tag characters, which can hide an instruction in plain sight", () => {
    const hidden = String.fromCodePoint(0xe0041, 0xe0042);
    const r = formatUntrustedText(`hi${hidden}`);
    expect(r.text).toBe("hi[U+E0041][U+E0042]");
    expect(r.escaped).toBe(2);
  });

  it("keeps tab, line feed and carriage return, which multi-line descriptions use", () => {
    expect(formatUntrustedText("a\tb\nc\r\nd").text).toBe("a\tb\nc\r\nd");
  });

  it("keeps the zero-width joiners that real text needs", () => {
    const family = "👨\u200d👩\u200d👧";
    expect(formatUntrustedText(family).text).toBe(family);
    expect(formatUntrustedText("می\u200cخواهم").text).toBe("می\u200cخواهم");
  });

  it("counts every escaped character", () => {
    expect(formatUntrustedText(`${RLO}a\u200b\u0007`).escaped).toBe(3);
  });

  describe("long text", () => {
    it("cuts over-long text with an ellipsis and keeps the whole text", () => {
      const long = "x".repeat(DEFAULT_MAX_LENGTH + 50);
      const r = formatUntrustedText(long);
      expect(r.truncated).toBe(true);
      expect(r.text).toBe(`${"x".repeat(DEFAULT_MAX_LENGTH)}…`);
      expect(r.full).toBe(long);
    });

    it("does not cut text exactly at the limit", () => {
      const r = formatUntrustedText("y".repeat(10), { max: 10 });
      expect(r.truncated).toBe(false);
      expect(r.text).toBe("y".repeat(10));
    });

    it("never splits a surrogate pair", () => {
      const r = formatUntrustedText("😀😀😀😀", { max: 3 });
      expect(r.text).toBe("😀😀😀…");
    });

    it("counts the visible escape, not the hidden character, towards the limit", () => {
      const r = formatUntrustedText(`${RLO}abcdef`, { max: 8 });
      // "[U+202E]" is 8 characters, so the rest is cut.
      expect(r.text).toBe("[U+202E]…");
      expect(r.full).toBe("[U+202E]abcdef");
    });

    it("has a tighter limit for names", () => {
      expect(NAME_MAX_LENGTH).toBeLessThan(DEFAULT_MAX_LENGTH);
    });
  });
});

describe("safeText", () => {
  it("returns just the displayed string", () => {
    expect(safeText(`${RLO}gnp.exe`)).toBe("[U+202E]gnp.exe");
    expect(safeText("z".repeat(20), { max: 5 })).toBe("zzzzz…");
  });
});
