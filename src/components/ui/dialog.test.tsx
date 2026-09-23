// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

afterEach(cleanup);

function renderDialog(className?: string) {
  render(
    <Dialog open>
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>Title</DialogTitle>
        </DialogHeader>
        <p>Body</p>
        <DialogFooter>
          <button type="button">Submit</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return screen.getByRole("dialog");
}

/**
 * #900. Two defaults, both of which had been pasted into individual call sites
 * (nineteen of them carried `max-h-[85vh] overflow-y-auto`) and were therefore
 * missing from the ones that broke.
 */
describe("DialogContent layout defaults", () => {
  it("bounds its height and scrolls, so a tall dialog cannot push its footer off-screen", () => {
    const content = renderDialog();

    expect(content.className).toContain("max-h-[calc(100dvh-2rem)]");
    expect(content.className).toContain("overflow-y-auto");
  });

  /**
   * A grid item defaults to `min-width: auto`, so a wide child (the token
   * table, a long select value) grew the row past the dialog's own max-width
   * and spilled over its edge instead of scrolling inside it.
   */
  it("uses a shrinkable grid column so a wide child is bounded by the dialog", () => {
    const content = renderDialog();

    expect(content.className).toContain("grid-cols-[minmax(0,1fr)]");
  });

  /**
   * The defaults must stay overridable: several dialogs manage their own
   * scrolling with `overflow-hidden flex flex-col` plus an inner scroll area,
   * and a default that won would break them.
   */
  it("lets a call site override the height and overflow defaults", () => {
    const content = renderDialog("max-h-[80vh] overflow-hidden");

    expect(content.className).toContain("max-h-[80vh]");
    expect(content.className).toContain("overflow-hidden");
    expect(content.className).not.toContain("max-h-[calc(100dvh-2rem)]");
    expect(content.className).not.toContain("overflow-y-auto");
  });
});
