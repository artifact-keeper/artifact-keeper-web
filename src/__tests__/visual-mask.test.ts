import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Guards `e2e/visual-mask.css` against rules that match nothing (#786). The
 * `[data-testid="app-version"]` rule shipped with no element carrying that
 * testid, so version strings were baked into the visual baselines and a mask
 * that silently matched nothing looked exactly like one that worked.
 *
 * Every exact-match `[data-testid="..."]` selector in the mask must be set by
 * some non-test source file, either directly (`data-testid="..."`) or through
 * a component prop (`testId="..."`). Substring selectors (`*=`) are broad by
 * design and are not checked here.
 */
const root = join(__dirname, "../..");
const maskCss = readFileSync(join(root, "e2e/visual-mask.css"), "utf-8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "__tests__" ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const source = sourceFiles(join(root, "src"))
  .map((f) => readFileSync(f, "utf-8"))
  .join("\n");

const exactTestIds = [...maskCss.matchAll(/\[data-testid="([^"]+)"\]/g)].map(
  (m) => m[1],
);

describe("e2e/visual-mask.css", () => {
  it("masks the app version", () => {
    expect(exactTestIds).toContain("app-version");
  });

  it.each(exactTestIds)("has an element in src/ carrying testid %s", (id) => {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(source).toMatch(new RegExp(`(?:data-testid|testId)="${escaped}"`));
  });
});
