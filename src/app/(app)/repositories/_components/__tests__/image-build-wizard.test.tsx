// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

interface QueryOpts {
  queryKey: unknown[];
  queryFn: () => unknown;
  enabled?: boolean;
}
interface MutationConfig {
  mutationFn: () => unknown;
  onSuccess?: (v: unknown) => void;
  onError?: (e: unknown) => void;
}
const queries: QueryOpts[] = [];
const mutations: MutationConfig[] = [];
const mutate = vi.fn();
const invalidate = vi.fn();
let renderResponse: Record<string, unknown> = { data: undefined, isError: false, isLoading: false, isFetching: false };
let baseInfoResponse: Record<string, unknown> = { data: undefined, isError: false, isLoading: false, isFetching: false };

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: QueryOpts) => {
    queries.push(opts);
    if (opts.enabled) opts.queryFn();
    return opts.queryKey[0] === "image-build-base-info" ? baseInfoResponse : renderResponse;
  },
  useMutation: (config: MutationConfig) => {
    mutations.push(config);
    return { mutate, isPending: false };
  },
  useQueryClient: () => ({ invalidateQueries: invalidate }),
}));
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toast.success(...a), error: (...a: unknown[]) => toast.error(...a) } }));

const api = { render: vi.fn(), create: vi.fn(), baseInfo: vi.fn() };
vi.mock("@/lib/api/image-builds", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api/image-builds")>();
  return {
    ...real,
    imageBuildsApi: {
      ...real.imageBuildsApi,
      render: (...a: unknown[]) => api.render(...a),
      create: (...a: unknown[]) => api.create(...a),
      baseInfo: (...a: unknown[]) => api.baseInfo(...a),
    },
  };
});

import { ImageBuildWizard, initialForm, formToSpec, errorMessage, MANAGER_LABELS } from "../image-build-wizard";
import { emptySpec } from "@/lib/api/image-builds";
import { ApiError } from "@/lib/api/fetch";
import type { ImageBuildSettings, ImageBuildSpec } from "@/types/image-builds";

const SETTINGS: ImageBuildSettings = {
  enabled: true,
  repository_buildable: true,
  push_registry: "registry:8080",
  base_allowlist: ["python:", "debian:"],
  allow_run: false,
  allow_dockerfile: false,
  supported_package_managers: ["apt", "dnf", "microdnf", "yum", "apk", "pip", "conda"],
  admin_only: true,
  caller_may_build: true,
  timeout_secs: 1800,
  max_concurrent: 2,
  pip_index_url: null,
};

const lastRenderQuery = () => [...queries].reverse().find((q) => q.queryKey[0] === "image-build-render")!;
const lastSpec = () => lastRenderQuery().queryKey[2] as ImageBuildSpec;

beforeEach(() => {
  queries.length = 0;
  mutations.length = 0;
  vi.clearAllMocks();
  renderResponse = { data: undefined, isError: false, isLoading: false, isFetching: false };
  baseInfoResponse = { data: undefined, isError: false, isLoading: false, isFetching: false };
});
afterEach(cleanup);

describe("initialForm", () => {
  it("starts from the first allowed base with one pip group and two-stage on", () => {
    const f = initialForm(null, SETTINGS);
    expect(f.baseImage).toBe("python:");
    expect(f.mode).toBe("spec");
    expect(f.groups).toEqual([{ manager: "pip", packages: "", channels: "" }]);
    expect(f.multistage).toBe(true);
  });

  it("re-opens a recorded spec, folding legacy fields into groups in their old order", () => {
    const spec: ImageBuildSpec = {
      ...emptySpec("python:3.12-slim"),
      apt: ["libgomp1"],
      conda: ["samtools=1.20"],
      conda_channels: ["bioconda", "conda-forge"],
      pip: ["polars==1.9.0"],
      packages: [{ manager: "apk", packages: ["git"] }],
      multistage: true,
      env: { A: "1" },
      labels: { team: "x" },
      user: "ray",
      workdir: "/work",
      run: ["echo hi"],
    };
    const f = initialForm(spec, SETTINGS);
    expect(f.groups.map((g) => g.manager)).toEqual(["apt", "conda", "pip", "apk"]);
    expect(f.groups[1]).toEqual({ manager: "conda", packages: "samtools=1.20", channels: "bioconda, conda-forge" });
    expect(f).toMatchObject({ env: "A=1", labels: "team=x", user: "ray", workdir: "/work", run: "echo hi", multistage: true });
  });

  it("opens in Dockerfile mode when the spec carries one", () => {
    const f = initialForm({ ...emptySpec(""), dockerfile: "FROM python:3.12\n" }, SETTINGS);
    expect(f.mode).toBe("dockerfile");
    expect(f.dockerfile).toBe("FROM python:3.12\n");
    expect(f.groups).toHaveLength(1);
  });
});

