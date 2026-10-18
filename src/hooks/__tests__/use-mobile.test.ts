// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useIsMobile } from "../use-mobile";

type Listener = () => void;

function mockViewport(width: number) {
  const listeners = new Set<Listener>();
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    media: query,
    matches: false,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  })) as unknown as typeof window.matchMedia;
  return {
    listeners,
    resize(next: number) {
      window.innerWidth = next;
      listeners.forEach((l) => l());
    },
  };
}

afterEach(() => cleanup());

describe("useIsMobile", () => {
  it("reports desktop at or above the breakpoint", () => {
    mockViewport(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("reports mobile below the breakpoint", () => {
    mockViewport(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("follows media query changes and unsubscribes on unmount", () => {
    const vp = mockViewport(1024);
    const { result, unmount } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => vp.resize(600));
    expect(result.current).toBe(true);
    unmount();
    expect(vp.listeners.size).toBe(0);
  });
});
