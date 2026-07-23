// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
  useQuery: (opts: { queryFn: () => unknown }) => {
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
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => mockToastSuccess(...a), error: vi.fn() } }));

const api = { list: vi.fn(), add: vi.fn(), remove: vi.fn() };
vi.mock("@/lib/api/repo-labels", () => ({
  default: { list: (...a: unknown[]) => api.list(...a), add: (...a: unknown[]) => api.add(...a), remove: (...a: unknown[]) => api.remove(...a) },
}));

import { RepoLabelsPanel } from "./repo-labels-panel";
import type { Repository } from "@/types";

const REPO = { key: "my-repo" } as unknown as Repository;
const LABEL = { id: "l1", key: "team", value: "platform", created_at: "x" };

const addMutate = () => mutateFns[mutateFns.length - 2];
const removeMutate = () => mutateFns[mutateFns.length - 1];

beforeEach(() => {
  mutationConfigs.length = 0;
  mutateFns.length = 0;
  vi.clearAllMocks();
  queryResponse = { data: [], isLoading: false };
});
afterEach(() => cleanup());

describe("RepoLabelsPanel", () => {
  it("shows the empty state and queries by repo key", () => {
    render(<RepoLabelsPanel repository={REPO} />);
    expect(screen.getByText(/No labels yet/i)).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith("my-repo");
  });

  it("renders a skeleton while loading", () => {
    queryResponse = { data: undefined, isLoading: true };
    render(<RepoLabelsPanel repository={REPO} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(/No labels yet/i)).not.toBeInTheDocument();
  });

  it("lists labels as key = value", () => {
    queryResponse = { data: [LABEL], isLoading: false };
    render(<RepoLabelsPanel repository={REPO} />);
    expect(screen.getByText("team")).toBeInTheDocument();
    expect(screen.getByText(/= platform/)).toBeInTheDocument();
  });

  it("disables Add until a key is entered, then submits add", async () => {
    const user = userEvent.setup();
    render(<RepoLabelsPanel repository={REPO} />);
    const add = screen.getByRole("button", { name: /add/i });
    expect(add).toBeDisabled();
    await user.type(screen.getByLabelText("Label key"), "  env  ");
    await user.type(screen.getByLabelText("Label value"), " prod ");
    expect(add).toBeEnabled();
    await user.click(add);
    expect(addMutate()).toHaveBeenCalledWith({ k: "env", v: "prod" });
  });

  it("removes a label by key", async () => {
    const user = userEvent.setup();
    queryResponse = { data: [LABEL], isLoading: false };
    render(<RepoLabelsPanel repository={REPO} />);
    await user.click(screen.getByRole("button", { name: /Remove label team/i }));
    expect(removeMutate()).toHaveBeenCalledWith("team");
  });

  it("mutation callbacks reset/invalidate/toast and call the API", () => {
    render(<RepoLabelsPanel repository={REPO} />);
    const [add, remove] = mutationConfigs;
    add.mutationFn({ k: "team", v: "platform" });
    expect(api.add).toHaveBeenCalledWith("my-repo", "team", "platform");
    add.onSuccess?.(LABEL, { k: "team" });
    remove.mutationFn("team");
    expect(api.remove).toHaveBeenCalledWith("my-repo", "team");
    remove.onSuccess?.();
    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledTimes(2);
  });
});