describe("formToSpec", () => {
  it("drops empty groups, splits conda channels and nulls blank user/workdir", () => {
    const f = initialForm(null, SETTINGS);
    const spec = formToSpec({
      ...f,
      baseImage: " python:3.12-slim ",
      groups: [
        { manager: "pip", packages: "polars==1.9.0\n\n scanpy==1.10.2 ", channels: "" },
        { manager: "conda", packages: "samtools", channels: "bioconda, conda-forge" },
        { manager: "apt", packages: "   ", channels: "" },
      ],
      user: "  ",
    });
    expect(spec.base_image).toBe("python:3.12-slim");
    expect(spec.packages).toEqual([
      { manager: "pip", packages: ["polars==1.9.0", "scanpy==1.10.2"] },
      { manager: "conda", packages: ["samtools"], channels: ["bioconda", "conda-forge"] },
    ]);
    expect(spec.user).toBeNull();
    expect(spec.workdir).toBeNull();
    expect(spec.multistage).toBe(true);
  });

  it("in Dockerfile mode sends only the Dockerfile", () => {
    const spec = formToSpec({ ...initialForm(null, SETTINGS), mode: "dockerfile", dockerfile: "FROM python:3.12\n", baseImage: "python:3.12" });
    expect(spec.dockerfile).toBe("FROM python:3.12\n");
    expect(spec.base_image).toBe("");
    expect(spec.packages).toEqual([]);
  });
});

describe("errorMessage", () => {
  it("prefers the backend's JSON message, then the raw body, then the status", () => {
    expect(errorMessage(new ApiError(400, JSON.stringify({ message: "pip requirement bad" })))).toBe("pip requirement bad");
    expect(errorMessage(new ApiError(502, "upstream down"))).toBe("upstream down");
    expect(errorMessage(new ApiError(500, ""))).toBe("HTTP 500");
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
  });
});

