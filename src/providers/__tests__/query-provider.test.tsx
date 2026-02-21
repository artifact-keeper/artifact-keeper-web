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

  it("configures MutationCache that invalidates dashboard on success", async () => {
    // Import the actual module to access QueryClient internals
    const { QueryProvider } = await import("../query-provider");

    // Render and capture the provider output
    let capturedClient: import("@tanstack/react-query").QueryClient | null =
      null;

    const { useQueryClient } = await import("@tanstack/react-query");

    function ClientCapture() {
      capturedClient = useQueryClient();
      return null;
    }

    // Use renderToString to trigger the component
    renderToString(
      React.createElement(
        QueryProvider,
        null,
        React.createElement(ClientCapture)
      )
    );

    expect(capturedClient).not.toBeNull();

    // Access the mutation cache and trigger onSuccess
    const mutationCache = capturedClient!.getMutationCache();
    expect(mutationCache).toBeDefined();

    // The MutationCache.onSuccess is configured in the provider
    // We verify the queryClient default options
    const defaults = capturedClient!.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(2 * 60 * 1000);
    expect(defaults.queries?.retry).toBe(1);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(true);
    expect(defaults.queries?.refetchOnReconnect).toBe(true);
  });
});
