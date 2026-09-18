// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

interface QueryOpts {
  queryKey: unknown[];
  queryFn: () => unknown;
  initialData?: unknown;
  refetchInterval?: number | false | ((q: { state: { data: unknown } }) => number | false);
  enabled?: boolean;
}
type QueryResult = { data?: unknown; isLoading?: boolean; isError?: boolean; isFetching?: boolean };
const responses: Record<string, QueryResult> = {};
const seen: QueryOpts[] = [];

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: QueryOpts) => {
    seen.push(opts);
    if (opts.enabled !== false) {
      try {
        opts.queryFn();
      } catch {
        /* ignore */
      }
    }
    const key = String(opts.queryKey[0]);
    const r = responses[key] ?? { data: opts.initialData, isLoading: false, isError: false };
    return { isLoading: false, isError: false, isFetching: false, ...r };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../image-inspect-panel", () => ({
  ImageInspectPanel: ({ image, reference }: { image: string; reference: string }) => <div data-testid="inspect">{image}:{reference}</div>,
}));

const api = { settings: vi.fn(), list: vi.fn(), get: vi.fn(), log: vi.fn(), render: vi.fn(), create: vi.fn() };
vi.mock("@/lib/api/image-builds", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api/image-builds")>();
  const names = ["settings", "list", "get", "log", "render", "create"] as const;
  return { ...real, imageBuildsApi: Object.fromEntries(names.map((k) => [k, (...a: unknown[]) => api[k](...a)])) };
});

import { ImageBuildTab, statusVariant } from "../image-build-tab";
import { emptySpec } from "@/lib/api/image-builds";
import type { ImageBuild, ImageBuildSettings } from "@/types/image-builds";

const SETTINGS: ImageBuildSettings = {
  enabled: true,
  repository_buildable: true,
  push_registry: "registry:8080",
  base_allowlist: ["python:"],
  allow_run: false,
  allow_dockerfile: false,
  supported_package_managers: ["apt", "pip", "conda"],
  admin_only: true,
  caller_may_build: true,
  timeout_secs: 1800,
  max_concurrent: 2,
  pip_index_url: null,
};

const BUILD: ImageBuild = {
  id: "b1",
  repository_key: "ray",
  image: "team/ray",
  tag: "1.0",
  reference: "ray/team/ray:1.0",
  status: "succeeded",
  spec: { ...emptySpec("python:3.12-slim"), packages: [{ manager: "pip", packages: ["polars-lts-cpu==1.9.0"] }] },
  containerfile: "FROM python:3.12-slim\nRUN pip install polars-lts-cpu==1.9.0",
  digest: `sha256:${"cd".repeat(32)}`,
  error: null,
  requested_by: "local-admin",
  log_bytes: 2048,
  created_at: "2026-09-18T10:00:00Z",
  started_at: "2026-09-18T10:00:05Z",
  finished_at: "2026-09-18T10:00:26Z",
};

beforeEach(() => {
  for (const k of Object.keys(responses)) delete responses[k];
  seen.length = 0;
  vi.clearAllMocks();
  responses["image-build-settings"] = { data: SETTINGS };
  responses["image-builds"] = { data: { items: [] } };
});
afterEach(cleanup);

describe("statusVariant", () => {
  it("maps build status to badge variants", () => {
    expect(statusVariant("succeeded")).toBe("default");
    expect(statusVariant("failed")).toBe("destructive");
    expect(statusVariant("running")).toBe("secondary");
    expect(statusVariant("queued")).toBe("outline");
  });
});

