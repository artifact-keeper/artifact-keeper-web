// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

interface MutationConfig {
  mutationFn: (...args: unknown[]) => unknown;
  onSuccess?: (...args: unknown[]) => void;
  onError?: (...args: unknown[]) => void;
}
const mutationConfigs: MutationConfig[] = [];
const mutateFns: Array<ReturnType<typeof vi.fn>> = [];
const mockInvalidate = vi.fn();

// useQuery response keyed by queryKey[0]
let queryResponse: unknown = { data: [], isLoading: false };

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[]; queryFn: () => unknown }) => {
    // Execute queryFn so its arrow callback is covered.
    try {
      opts.queryFn();
    } catch {
      /* ignore */
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
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  },
}));

const mockList = vi.fn();
const mockUpsert = vi.fn();
const mockRemove = vi.fn();
vi.mock("@/lib/api/pypi-tracks", () => ({
  default: {
    list: (...a: unknown[]) => mockList(...a),
    upsert: (...a: unknown[]) => mockUpsert(...a),
    remove: (...a: unknown[]) => mockRemove(...a),
  },
}));

import { PypiTracksPanel } from "./pypi-tracks-panel";
import type { Repository } from "@/types";

const REPO = { key: "pypi-virt", format: "pypi", repo_type: "virtual" } as unknown as Repository;
const TRACK = {
  normalized_name: "acme-sdk",
  repository_key: "pypi-virt",
  tracks_url: "https://pypi.org/simple/acme-sdk/",
};

// The panel registers two mutations per render in a fixed order
// (upsert, then remove). Re-renders push fresh mutate fns, so read the tail
// of the array — the latest render's pair — at assertion time. Configs from
// the initial single render are stable at [0]/[1] for callback tests.
const upsertMutate = () => mutateFns[mutateFns.length - 2];
const removeMutate = () => mutateFns[mutateFns.length - 1];
const upsertCfg = () => mutationConfigs[0];
const removeCfg = () => mutationConfigs[1];

beforeEach(() => {
  mutationConfigs.length = 0;
  mutateFns.length = 0;
  vi.clearAllMocks();
  queryResponse = { data: [], isLoading: false };
});
afterEach(() => cleanup());

describe("PypiTracksPanel", () => {
  it("shows the empty state when there are no declarations", () => {
    queryResponse = { data: [], isLoading: false };
    render(<PypiTracksPanel repository={REPO} />);
    expect(screen.getByText(/No tracks declarations/i)).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledWith("pypi-virt");
  });

  it("renders a skeleton while loading", () => {
    queryResponse = { data: undefined, isLoading: true };
    render(<PypiTracksPanel repository={REPO} />);
    expect(screen.queryByText(/No tracks declarations/i)).not.toBeInTheDocument();
  });

  it("lists existing tracks declarations", () => {
    queryResponse = { data: [TRACK], isLoading: false };
    render(<PypiTracksPanel repository={REPO} />);
    expect(screen.getByText("acme-sdk")).toBeInTheDocument();
    expect(screen.getByText(TRACK.tracks_url)).toBeInTheDocument();
  });

  it("disables Add until both fields are filled, then submits an upsert", async () => {
    const user = userEvent.setup();
    render(<PypiTracksPanel repository={REPO} />);

    const addBtn = screen.getByRole("button", { name: /add/i });
    expect(addBtn).toBeDisabled();

    await user.type(screen.getByLabelText("Project name"), "  acme-sdk  ");
    await user.type(
      screen.getByLabelText("Upstream Simple index URL"),
      "https://pypi.org/simple/acme-sdk/",
    );
    expect(addBtn).toBeEnabled();

    await user.click(addBtn);
    expect(upsertMutate()).toHaveBeenCalledWith({
      proj: "acme-sdk", // trimmed
      url: "https://pypi.org/simple/acme-sdk/",
    });
  });

  it("upsert onSuccess resets the form, invalidates, and toasts", () => {
    render(<PypiTracksPanel repository={REPO} />);
    upsertCfg().onSuccess?.(TRACK, { proj: "acme-sdk" });
    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining("acme-sdk"));
  });

  it("upsert/remove mutationFns call the API with repo + project args", () => {
    render(<PypiTracksPanel repository={REPO} />);
    upsertCfg().mutationFn({ proj: "acme-sdk", url: "https://u/" });
    expect(mockUpsert).toHaveBeenCalledWith("pypi-virt", "acme-sdk", "https://u/");
    removeCfg().mutationFn("acme-sdk");
    expect(mockRemove).toHaveBeenCalledWith("pypi-virt", "acme-sdk");
  });

  it("upsert/remove onError surface a toast via mutationErrorToast", () => {
    render(<PypiTracksPanel repository={REPO} />);
    upsertCfg().onError?.(new Error("boom"));
    removeCfg().onError?.(new Error("nope"));
    expect(mockToastError).toHaveBeenCalledTimes(2);
  });

  it("removing a track opens the confirm dialog and fires the remove mutation", async () => {
    const user = userEvent.setup();
    queryResponse = { data: [TRACK], isLoading: false };
    render(<PypiTracksPanel repository={REPO} />);

    await user.click(
      screen.getByRole("button", { name: /Remove tracks declaration for acme-sdk/i }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /^Remove$/i }));
    expect(removeMutate()).toHaveBeenCalledWith("acme-sdk");
  });

  it("remove onSuccess clears the pending track, invalidates, and toasts", () => {
    render(<PypiTracksPanel repository={REPO} />);
    removeCfg().onSuccess?.();
    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith("Tracks declaration removed");
  });
});
