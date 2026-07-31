// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useDocumentTitle } from "../use-document-title";

afterEach(() => {
  cleanup();
  document.title = "Artifact Keeper";
});

describe("useDocumentTitle", () => {
  it("sets document.title with the app name suffix", () => {
    renderHook(() => useDocumentTitle("Repositories"));
    expect(document.title).toBe("Repositories · Artifact Keeper");
  });

  it("falls back to the app name for an empty title", () => {
    renderHook(() => useDocumentTitle(""));
    expect(document.title).toBe("Artifact Keeper");
  });

  it("restores the previous title on unmount", () => {
    document.title = "Artifact Keeper";
    const { unmount } = renderHook(() => useDocumentTitle("Search"));
    expect(document.title).toBe("Search · Artifact Keeper");
    unmount();
    expect(document.title).toBe("Artifact Keeper");
  });

  it("updates the title when the value changes", () => {
    const { rerender } = renderHook(({ title }) => useDocumentTitle(title), {
      initialProps: { title: "Packages" },
    });
    expect(document.title).toBe("Packages · Artifact Keeper");
    rerender({ title: "my-package" });
    expect(document.title).toBe("my-package · Artifact Keeper");
  });
});