describe("ImageBuildTab", () => {
  it("describes the builder's policy and offers New image when the caller may build", async () => {
    const user = userEvent.setup();
    render(<ImageBuildTab repoKey="ray" canBuild={false} />);
    expect(api.settings).toHaveBeenCalledWith("ray");
    expect(api.list).toHaveBeenCalledWith("ray");
    expect(screen.getByText(/Base images under python:/)).toBeInTheDocument();
    expect(screen.getByText(/administrators only/)).toBeInTheDocument();
    expect(screen.getByText(/No builds yet\. Start with New image\./)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "New image" });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(screen.getByRole("heading", { name: /New image/ })).toBeInTheDocument();
    // The wizard posts a dry run for the first allowed base as soon as it opens.
    expect(api.render).toHaveBeenCalledWith("ray", expect.objectContaining({ base_image: "python:" }));
  });

  it.each([
    [{ isError: true }, /does not expose the image builder/],
    [{ data: undefined }, /Checking builder/],
    [{ data: { ...SETTINGS, enabled: false } }, /not configured on this instance/],
    [{ data: { ...SETTINGS, repository_buildable: false } }, /remote or virtual/],
    [{ data: { ...SETTINGS, caller_may_build: false } }, /restricted to administrators/],
    [{ data: { ...SETTINGS, caller_may_build: false, admin_only: false } }, /need write access/],
  ])("explains why building is unavailable (%j)", (settings, message) => {
    responses["image-build-settings"] = settings as QueryResult;
    render(<ImageBuildTab repoKey="ray" canBuild />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New image" })).toBeDisabled();
  });

  it("falls back to the client's permission when the server does not report one", () => {
    responses["image-build-settings"] = { data: { ...SETTINGS, caller_may_build: undefined, admin_only: false } };
    render(<ImageBuildTab repoKey="ray" canBuild={false} />);
    expect(screen.getByText(/need write access/)).toBeInTheDocument();
  });

  it("lists builds, polls while one is active, and opens a build's detail", async () => {
    const user = userEvent.setup();
    const running: ImageBuild = { ...BUILD, id: "b2", tag: "1.1", reference: "ray/team/ray:1.1", status: "running", digest: null, finished_at: null };
    responses["image-builds"] = { data: { items: [BUILD, running] } };
    responses["image-build-log"] = { data: "#1 [internal] load build definition\n#2 DONE" };
    render(<ImageBuildTab repoKey="ray" canBuild />);

    const listQuery = seen.find((q) => q.queryKey[0] === "image-builds")!;
    const interval = listQuery.refetchInterval as (q: { state: { data: unknown } }) => number | false;
    expect(interval({ state: { data: { items: [BUILD, running] } } })).toBe(3000);
    expect(interval({ state: { data: { items: [BUILD] } } })).toBe(false);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("team/ray:1.0")).toBeInTheDocument();
    expect(within(rows[0]).getByText("succeeded")).toBeInTheDocument();
    expect(within(rows[0]).getByText("python:3.12-slim")).toBeInTheDocument();
    expect(within(rows[0]).getByText("21s")).toBeInTheDocument();
    expect(within(rows[1]).getByText("—")).toBeInTheDocument();

    await user.click(rows[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Build b1")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("ray", "b1");
    expect(api.log).toHaveBeenCalledWith("ray", "b1");
    // A finished build opens on its Image tab; the log and Containerfile tabs are there too.
    expect(within(dialog).getByTestId("inspect")).toHaveTextContent("team/ray:1.0");
    await user.click(within(dialog).getByRole("tab", { name: /Log/ }));
    expect(within(dialog).getByTestId("build-log")).toHaveTextContent("#2 DONE");
    await user.click(within(dialog).getByRole("tab", { name: "Containerfile" }));
    expect(within(dialog).getByText(/RUN pip install polars-lts-cpu/)).toBeInTheDocument();

    // Rebuild with changes reopens the wizard pre-filled from this build's spec.
    await user.click(within(dialog).getByRole("button", { name: /Rebuild with changes/ }));
    expect(screen.getByRole("heading", { name: /New image/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Base image")).toHaveValue("python:3.12-slim");
    expect(screen.getByRole("textbox", { name: "Packages 1" })).toHaveValue("polars-lts-cpu==1.9.0");
  });

  it("shows a failed build's error and only the log and Containerfile tabs", async () => {
    const user = userEvent.setup();
    const failed: ImageBuild = { ...BUILD, status: "failed", digest: null, error: "buildctl exited with status 1" };
    responses["image-builds"] = { data: { items: [failed] } };
    responses["image-build-log"] = { isLoading: true };
    render(<ImageBuildTab repoKey="ray" canBuild />);
    await user.click(screen.getAllByRole("row")[1]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("buildctl exited with status 1")).toBeInTheDocument();
    expect(within(dialog).queryByRole("tab", { name: "Image" })).not.toBeInTheDocument();
    expect(within(dialog).getByTestId("build-log")).toHaveTextContent("Loading log…");
  });

  it("reports loading and unavailable build lists", () => {
    responses["image-builds"] = { isLoading: true };
    render(<ImageBuildTab repoKey="ray" canBuild />);
    expect(screen.getByText("Loading builds…")).toBeInTheDocument();
    cleanup();
    responses["image-builds"] = { isError: true };
    render(<ImageBuildTab repoKey="ray" canBuild />);
    expect(screen.getByText(/Builds are not available on this backend/)).toBeInTheDocument();
  });
});
