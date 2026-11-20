// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

// The real hook runs; only the cached /health query is mocked.
const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));
vi.mock("@/lib/api/admin", () => ({
  adminApi: { getHealth: vi.fn() },
}));

import { RequireExceptionsBackend } from "../require-exceptions-backend";

const Child = vi.fn(() => <p>queue</p>);

function onHealth(health: { version?: string } | undefined, isLoading = false) {
  mockUseQuery.mockReturnValue({ data: health, isLoading });
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe("RequireExceptionsBackend", () => {
  it.each([
    ["1.12.1", { version: "1.12.1" }],
    ["an unknown version", undefined],
    ["a version-less /health", {}],
  ])("names the backend release it needs, and mounts nothing, on %s", (_l, health) => {
    onHealth(health);
    render(
      <RequireExceptionsBackend>
        <Child />
      </RequireExceptionsBackend>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "requires backend 1.13.0 or later",
    );
    expect(Child).not.toHaveBeenCalled();
  });

  it("shows a spinner, not the notice, while /health is loading", () => {
    onHealth(undefined, true);
    render(
      <RequireExceptionsBackend>
        <Child />
      </RequireExceptionsBackend>,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(Child).not.toHaveBeenCalled();
  });

  it("renders its children on backend 1.13.0", () => {
    onHealth({ version: "1.13.0" });
    render(
      <RequireExceptionsBackend>
        <Child />
      </RequireExceptionsBackend>,
    );
    expect(screen.getByText("queue")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
