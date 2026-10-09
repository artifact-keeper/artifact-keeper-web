import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const css = readFileSync(join(__dirname, "../globals.css"), "utf-8");

/** Custom properties declared in the first block for `selector`. */
function tokens(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block in globals.css`);
  const body = css.slice(start, css.indexOf("}", start));
  const map = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    map.set(name, value.trim());
  }
  return map;
}

/** Relative luminance of an opaque `oklch(L C H)` color. */
function luminance(value: string): number {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (!match) throw new Error(`not an opaque oklch color: ${value}`);
  const [L, C, H] = match.slice(1).map(Number);
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const r = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS: [string, string][] = [
  ["--foreground", "--background"],
  ["--card-foreground", "--card"],
  ["--popover-foreground", "--popover"],
  ["--primary-foreground", "--primary"],
  ["--secondary-foreground", "--secondary"],
  ["--muted-foreground", "--muted"],
  ["--muted-foreground", "--background"],
  ["--accent-foreground", "--accent"],
  ["--sidebar-foreground", "--sidebar"],
  ["--sidebar-primary-foreground", "--sidebar-primary"],
  ["--sidebar-accent-foreground", "--sidebar-accent"],
];

describe("globals.css light-neutral theme", () => {
  const root = tokens(":root");
  const neutral = tokens(".light-neutral");

  it("overrides every color token the default light theme defines", () => {
    const missing = [...root.keys()].filter(
      (name) => name !== "--radius" && !neutral.has(name),
    );
    expect(missing).toEqual([]);
  });

  it("keeps the primary, ring and chart colors of the default light theme", () => {
    for (const name of ["--primary", "--ring", "--destructive", "--chart-1", "--chart-2"]) {
      expect(neutral.get(name)).toBe(root.get(name));
    }
  });

  it("uses an achromatic white background", () => {
    expect(neutral.get("--background")).toBe("oklch(1 0 0)");
  });

  it.each(TEXT_PAIRS)("%s on %s meets WCAG AA (4.5:1)", (fg, bg) => {
    expect(contrast(neutral.get(fg)!, neutral.get(bg)!)).toBeGreaterThanOrEqual(4.5);
  });
});
