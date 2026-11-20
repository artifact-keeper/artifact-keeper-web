// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { ApiError } from "@/lib/api/fetch";
import type { PackageException } from "@/lib/api/exceptions";

let queryResult: { data?: { items: PackageException[]; total: number }; error?: unknown } = {};
const queryConfigs: Array<{ queryKey: unknown; queryFn: () => unknown; retry?: unknown; enabled?: boolean }> = [];
// The exception queue needs backend 1.13.0 (EXCEPTIONS_MIN); tests default
// to a backend that has it and the gate tests turn it off.
const mockExceptionsSupported = vi.hoisted(() =>
  vi.fn(() => ({ supported: true, isLoading: false })),
);
vi.mock("@/hooks/use-exceptions-supported", () => ({
  useExceptionsSupported: () => mockExceptionsSupported(),
}));
beforeEach(() => {
  mockExceptionsSupported.mockImplementation(() => ({
    supported: true,
    isLoading: false,
  }));
});

/** Drive the exception-queue gate from a `/health` version, as the hook does */
function onBackend(version: string | undefined) {
  mockExceptionsSupported.mockImplementation(() => ({
    supported: backendAtLeast(version, EXCEPTIONS_MIN),
    isLoading: false,
  }));
}

vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: { queryKey: unknown; queryFn: () => unknown; retry?: unknown; enabled?: boolean }) => {
    queryConfigs.push(config);
    return queryResult;
  },
}));

const mockMine = vi.fn();
vi.mock("@/lib/api/exceptions", () => ({
  exceptionsApi: { mine: (...a: unknown[]) => mockMine(...a) },
}));

import { MyExceptionRequests } from "../my-exception-requests";
import { backendAtLeast, EXCEPTIONS_MIN } from "@/lib/backend-version";

const ROW: PackageException = {
  id: "r1",
  repositoryKey: "npm-remote",
  packageName: "left-pad",
  packageVersion: "1.3.0",
  gate: "scan",
  status: "pending",
  origin: "requested",
  justification: "the build needs it",
  requestCount: 1,
  requestedAt: "2026-11-01T00:00:00Z",
  lastRequestedAt: "2026-11-01T00:00:00Z",
  reviewedAt: null,
  reviewedBy: null,
  reviewedByUsername: null,
  reviewReason: null,
  requestedBy: "u1",
  requestedByUsername: "dev",
  expiresAt: null,
  upstreamPublishedAt: null,
  instanceLocked: false,
};

beforeEach(() => {
  queryResult = {};
  queryConfigs.length = 0;
  mockMine.mockReset();
});
afterEach(cleanup);

describe("MyExceptionRequests", () => {
  it("asks the requester route once, without retrying a missing endpoint", () => {
    render(<MyExceptionRequests />);
    expect(queryConfigs[0].queryKey).toEqual(["exceptions", "mine"]);
    expect(queryConfigs[0].retry).toBe(false);
    queryConfigs[0].queryFn();
    expect(mockMine).toHaveBeenCalledWith({ perPage: 20 });
  });

  it("shows what became of each request", () => {
    queryResult = {
      data: {
        total: 3,
        items: [
          ROW,
          { ...ROW, id: "r2", packageName: "lodash", packageVersion: "*", gate: "curation", status: "approved", expiresAt: null },
          { ...ROW, id: "r3", packageName: "minimist", status: "rejected", reviewReason: "use the patched release" },
        ],
      },
    };
    render(<MyExceptionRequests />);
    expect(screen.getByRole("heading", { name: "Your requests" })).toBeInTheDocument();
    expect(screen.getByText("left-pad@1.3.0")).toBeInTheDocument();
    expect(screen.getByText("Waiting for a reviewer")).toBeInTheDocument();
    expect(screen.getByText("lodash")).toBeInTheDocument();
    expect(screen.getByText("Granted")).toBeInTheDocument();
    expect(screen.getByText("with no expiry")).toBeInTheDocument();
    expect(screen.getByText("Refused")).toBeInTheDocument();
    expect(screen.getByText("use the patched release")).toBeInTheDocument();
  });

  it("says until when a grant lasts", () => {
    queryResult = {
      data: { total: 1, items: [{ ...ROW, status: "approved", expiresAt: "2027-02-01T00:00:00Z" }] },
    };
    render(<MyExceptionRequests />);
    expect(screen.getByText(/^until /)).toBeInTheDocument();
  });

  it("renders nothing with no requests, or on a backend without the route", () => {
    queryResult = { data: { total: 0, items: [] } };
    const { container, rerender } = render(<MyExceptionRequests />);
    expect(container).toBeEmptyDOMElement();
    queryResult = { error: new ApiError(405, "") };
    rerender(<MyExceptionRequests />);
    expect(container).toBeEmptyDOMElement();
    queryResult = { error: new ApiError(404, "") };
    rerender(<MyExceptionRequests />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([["1.12.1"], [undefined]])(
    "renders nothing, and does not ask, on backend %s",
    (version) => {
      onBackend(version);
      queryResult = { data: { total: 1, items: [ROW] } };
      const { container } = render(<MyExceptionRequests />);
      expect(container).toBeEmptyDOMElement();
      expect(queryConfigs[0].enabled).toBe(false);
    },
  );

  it("asks and shows the requests on backend 1.13.0", () => {
    onBackend("1.13.0");
    queryResult = { data: { total: 1, items: [ROW] } };
    render(<MyExceptionRequests />);
    expect(queryConfigs[0].enabled).toBe(true);
    expect(screen.getByText("left-pad@1.3.0")).toBeInTheDocument();
  });
});
