import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

const mockGetHealth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/admin", () => ({
  adminApi: { getHealth: () => mockGetHealth() },
}));

import { useExceptionsSupported } from "../use-exceptions-supported";
import { EXCEPTIONS_MIN } from "@/lib/backend-version";

function opts() {
  return mockUseQuery.mock.calls.at(-1)![0];
}

describe("useExceptionsSupported", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });
  });

  it("reads the shared, cached /health query", () => {
    useExceptionsSupported();
    expect(opts().queryKey).toEqual(["health"]);
    expect(opts().staleTime).toBe(5 * 60 * 1000);
    opts().queryFn();
    expect(mockGetHealth).toHaveBeenCalled();
  });

  it("names backend 1.13.0 as the minimum", () => {
    expect(EXCEPTIONS_MIN).toBe("1.13.0");
  });

  it.each([
    ["1.12.1", false],
    ["1.13.0-rc.1", false],
    ["dev", false],
    ["1.13.0", true],
    ["1.13.2", true],
    ["2.0.0", true],
  ])("on backend %s supported is %s", (version, expected) => {
    mockUseQuery.mockReturnValue({ data: { version }, isLoading: false });
    expect(useExceptionsSupported()).toEqual({
      supported: expected,
      isLoading: false,
    });
  });

  it("fails closed while the version is unknown, and says it is loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    expect(useExceptionsSupported()).toEqual({ supported: false, isLoading: true });
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });
    expect(useExceptionsSupported()).toEqual({ supported: false, isLoading: false });
  });
});
