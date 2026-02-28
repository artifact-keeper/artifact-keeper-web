// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks (must be before component import)
// ---------------------------------------------------------------------------

vi.mock("@/lib/sdk-client", () => ({}));

const mockCreateInstance = vi.fn();
const mockDeleteInstance = vi.fn();
vi.mock("@artifact-keeper/sdk", () => ({
  createInstance: (...args: any[]) => mockCreateInstance(...args),
  deleteInstance: (...args: any[]) => mockDeleteInstance(...args),
}));

vi.mock("@/lib/utils", () => ({
  isValidInstanceUrl: (url: string) => url.startsWith("http"),
}));

// ---------------------------------------------------------------------------
// Import component under test (after all vi.mock calls)
// ---------------------------------------------------------------------------

import { InstanceProvider, useInstance } from "../instance-provider";

// ---------------------------------------------------------------------------
// Test helper component
// ---------------------------------------------------------------------------

let capturedCtx: ReturnType<typeof useInstance> | null = null;

function TestConsumer() {
  const ctx = useInstance();
  // eslint-disable-next-line react-hooks/globals
  capturedCtx = ctx;
  return (
    <div>
      <span data-testid="active">{ctx.activeInstance.name}</span>
      <span data-testid="active-id">{ctx.activeInstance.id}</span>
      <span data-testid="count">{ctx.instances.length}</span>
      <span data-testid="statuses">{JSON.stringify(ctx.instanceStatuses)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// localStorage / window helpers
// ---------------------------------------------------------------------------

const mockStorage: Record<string, string> = {};

function setupLocalStorage() {
  for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        mockStorage[key] = val;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
    },
    writable: true,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InstanceProvider", () => {
  const originalLocation = window.location;
  let mockFetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedCtx = null;
    setupLocalStorage();

    // Mock window.location.reload
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, reload: vi.fn(), href: "/" },
      writable: true,
      configurable: true,
    });

    // Default fetch mock: resolves ok
    mockFetchFn = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetchFn);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  // 1. Renders children
  it("renders children passed to the provider", () => {
    render(
      <InstanceProvider>
        <span data-testid="child">Hello</span>
      </InstanceProvider>
    );
    expect(screen.getByTestId("child")).toHaveTextContent("Hello");
  });

  // 2. Defaults to local instance when no localStorage
  it("defaults to Local instance when localStorage is empty", () => {
    render(
      <InstanceProvider>
        <TestConsumer />
      </InstanceProvider>
    );
    expect(screen.getByTestId("active")).toHaveTextContent("Local");
    expect(screen.getByTestId("active-id")).toHaveTextContent("local");
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  // 3. Loads remote instances from localStorage
  it("loads remote instances from localStorage on mount", () => {
    const remoteInstances = [
      { id: "remote-1", name: "Remote 1", url: "https://remote.example.com" },
    ];
    mockStorage["ak_instances"] = JSON.stringify(remoteInstances);
    mockStorage["ak_active_instance"] = "remote-1";

    render(
      <InstanceProvider>
        <TestConsumer />
      </InstanceProvider>
    );

    expect(screen.getByTestId("count")).toHaveTextContent("2");
    expect(screen.getByTestId("active")).toHaveTextContent("Remote 1");
    expect(screen.getByTestId("active-id")).toHaveTextContent("remote-1");
  });

  // 4. useInstance throws outside provider
  it("throws an error when useInstance is called outside InstanceProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    function Bare() {
      useInstance();
      return null;
    }

    expect(() => render(<Bare />)).toThrow(
      "useInstance must be used within InstanceProvider"
    );

    spy.mockRestore();
  });

  // 5. switchInstance saves to localStorage and reloads
  it("switchInstance saves active ID to localStorage and reloads the page", () => {
    render(
      <InstanceProvider>
        <TestConsumer />
      </InstanceProvider>
    );

    act(() => {
      capturedCtx!.switchInstance("remote-1");
    });

    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "ak_active_instance",
      "remote-1"
    );
    expect(window.location.reload).toHaveBeenCalled();
  });

  // 6. addInstance calls SDK and adds to instances
  it("addInstance calls SDK createInstance and adds the new instance", async () => {
    mockCreateInstance.mockResolvedValue({
      data: { id: "new-1", name: "Remote 1", url: "https://remote.example.com" },
      error: undefined,
    });

    render(
      <InstanceProvider>
        <TestConsumer />
      </InstanceProvider>
    );

    expect(screen.getByTestId("count")).toHaveTextContent("1");

    await act(async () => {
      await capturedCtx!.addInstance({
        name: "Remote 1",
        url: "https://remote.example.com",
        apiKey: "key-123",
      });
    });

    expect(mockCreateInstance).toHaveBeenCalledWith({
      body: { name: "Remote 1", url: "https://remote.example.com", api_key: "key-123" },
    });

    expect(screen.getByTestId("count")).toHaveTextContent("2");
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "ak_instances",
      expect.stringContaining("new-1")
    );
  });

  // 7. addInstance throws on SDK error
  it("addInstance throws when SDK returns an error", async () => {
    const sdkError = { message: "Conflict", status: 409 };
    mockCreateInstance.mockResolvedValue({
      data: undefined,
      error: sdkError,
    });

    render(
      <InstanceProvider>
        <TestConsumer />
      </InstanceProvider>
    );

    let thrownError: unknown;
    await act(async () => {
      try {
        await capturedCtx!.addInstance({
          name: "Bad",
          url: "https://bad.example.com",
          apiKey: "key-bad",
        });
      } catch (e) {
        thrownError = e;
      }
    });

    expect(thrownError).toBe(sdkError);
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  // 8. removeInstance calls SDK and removes from instances
  it("removeInstance calls SDK deleteInstance and removes the instance", async () => {
    const remoteInstances = [
      { id: "remote-1", name: "Remote 1", url: "https://remote.example.com" },
    ];
    mockStorage["ak_instances"] = JSON.stringify(remoteInstances);
    mockDeleteInstance.mockResolvedValue({});

    render(
      <InstanceProvider>
        <TestConsumer />
      </InstanceProvider>
    );

    expect(screen.getByTestId("count")).toHaveTextContent("2");

    await act(async () => {
      await capturedCtx!.removeInstance("remote-1");
    });

    expect(mockDeleteInstance).toHaveBeenCalledWith({ path: { id: "remote-1" } });
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(window.localStorage.setItem).toHaveBeenCalledWith("ak_instances", "[]");
  });

  // 9. removeInstance ignores local instance
  it("removeInstance does nothing when called with 'local' id", async () => {
    render(
      <InstanceProvider>
        <TestConsumer />
      </InstanceProvider>
    );

    await act(async () => {
      await capturedCtx!.removeInstance("local");
    });

    expect(mockDeleteInstance).not.toHaveBeenCalled();
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  // 10. removeInstance switches to local if removing active instance
  it("removeInstance switches to local when removing the currently active instance", async () => {
    const remoteInstances = [
      { id: "remote-1", name: "Remote 1", url: "https://remote.example.com" },
    ];
    mockStorage["ak_instances"] = JSON.stringify(remoteInstances);
    mockStorage["ak_active_instance"] = "remote-1";
    mockDeleteInstance.mockResolvedValue({});

    render(
      <InstanceProvider>
        <TestConsumer />
      </InstanceProvider>
    );

    expect(screen.getByTestId("active-id")).toHaveTextContent("remote-1");

    await act(async () => {
      await capturedCtx!.removeInstance("remote-1");
    });

    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "ak_active_instance",
      "local"
    );
    expect(screen.getByTestId("active")).toHaveTextContent("Local");
  });

  // 11. refreshStatuses marks local as online
  it("refreshStatuses always marks local instance as online", async () => {
    render(
      <InstanceProvider>
        <TestConsumer />
      </InstanceProvider>
    );

    // The useEffect fires refreshStatuses via setTimeout(fn, 0)
    await waitFor(() => {
      const statuses = JSON.parse(screen.getByTestId("statuses").textContent!);
      expect(statuses.local).toBe(true);
    });
  });

  // 12. refreshStatuses checks remote health
  it("refreshStatuses fetches health endpoint for remote instances", async () => {
    const remoteInstances = [
      { id: "remote-1", name: "Remote 1", url: "https://remote.example.com" },
    ];
    mockStorage["ak_instances"] = JSON.stringify(remoteInstances);

    render(
      <InstanceProvider>
        <TestConsumer />
      </InstanceProvider>
    );

    await waitFor(() => {
      expect(mockFetchFn).toHaveBeenCalledWith(
        "https://remote.example.com/health",
        expect.objectContaining({ method: "GET" })
      );
    });

    await waitFor(() => {
      const statuses = JSON.parse(screen.getByTestId("statuses").textContent!);
      expect(statuses["remote-1"]).toBe(true);
      expect(statuses.local).toBe(true);
    });
  });

  // 13. refreshStatuses marks invalid URL instance as offline
  it("refreshStatuses marks instances with invalid URLs as offline", async () => {
    const remoteInstances = [
      { id: "bad-1", name: "Bad Instance", url: "ftp://not-valid.example.com" },
    ];
    mockStorage["ak_instances"] = JSON.stringify(remoteInstances);

    render(
      <InstanceProvider>
        <TestConsumer />
      </InstanceProvider>
    );

    await waitFor(() => {
      const statuses = JSON.parse(screen.getByTestId("statuses").textContent!);
      expect(statuses["bad-1"]).toBe(false);
    });

    // fetch should not have been called for the invalid URL
    expect(mockFetchFn).not.toHaveBeenCalledWith(
      expect.stringContaining("ftp://"),
      expect.anything()
    );
  });

  // 14. refreshStatuses marks remote as offline when health fetch fails
  it("refreshStatuses marks remote instance as offline when fetch rejects", async () => {
    const remoteInstances = [
      { id: "remote-1", name: "Remote 1", url: "https://remote.example.com" },
    ];
    mockStorage["ak_instances"] = JSON.stringify(remoteInstances);

    mockFetchFn.mockRejectedValue(new Error("Network error"));

    render(
      <InstanceProvider>
        <TestConsumer />
      </InstanceProvider>
    );

    await waitFor(() => {
      const statuses = JSON.parse(screen.getByTestId("statuses").textContent!);
      expect(statuses["remote-1"]).toBe(false);
    });
  });

  // 15. refreshStatuses handles URL with trailing slash
  it("refreshStatuses constructs correct URL when instance URL has trailing slash", async () => {
    const remoteInstances = [
      { id: "remote-1", name: "Remote 1", url: "https://remote.example.com/" },
    ];
    mockStorage["ak_instances"] = JSON.stringify(remoteInstances);

    render(
      <InstanceProvider>
        <TestConsumer />
      </InstanceProvider>
    );

    await waitFor(() => {
      expect(mockFetchFn).toHaveBeenCalledWith(
        "https://remote.example.com/health",
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  // 16. Handles invalid JSON in localStorage gracefully
  it("falls back to local-only when localStorage has invalid JSON", () => {
    mockStorage["ak_instances"] = "not-valid-json{{{";

    render(
      <InstanceProvider>
        <TestConsumer />
      </InstanceProvider>
    );

    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(screen.getByTestId("active")).toHaveTextContent("Local");
  });

  // 17. removeInstance tolerates SDK delete failure
  it("removeInstance still removes locally even when SDK delete fails", async () => {
    const remoteInstances = [
      { id: "remote-1", name: "Remote 1", url: "https://remote.example.com" },
    ];
    mockStorage["ak_instances"] = JSON.stringify(remoteInstances);
    mockDeleteInstance.mockRejectedValue(new Error("Server error"));

    render(
      <InstanceProvider>
        <TestConsumer />
      </InstanceProvider>
    );

    expect(screen.getByTestId("count")).toHaveTextContent("2");

    await act(async () => {
      await capturedCtx!.removeInstance("remote-1");
    });

    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  // 18. refreshStatuses marks non-ok response as offline
  it("refreshStatuses marks remote as offline when health returns non-ok status", async () => {
    const remoteInstances = [
      { id: "remote-1", name: "Remote 1", url: "https://remote.example.com" },
    ];
    mockStorage["ak_instances"] = JSON.stringify(remoteInstances);

    mockFetchFn.mockResolvedValue({ ok: false });

    render(
      <InstanceProvider>
        <TestConsumer />
      </InstanceProvider>
    );

    await waitFor(() => {
      const statuses = JSON.parse(screen.getByTestId("statuses").textContent!);
      expect(statuses["remote-1"]).toBe(false);
    });
  });

  // 19. activeInstance falls back to LOCAL_INSTANCE when activeId not found
  it("falls back to Local instance when activeId does not match any instance", () => {
    mockStorage["ak_active_instance"] = "nonexistent-id";

    render(
      <InstanceProvider>
        <TestConsumer />
      </InstanceProvider>
    );

    expect(screen.getByTestId("active")).toHaveTextContent("Local");
    expect(screen.getByTestId("active-id")).toHaveTextContent("local");
  });
});