describe("ImageBuildWizard", () => {
  const renderWizard = (settings: ImageBuildSettings = SETTINGS, initialSpec: ImageBuildSpec | null = null) => {
    const onOpenChange = vi.fn();
    render(<ImageBuildWizard repoKey="ray" settings={settings} open onOpenChange={onOpenChange} initialSpec={initialSpec} />);
    return { onOpenChange };
  };

  it("renders the spec through the dry-run endpoint and shows the Containerfile", async () => {
    renderResponse = { data: { containerfile: "FROM python:3.12-slim\nRUN pip install x", warnings: ["pip requirement \"x\" is not pinned to an exact version"] }, isError: false, isLoading: false, isFetching: false };
    renderWizard();
    expect(screen.getByRole("heading", { name: /New image/ })).toBeInTheDocument();
    expect(api.render).toHaveBeenCalledWith("ray", expect.objectContaining({ base_image: "python:" }));
    expect(screen.getByTestId("containerfile-preview")).toHaveTextContent("FROM python:3.12-slim");
    expect(screen.getByText(/not pinned to an exact version/)).toBeInTheDocument();
    // Structured spec only: no Dockerfile mode switch unless the instance allows it.
    expect(screen.queryByRole("radiogroup", { name: "Build from" })).not.toBeInTheDocument();
  });

  it("offers every supported manager, suggests the system manager from the base image, and marks root installs", async () => {
    const user = userEvent.setup();
    renderWizard();
    const select = screen.getByRole("combobox", { name: "Package manager 1" });
    // The first allowed prefix, "python:", reads as apt from its name: apt + pip + conda.
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(
      ["apt", "pip", "conda"].map((m) => MANAGER_LABELS[m as keyof typeof MANAGER_LABELS]),
    );
    expect(screen.getByTestId("base-detected")).toHaveTextContent("from the image name");
    const base = screen.getByLabelText("Base image");
    // A prefix that says nothing offers every manager and shows no badge.
    await user.clear(base);
    await user.type(base, "ghcr.io/acme/");
    expect(within(select).getAllByRole("option")).toHaveLength(SETTINGS.supported_package_managers!.length);
    expect(screen.queryByTestId("base-detected")).not.toBeInTheDocument();
    await user.clear(base);
    await user.type(base, "registry.access.redhat.com/ubi9/ubi-minimal:9.4");
    // Read from the name: microdnf, so the list narrows to microdnf + pip + conda…
    expect(screen.getByTestId("base-detected")).toHaveTextContent("microdnf");
    expect(screen.getByTestId("base-detected")).toHaveTextContent("from the image name");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(
      ["microdnf", "pip", "conda"].map((m) => MANAGER_LABELS[m as keyof typeof MANAGER_LABELS]),
    );
    // …until "show all managers" is clicked.
    await user.click(screen.getByRole("button", { name: "show all managers" }));
    expect(within(select).getAllByRole("option")).toHaveLength(SETTINGS.supported_package_managers!.length);
    await user.click(screen.getByRole("button", { name: "only matching managers" }));
    await user.click(screen.getByRole("button", { name: /Add package group/ }));
    expect(screen.getByRole("combobox", { name: "Package manager 2" })).toHaveValue("microdnf");
    expect(screen.getByText(/Installs as root in the final stage/)).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Packages 2" }), "git");
    await waitFor(() => expect(lastSpec().packages).toEqual([{ manager: "microdnf", packages: ["git"] }]));
    // A system group without a user gets the hint the server would otherwise error with.
    expect(screen.getByText(/System packages need the user/)).toBeInTheDocument();
    // A second Add falls back to pip once a system group exists.
    await user.click(screen.getByRole("button", { name: /Add package group/ }));
    expect(screen.getByRole("combobox", { name: "Package manager 3" })).toHaveValue("pip");
    await user.click(screen.getByRole("button", { name: "Remove group 3" }));
    expect(screen.queryByRole("combobox", { name: "Package manager 3" })).not.toBeInTheDocument();
  });

  it("uses the registry's probe of the base image over the name, and offers its user", async () => {
    baseInfoResponse = {
      data: { found: true, reference: "images/base:1.0", digest: "sha256:abc", os: "linux", architecture: "amd64", user: "app", system_manager: "apt", has_pip: true, has_conda: true },
      isError: false, isLoading: false, isFetching: false,
    };
    const user = userEvent.setup();
    renderWizard({ ...SETTINGS, base_allowlist: ["registry:8080/images/"] });
    const base = screen.getByLabelText("Base image");
    await user.clear(base);
    await user.type(base, "registry:8080/images/base:1.0");
    await waitFor(() => expect(api.baseInfo).toHaveBeenCalledWith("ray", "registry:8080/images/base:1.0"));
    const detected = screen.getByTestId("base-detected");
    expect(detected).toHaveTextContent("apt");
    expect(detected).toHaveTextContent("from the image's own build history");
    expect(detected).toHaveTextContent("linux/amd64");
    expect(detected).toHaveTextContent("runs as app");
    expect(detected).toHaveTextContent("conda present");
    expect(screen.getByLabelText("User")).toHaveAttribute("placeholder", "app");
    const select = screen.getByRole("combobox", { name: "Package manager 1" });
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(
      ["apt", "pip", "conda"].map((m) => MANAGER_LABELS[m as keyof typeof MANAGER_LABELS]),
    );
    // A group already set to a manager outside the filter stays selectable.
    await user.click(screen.getByRole("button", { name: "show all managers" }));
    await user.selectOptions(select, "apk");
    await user.click(screen.getByRole("button", { name: "only matching managers" }));
    expect(select).toHaveValue("apk");
    expect(within(select).getAllByRole("option")).toHaveLength(4);
  });

  it("shows conda channels only for conda groups and carries the two-stage toggle into the spec", async () => {
    const user = userEvent.setup();
    renderWizard();
    expect(screen.queryByRole("textbox", { name: "Conda channels 1" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Package manager 1" }), "conda");
    await user.type(screen.getByRole("textbox", { name: "Conda channels 1" }), "bioconda conda-forge");
    await user.type(screen.getByRole("textbox", { name: "Packages 1" }), "samtools=1.20");
    await user.click(screen.getByRole("checkbox", { name: "Two-stage build" }));
    await waitFor(() => {
      const s = lastSpec();
      expect(s.packages).toEqual([{ manager: "conda", packages: ["samtools=1.20"], channels: ["bioconda", "conda-forge"] }]);
      expect(s.multistage).toBe(false);
    });
  });

  it("switches to Dockerfile mode when allowed and sends the Dockerfile alone", async () => {
    const user = userEvent.setup();
    renderWizard({ ...SETTINGS, allow_dockerfile: true });
    await user.click(screen.getByRole("radio", { name: "Dockerfile" }));
    expect(screen.queryByLabelText("Base image")).not.toBeInTheDocument();
    expect(screen.getByTestId("containerfile-preview")).toHaveTextContent("Paste a Dockerfile");
    await user.type(screen.getByLabelText("Dockerfile"), "FROM python:3.12");
    await waitFor(() => expect(lastSpec()).toMatchObject({ dockerfile: "FROM python:3.12", base_image: "" }));
    expect(screen.getByText(/Every FROM must be under an allowed base \(python:, debian:\)/)).toBeInTheDocument();
  });

  it("surfaces the server's validation error and keeps Build disabled until name, tag and a clean render exist", async () => {
    const user = userEvent.setup();
    renderResponse = { data: undefined, isError: true, error: new ApiError(400, JSON.stringify({ message: "pip requirement \"a && b\" is not a valid pip requirement spec" })), isLoading: false, isFetching: false };
    renderWizard();
    expect(screen.getByTestId("render-error")).toHaveTextContent("pip requirement \"a && b\"");
    const build = screen.getByRole("button", { name: /Build image/ });
    expect(build).toBeDisabled();

    renderResponse = { data: { containerfile: "FROM x", warnings: [] }, isError: false, isLoading: false, isFetching: true };
    await user.type(screen.getByLabelText("Image name"), "team/ray");
    await user.type(screen.getByLabelText("Tag"), "1.0");
    expect(screen.getByText("rendering…")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Build image/ })).toBeEnabled());
    expect(screen.getByText(/registry:8080\/ray\/team\/ray:1.0/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Build image/ }));
    expect(mutate).toHaveBeenCalled();

    // The mutation posts name, tag and the current spec; success toasts, refreshes and closes.
    api.create.mockResolvedValue({ reference: "ray/team/ray:1.0" });
    const m = mutations[mutations.length - 1];
    await m.mutationFn();
    expect(api.create).toHaveBeenCalledWith("ray", expect.objectContaining({ image: "team/ray", tag: "1.0", spec: expect.objectContaining({ base_image: "python:" }) }));
    m.onSuccess?.({ reference: "ray/team/ray:1.0" });
    expect(toast.success).toHaveBeenCalledWith("Build queued: ray/team/ray:1.0");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["image-builds", "ray"] });
    m.onError?.(new ApiError(409, JSON.stringify({ message: "already building" })));
    expect(toast.error).toHaveBeenCalledWith("already building");
  });

  it("shows raw RUN lines and the pip index only when the instance enables them", () => {
    renderWizard({ ...SETTINGS, allow_run: true, pip_index_url: "https://pypi.internal/simple", base_allowlist: [] });
    expect(screen.getByLabelText(/Raw RUN lines/)).toBeInTheDocument();
    expect(screen.getByText(/pip installs use https:\/\/pypi.internal\/simple/)).toBeInTheDocument();
    expect(screen.getByText(/Any base image; pin a tag/)).toBeInTheDocument();
    expect(screen.getByTestId("containerfile-preview")).toHaveTextContent("Choose a base image");
  });

  it("cancels through onOpenChange", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderWizard();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
