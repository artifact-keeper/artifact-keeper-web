// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

import {
  MiddleEllipsis,
  splitForMiddleEllipsis,
} from "@/components/common/middle-ellipsis";

// The name that motivated #768: long enough to widen the flat artifact table
// past the repository detail panel, where the overflow was then clipped by an
// `overflow-x: hidden` viewport with no way to scroll to it.
const LONG_NAME =
  "foobar-testfile-foobar-very-long-filename-to-demonstrate-the-artifact-keeper-web-artifact-name-problem.txt";

describe("splitForMiddleEllipsis", () => {
  it("keeps the trailing characters out of the clippable head", () => {
    const { head, tail } = splitForMiddleEllipsis(LONG_NAME);
    expect(tail).toBe("-problem.txt");
    expect(head + tail).toBe(LONG_NAME);
  });

  it("preserves a variant suffix that end-truncation would collapse", () => {
    // The reason the elision is in the middle: these two differ only in their
    // tail, so clipping the end would render them identical on screen.
    const plain = splitForMiddleEllipsis(
      "some-package-v2.11.2-cloudflare-ovh-tlsconsul",
    );
    const docker = splitForMiddleEllipsis(
      "some-package-v2.11.2-cloudflare-ovh-tlsconsul-docker",
    );
    expect(plain.tail).not.toBe(docker.tail);
    expect(docker.tail).toContain("docker");
  });

  it("leaves a short value whole so nothing is elided needlessly", () => {
    expect(splitForMiddleEllipsis("lib.jar")).toEqual({
      head: "lib.jar",
      tail: "",
    });
  });

  it("leaves a value whole at the boundary and splits just past it", () => {
    // Boundary is tailLength * 2: at or below, no split.
    expect(splitForMiddleEllipsis("a".repeat(24)).tail).toBe("");
    expect(splitForMiddleEllipsis("a".repeat(25)).tail).toHaveLength(12);
  });

  it("honours a custom tail length", () => {
    const { head, tail } = splitForMiddleEllipsis(LONG_NAME, 4);
    expect(tail).toBe(".txt");
    expect(head + tail).toBe(LONG_NAME);
  });

  it("degenerates to end-truncation for a non-positive tail length", () => {
    expect(splitForMiddleEllipsis(LONG_NAME, 0).tail).toBe("");
    expect(splitForMiddleEllipsis(LONG_NAME, -5).tail).toBe("");
  });

  it("never drops or reorders characters", () => {
    for (const value of [
      "",
      "a",
      "a".repeat(200),
      LONG_NAME,
      "no-extension-but-quite-long-indeed",
    ]) {
      const { head, tail } = splitForMiddleEllipsis(value);
      expect(head + tail).toBe(value);
    }
  });
});

describe("MiddleEllipsis", () => {
  // This repo does not enable testing-library auto-cleanup, so renders would
  // otherwise accumulate and the title queries would match several nodes.
  afterEach(() => {
    cleanup();
  });

  it("renders the full value as the native tooltip", () => {
    render(<MiddleEllipsis text={LONG_NAME} />);
    expect(screen.getByTitle(LONG_NAME)).toBeInTheDocument();
  });

  it("renders the whole value across head and tail so it stays selectable", () => {
    render(<MiddleEllipsis text={LONG_NAME} />);
    // The ellipsis is painted by CSS `text-overflow`, not inserted into the
    // DOM, so the text content remains complete and copyable.
    expect(screen.getByTitle(LONG_NAME).textContent).toBe(LONG_NAME);
  });

  it("puts the clippable head and the pinned tail in separate elements", () => {
    render(<MiddleEllipsis text={LONG_NAME} />);
    const root = screen.getByTitle(LONG_NAME);
    const [head, tail] = Array.from(root.children) as HTMLElement[];
    // `truncate` supplies overflow:hidden + ellipsis; without `min-w-0` on the
    // ancestors a flex item refuses to shrink and nothing would ever elide.
    expect(head).toHaveClass("truncate");
    expect(root).toHaveClass("min-w-0");
    // The tail must NOT shrink — that is what keeps the elision in the middle.
    expect(tail).toHaveClass("shrink-0");
    expect(tail.textContent).toBe("-problem.txt");
  });

  it("renders a short value as a single element with no pinned tail", () => {
    render(<MiddleEllipsis text="lib.jar" />);
    const root = screen.getByTitle("lib.jar");
    expect(root.children).toHaveLength(1);
    expect(root.textContent).toBe("lib.jar");
  });
});
