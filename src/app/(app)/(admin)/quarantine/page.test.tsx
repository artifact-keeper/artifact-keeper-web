// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

interface MutationConfig {
  mutationFn: (...a: unknown[]) => unknown;
  onSuccess?: (...a: unknown[]) => void;
  onError?: (...a: unknown[]) => void;
}
const mutation = vi.hoisted(() => ({
  configs: [] as MutationConfig[],
  releaseMutate: vi.fn(),
  rejectMutate: vi.fn(),
  slot: 0,
}));
const mockInvalidate = vi.fn();
let holdData: { data: unknown; isLoading?: boolean; isError?: boolean; error?: unknown } = {
  data: { items: [], total: 0 },
  isLoading: false,
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[]; queryFn: () => unknown; enabled?: boolean }) => {
    if (opts.enabled !== false) {
      try {
        opts.queryFn();
      } catch {
        /* ignore */
      }
    }
    return { refetch: vi.fn(), isFetching: false, ...holdData };
  },
  // The page registers release then reject. Each render would otherwise mint
  // a fresh mutate fn; keep the pair stable so Confirm hits the same spies.
  useMutation: (config: MutationConfig) => {
    mutation.configs.push(config);
    const mutate = mutation.slot++ % 2 === 0 ? mutation.releaseMutate : mutation.rejectMutate;
    return { mutate, isPending: false };
  },
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

const mockToastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: vi.fn(),
  },
}));

const api = {
  listQuarantine: vi.fn(),
  release: vi.fn(),
  reject: vi.fn(),
};
vi.mock("@/lib/api/holds", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/holds")>("@/lib/api/holds");
  return {
    ...actual,
    holdsApi: {
      listQuarantine: (...a: unknown[]) => api.listQuarantine(...a),
      release: (...a: unknown[]) => api.release(...a),
      reject: (...a: unknown[]) => api.reject(...a),
    },
  };
});

let isAdmin = true;
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ user: isAdmin ? { is_admin: true } : { is_admin: false } }),
}));

vi.mock("@/components/common/holds-nav", () => ({
  HoldsNav: () => <nav aria-label="Download holds">Holds nav</nav>,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import QuarantineHoldsPage from "./page";

const ACTIVE = {
  artifactId: "a1",
  name: "leftpad",
  version: "1.0.0",
  repositoryKey: "npm-local",
  repositoryFormat: "npm",
  quarantineStatus: "quarantined",
  kind: "active" as const,
  quarantineUntil: "2026-09-17T12:00:00Z",
  remainingSeconds: 3600,
  quarantineReason: "upload hold",
  createdAt: "2026-09-16T00:00:00Z",
  isBlocked: true,
};

const REJECTED = {
  ...ACTIVE,
  artifactId: "a2",
  name: "malware",
  kind: "rejected" as const,
  quarantineStatus: "rejected",
  remainingSeconds: null,
  quarantineUntil: null,
  quarantineReason: "known bad",
  isBlocked: true,
};

beforeEach(() => {
  mutation.configs.length = 0;
  mutation.slot = 0;
  vi.clearAllMocks();
  isAdmin = true;
  holdData = { data: { items: [], total: 0 }, isLoading: false };
});
afterEach(() => cleanup());

describe("QuarantineHoldsPage", () => {
  it("gates non-admins", () => {
    isAdmin = false;
    render(<QuarantineHoldsPage />);
    expect(screen.getByText(/requires administrator access/i)).toBeInTheDocument();
  });

  it("lists currently-blocking kinds by default", () => {
    render(<QuarantineHoldsPage />);
    expect(api.listQuarantine).toHaveBeenCalledWith({
      kinds: ["active", "rejected"],
      perPage: 100,
    });
    expect(screen.getByText(/No active or rejected packages/i)).toBeInTheDocument();
  });

  it("shows remaining time, reason, and release/reject for an active hold", () => {
    holdData = { data: { items: [ACTIVE], total: 1 }, isLoading: false };
    render(<QuarantineHoldsPage />);
    expect(screen.getByText("leftpad")).toBeInTheDocument();
    expect(screen.getByText("1h remaining")).toBeInTheDocument();
    expect(screen.getByText(/upload hold/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Release" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("does not offer actions on a rejected row", () => {
    holdData = { data: { items: [REJECTED], total: 1 }, isLoading: false };
    render(<QuarantineHoldsPage />);
    expect(screen.getByText("Permanent block")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Release" })).toBeNull();
  });

  it("confirms release and calls the mutation", async () => {
    const user = userEvent.setup();
    holdData = { data: { items: [ACTIVE], total: 1 }, isLoading: false };
    render(<QuarantineHoldsPage />);
    await user.click(screen.getByRole("button", { name: "Release" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/lifts the hold/i);
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(mutation.releaseMutate).toHaveBeenCalledWith(ACTIVE);
    expect(mutation.rejectMutate).not.toHaveBeenCalled();
  });

  it("shows an error state", () => {
    holdData = { data: undefined, isLoading: false, isError: true, error: new Error("x") };
    render(<QuarantineHoldsPage />);
    expect(screen.getByText(/Couldn't load the quarantine queue/i)).toBeInTheDocument();
  });
});
