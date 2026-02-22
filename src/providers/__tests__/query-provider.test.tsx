import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";

// ---------------------------------------------------------------------------
// Mock invalidateGroup so we can verify MutationCache.onSuccess calls it
// ---------------------------------------------------------------------------

const mockInvalidateGroup = vi.fn();
vi.mock("@/lib/query-keys", () => ({
  invalidateGroup: (...args: unknown[]) => mockInvalidateGroup(...args),
}));

describe("QueryProvider", () => {
  it("renders children inside QueryClientProvider", async () => {
    const { QueryProvider } = await import("../query-provider");
    const html = renderToString(
      React.createElement(
        QueryProvider,
        null,
        React.createElement("div", { "data-testid": "child" }, "hello")
      )
    );
    expect(html).toContain("hello");
    expect(html).toContain("data-testid");
  });

  it("configures QueryClient with correct default options", async () => {
    const { QueryProvider } = await import("../query-provider");
    const { useQueryClient } = await import("@tanstack/react-query");

    const clientRef = { current: null as import("@tanstack/react-query").QueryClient | null };

    function ClientCapture() {
      // eslint-disable-next-line react-hooks/immutability
      clientRef.current = useQueryClient();
      return null;
    }

    renderToString(
      React.createElement(
        QueryProvider,
        null,
        React.createElement(ClientCapture)
      )
    );

    expect(clientRef.current).not.toBeNull();

    const defaults = clientRef.current!.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(2 * 60 * 1000);
    expect(defaults.queries?.retry).toBe(1);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(true);
    expect(defaults.queries?.refetchOnReconnect).toBe(true);
  });
});
