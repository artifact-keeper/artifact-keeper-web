import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks - declared before imports so vitest hoists them
// ---------------------------------------------------------------------------

const mockInvalidateQueries = vi.fn();
const mockQueryClient = { invalidateQueries: mockInvalidateQueries };

let effectCallback: (() => (() => void) | void) | null = null;

vi.mock("react", () => ({
  useEffect: vi.fn((cb: () => (() => void) | void) => {
    effectCallback = cb;
  }),
  useRef: vi.fn(() => ({ current: null })),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: vi.fn(() => mockQueryClient),
}));

let mockUser: { id: string } | null = { id: "test-user" };
vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(() => ({ user: mockUser })),
}));

// ---------------------------------------------------------------------------
// EventSource mock
// ---------------------------------------------------------------------------

type EventHandler = (e: { data: string }) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials: boolean;
  listeners = new Map<string, EventHandler>();
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string, opts?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = opts?.withCredentials ?? false;
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, handler: EventHandler) {
    this.listeners.set(event, handler);
  }

  close() {
    this.closed = true;
  }

  emit(event: string, data: string) {
    const handler = this.listeners.get(event);
    if (handler) handler({ data });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useEventStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", MockEventSource);
    MockEventSource.instances = [];
    mockUser = { id: "test-user" };
    effectCallback = null;
    mockInvalidateQueries.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function loadHook() {
    const mod = await import("../use-event-stream");
    mod.useEventStream();
    return effectCallback;
  }

  it("opens an EventSource when user is authenticated", async () => {
    const effect = await loadHook();
    expect(effect).not.toBeNull();
    effect!();
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe("/api/v1/events/stream");
    expect(MockEventSource.instances[0].withCredentials).toBe(true);
  });

  it("does not open EventSource when user is null", async () => {
    mockUser = null;
    const effect = await loadHook();
    expect(effect).not.toBeNull();
    effect!();
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("registers entity.changed and lagged event listeners", async () => {
    const effect = await loadHook();
    effect!();
    const es = MockEventSource.instances[0];
    expect(es.listeners.has("entity.changed")).toBe(true);
    expect(es.listeners.has("lagged")).toBe(true);
  });

  it("invalidates query keys on entity.changed event", async () => {
    const effect = await loadHook();
    effect!();
    const es = MockEventSource.instances[0];
    es.emit("entity.changed", JSON.stringify({ type: "user.created" }));
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["admin-users"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["admin-groups"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["admin-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["recent-repositories"] });
  });

  it("invalidates all queries on lagged event", async () => {
    const effect = await loadHook();
    effect!();
    const es = MockEventSource.instances[0];
    es.emit("lagged", "");
    expect(mockInvalidateQueries).toHaveBeenCalledWith();
  });

  it("ignores malformed entity.changed data", async () => {
    const effect = await loadHook();
    effect!();
    const es = MockEventSource.instances[0];
    es.emit("entity.changed", "not-json");
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  it("closes EventSource on cleanup", async () => {
    const effect = await loadHook();
    const cleanup = effect!();
    const es = MockEventSource.instances[0];
    expect(es.closed).toBe(false);
    if (typeof cleanup === "function") cleanup();
    expect(es.closed).toBe(true);
  });

  it("handles unknown event types without error", async () => {
    const effect = await loadHook();
    effect!();
    const es = MockEventSource.instances[0];
    es.emit("entity.changed", JSON.stringify({ type: "unknown.event" }));
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["admin-stats"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["recent-repositories"] });
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(2);
  });

  it("closes and retries after error with delay", async () => {
    const effect = await loadHook();
    effect!();
    const es = MockEventSource.instances[0];
    expect(es.closed).toBe(false);

    // Trigger error
    es.onerror!();
    expect(es.closed).toBe(true);
    expect(MockEventSource.instances).toHaveLength(1);

    // Advance past retry delay
    vi.advanceTimersByTime(30_000);
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1].closed).toBe(false);
  });

  it("does not retry after cleanup", async () => {
    const effect = await loadHook();
    const cleanup = effect!();
    const es = MockEventSource.instances[0];

    // Trigger error, then cleanup before retry fires
    es.onerror!();
    if (typeof cleanup === "function") cleanup();

    vi.advanceTimersByTime(30_000);
    // No new EventSource created - cleanup cancelled the retry
    expect(MockEventSource.instances).toHaveLength(1);
  });
});
