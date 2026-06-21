// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// jsdom is missing APIs that Radix Dialog/AlertDialog rely on.
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
const mutationConfigs: MutationConfig[] = [];
const mutateFns: Array<ReturnType<typeof vi.fn>> = [];
const mockInvalidate = vi.fn();
let queryResponse: unknown = { data: [], isLoading: false };

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryFn: () => unknown; enabled?: boolean }) => {
    if (opts.enabled !== false) {
      try {
        opts.queryFn();
      } catch {
        /* ignore */
      }
    }
    return queryResponse;
  },
  useMutation: (config: MutationConfig) => {
    mutationConfigs.push(config);
    const mutate = vi.fn();
    mutateFns.push(mutate);
    return { mutate, isPending: false };
  },
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

const mockToastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => mockToastSuccess(...a), error: vi.fn() },
}));

const api = { listKeys: vi.fn(), createKey: vi.fn(), rotateKey: vi.fn(), revokeKey: vi.fn(), deleteKey: vi.fn() };
vi.mock("@/lib/api/signing", () => ({
  default: {
    listKeys: (...a: unknown[]) => api.listKeys(...a),
    createKey: (...a: unknown[]) => api.createKey(...a),
    rotateKey: (...a: unknown[]) => api.rotateKey(...a),
    revokeKey: (...a: unknown[]) => api.revokeKey(...a),
    deleteKey: (...a: unknown[]) => api.deleteKey(...a),
  },
}));

let isAdmin = true;
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ user: isAdmin ? { is_admin: true } : { is_admin: false } }),
}));

import SigningPage from "./page";

const KEY = {
  id: "k1",
  name: "release",
  key_type: "gpg",
  algorithm: "ed25519",
  fingerprint: "AB12CD",
  key_id: null,
  public_key_pem: "-----BEGIN PGP PUBLIC KEY-----\nabc\n-----END-----",
  is_active: true,
  uid_name: null,
  uid_email: null,
  expires_at: null,
  last_used_at: null,
  repository_id: null,
  created_at: "2026-06-01T00:00:00Z",
};

// 4 mutations per render in order: create, rotate, revoke, delete.
const createMutate = () => mutateFns[mutateFns.length - 4];
const rotateMutate = () => mutateFns[mutateFns.length - 3];
const revokeMutate = () => mutateFns[mutateFns.length - 2];
const deleteMutate = () => mutateFns[mutateFns.length - 1];

beforeEach(() => {
  mutationConfigs.length = 0;
  mutateFns.length = 0;
  vi.clearAllMocks();
  isAdmin = true;
  queryResponse = { data: [], isLoading: false };
});
afterEach(() => cleanup());

describe("SigningPage", () => {
  it("gates non-admins", () => {
    isAdmin = false;
    render(<SigningPage />);
    expect(screen.getByText(/requires administrator access/i)).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    render(<SigningPage />);
    expect(screen.getByText(/No signing keys yet/i)).toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    queryResponse = { data: undefined, isLoading: true };
    render(<SigningPage />);
    expect(screen.queryByText(/No signing keys yet/i)).not.toBeInTheDocument();
  });

  it("shows an error state with retry", () => {
    queryResponse = { data: undefined, isLoading: false, isError: true, error: new Error("down"), refetch: vi.fn() };
    render(<SigningPage />);
    expect(screen.getByText(/Couldn't load signing keys/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("lists keys with type and status badges", () => {
    queryResponse = { data: [KEY], isLoading: false };
    render(<SigningPage />);
    expect(screen.getByText("release")).toBeInTheDocument();
    expect(screen.getByText("gpg")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("AB12CD")).toBeInTheDocument();
  });

  it("creates a key from the dialog", async () => {
    const user = userEvent.setup();
    render(<SigningPage />);
    await user.click(screen.getByRole("button", { name: /new key/i }));
    await user.type(screen.getByLabelText("Name"), "  release-2026  ");
    await user.click(screen.getByRole("button", { name: /^Create$/i }));
    expect(createMutate()).toHaveBeenCalledWith(
      expect.objectContaining({ name: "release-2026", key_type: "gpg" }),
    );
  });

  it("opens the public-key dialog", async () => {
    const user = userEvent.setup();
    queryResponse = { data: [KEY], isLoading: false };
    render(<SigningPage />);
    await user.click(screen.getByRole("button", { name: /View public key for release/i }));
    expect(await screen.findByText(/Public key — release/i)).toBeInTheDocument();
    expect(screen.getByText(/BEGIN PGP PUBLIC KEY/i)).toBeInTheDocument();
  });

  // One confirm flow per test — the mocked `mutate` never fires onSuccess, so
  // the dialog stays open; a second flow in the same render would be blocked by
  // the modal overlay.
  it.each([
    ["Rotate", () => rotateMutate()],
    ["Revoke", () => revokeMutate()],
    ["Delete", () => deleteMutate()],
  ])("%s confirm fires the mutation", async (action, getMutate) => {
    const user = userEvent.setup();
    queryResponse = { data: [KEY], isLoading: false };
    render(<SigningPage />);
    await user.click(screen.getByRole("button", { name: new RegExp(`${action} release`, "i") }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: new RegExp(`^${action}$`, "i") }));
    expect(getMutate()).toHaveBeenCalledWith("k1");
  });

  it("mutation callbacks invalidate + toast + call the API", () => {
    render(<SigningPage />);
    const [create, rotate, revoke, del] = mutationConfigs;
    create.mutationFn({ name: "x" });
    expect(api.createKey).toHaveBeenCalledWith({ name: "x" });
    create.onSuccess?.(KEY);
    rotate.onSuccess?.();
    revoke.onSuccess?.();
    del.onSuccess?.();
    expect(mockInvalidate).toHaveBeenCalledTimes(4);
    expect(mockToastSuccess).toHaveBeenCalledTimes(4);
    rotate.mutationFn("k1");
    revoke.mutationFn("k1");
    del.mutationFn("k1");
    expect(api.rotateKey).toHaveBeenCalledWith("k1");
    expect(api.revokeKey).toHaveBeenCalledWith("k1");
    expect(api.deleteKey).toHaveBeenCalledWith("k1");
  });
});
