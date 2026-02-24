import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock useEventStream
// ---------------------------------------------------------------------------

const mockUseEventStream = vi.fn();
vi.mock("@/hooks/use-event-stream", () => ({
  useEventStream: () => mockUseEventStream(),
}));

describe("EventStreamProvider", () => {
  it("calls useEventStream and returns null", async () => {
    const { EventStreamProvider } = await import("../event-stream-provider");
    const result = EventStreamProvider();
    expect(mockUseEventStream).toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
