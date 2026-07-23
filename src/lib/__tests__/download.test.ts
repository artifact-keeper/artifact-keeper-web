// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { triggerBrowserDownload } from "../download";

describe("triggerBrowserDownload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom implements neither of these; stub them.
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi
      .fn()
      .mockReturnValue("blob:mock-url");
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates an anchor, clicks it, and cleans up", () => {
    const clicked: string[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this.download);
      });

    triggerBrowserDownload("audit.csv", "a,b\r\n", "text/csv;charset=utf-8");

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("text/csv;charset=utf-8");

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(clicked[0]).toBe("audit.csv");

    // Anchor is removed synchronously; URL is revoked on the next tick.
    expect(document.querySelector("a[download]")).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("revokes the object URL even if the click throws", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("boom");
    });

    expect(() =>
      triggerBrowserDownload("x.json", "{}", "application/json")
    ).toThrow("boom");

    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});
