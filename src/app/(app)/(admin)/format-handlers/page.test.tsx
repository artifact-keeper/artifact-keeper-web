// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within, act } from "@testing-library/react";
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
const mutationConfigs: MutationConfig[] = [];
const mutateFns: Array<ReturnType<typeof vi.fn>> = [];
const mockInvalidate = vi.fn();
let queryResponse: { data: unknown; isLoading?: boolean; isError?: boolean; error?: unknown } = { data: [], isLoading: false };

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryFn: () => unknown; enabled?: boolean }) => {
    if (opts.enabled !== false) {
      try {
        opts.queryFn();
      } catch {
        /* ignore */
      }
    }
    return { refetch: vi.fn(), isFetching: false, ...queryResponse };
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
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => mockToastSuccess(...a), error: vi.fn() } }));

const api = { list: vi.fn(), setEnabled: vi.fn(), test: vi.fn() };
vi.mock("@/lib/api/format-handlers", () => ({
  default: {
    list: (...a: unknown[]) => api.list(...a),
    setEnabled: (...a: unknown[]) => api.setEnabled(...a),
    test: (...a: unknown[]) => api.test(...a),
  },
}));

let isAdmin = true;
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ user: isAdmin ? { is_admin: true } : { is_admin: false } }),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange, "aria-label": al }: { checked?: boolean; onCheckedChange?: (v: boolean) => void; "aria-label"?: string }) => (
    <input type="checkbox" role="switch" aria-label={al} checked={!!checked} onChange={(e) => onCheckedChange?.(e.target.checked)} />
  ),
}));

import FormatHandlersPage from "./page";

const PYPI = { id: "h1", format_key: "pypi", display_name: "PyPI", description: null, extensions: [".whl"], handler_type: "Core", is_enabled: true, priority: 10, plugin_id: null };
const UNITY = { id: "h2", format_key: "unity", display_name: "Unity", description: null, extensions: [".unitypackage"], handler_type: "Wasm", is_enabled: false, priority: 5, plugin_id: "p1" };

const toggleMutate = () => mutateFns[mutateFns.length - 2];
const testMutate = () => mutateFns[mutateFns.length - 1];

beforeEach(() => {
  mutationConfigs.length = 0;
  mutateFns.length = 0;
  vi.clearAllMocks();
  isAdmin = true;
  queryResponse = { data: [], isLoading: false };
});
afterEach(() => cleanup());

describe("FormatHandlersPage", () => {
  it("gates non-admins", () => {
    isAdmin = false;
    render(<FormatHandlersPage />);
    expect(screen.getByText(/requires administrator access/i)).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    render(<FormatHandlersPage />);
    expect(screen.getByText(/No format handlers found/i)).toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    queryResponse = { data: undefined, isLoading: true };
    render(<FormatHandlersPage />);
    expect(screen.queryByText(/No format handlers found/i)).not.toBeInTheDocument();
  });

  it("shows an error state with retry", () => {
    queryResponse = { data: undefined, isLoading: false, isError: true, error: new Error("x") };
    render(<FormatHandlersPage />);
    expect(screen.getByText(/Couldn't load format handlers/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("lists handlers with type badge + extensions", () => {
    queryResponse = { data: [PYPI, UNITY], isLoading: false };
    render(<FormatHandlersPage />);
    expect(screen.getByText("PyPI")).toBeInTheDocument();
    expect(screen.getByText("Unity")).toBeInTheDocument();
    expect(screen.getByText("Wasm")).toBeInTheDocument();
    expect(screen.getByText(/\.unitypackage/)).toBeInTheDocument();
  });

  it("filters the list", async () => {
    const user = userEvent.setup();
    queryResponse = { data: [PYPI, UNITY], isLoading: false };
    render(<FormatHandlersPage />);
    await user.type(screen.getByLabelText("Filter handlers"), "unity");
    expect(screen.queryByText("PyPI")).not.toBeInTheDocument();
    expect(screen.getByText("Unity")).toBeInTheDocument();
  });

  it("toggles a handler via the switch", async () => {
    const user = userEvent.setup();
    queryResponse = { data: [UNITY], isLoading: false };
    render(<FormatHandlersPage />);
    await user.click(screen.getByRole("switch", { name: /Enable Unity/i }));
    expect(toggleMutate()).toHaveBeenCalledWith({ key: "unity", enabled: true });
  });

  it("runs a format test and shows the result", async () => {
    const user = userEvent.setup();
    queryResponse = { data: [PYPI], isLoading: false };
    render(<FormatHandlersPage />);
    await user.click(screen.getByRole("button", { name: /Test PyPI/i }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Artifact path"), "a.whl");
    await user.type(within(dialog).getByLabelText("Content"), "data");
    await user.click(within(dialog).getByRole("button", { name: /run test/i }));
    expect(testMutate()).toHaveBeenCalledWith({ key: "pypi", path: "a.whl", content: "data" });
    // simulate the success callback populating the result
    act(() => mutationConfigs[1].onSuccess?.({ valid: false, parse_error: "bad zip header" }));
    expect(await screen.findByText(/bad zip header/i)).toBeInTheDocument();
  });

  it("mutation callbacks invalidate, toast, and call the API", () => {
    render(<FormatHandlersPage />);
    const [toggle, test] = mutationConfigs;
    toggle.mutationFn({ key: "pypi", enabled: false });
    expect(api.setEnabled).toHaveBeenCalledWith("pypi", false);
    toggle.onSuccess?.({ display_name: "PyPI", is_enabled: false });
    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalled();
    test.mutationFn({ key: "pypi", path: "a", content: "b" });
    expect(api.test).toHaveBeenCalledWith("pypi", { path: "a", content: "b" });
  });
});
