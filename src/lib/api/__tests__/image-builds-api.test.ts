import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({ getActiveInstanceBaseUrl: () => "https://ak.example" }));

const mockApiFetch = vi.fn();
vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { imageBuildsApi, emptySpec, managersFor, specGroups, suggestSystemManager } from "@/lib/api/image-builds";

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({ ok: true });
});

describe("imageBuildsApi", () => {
  it("encodes repository, image and reference into the inspect URL", async () => {
    await imageBuildsApi.inspect("my repo", "team/ray", "1.0+build");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/my%20repo/image-inspect?image=team%2Fray&reference=1.0%2Bbuild",
    );
  });

  it("asks the registry about a base image", async () => {
    await imageBuildsApi.baseInfo("ray", "registry:8080/images/base:1.0");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/repositories/ray/image-builds/base-info?image=registry%3A8080%2Fimages%2Fbase%3A1.0",
    );
  });

  it("reads settings and the build list from the repository's image-builds routes", async () => {
    await imageBuildsApi.settings("ray");
    await imageBuildsApi.list("ray");
    await imageBuildsApi.get("ray", "b/1");
    expect(mockApiFetch.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/repositories/ray/image-builds/settings",
      "/api/v1/repositories/ray/image-builds",
      "/api/v1/repositories/ray/image-builds/b%2F1",
    ]);
  });

  it("posts the spec for a dry-run render and name, tag and spec for a build", async () => {
    const spec = { ...emptySpec("python:3.12"), packages: [{ manager: "pip" as const, packages: ["polars==1.9.0"] }] };
    await imageBuildsApi.render("ray", spec);
    await imageBuildsApi.create("ray", { image: "demo", tag: "1", spec });
    expect(mockApiFetch).toHaveBeenNthCalledWith(1, "/api/v1/repositories/ray/image-builds/render", {
      method: "POST",
      body: JSON.stringify({ spec }),
    });
    expect(mockApiFetch).toHaveBeenNthCalledWith(2, "/api/v1/repositories/ray/image-builds", {
      method: "POST",
      body: JSON.stringify({ image: "demo", tag: "1", spec }),
    });
  });

  it("fetches the log as text with credentials and fails on a non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("#1 DONE") });
    vi.stubGlobal("fetch", fetchMock);
    await expect(imageBuildsApi.log("ray", "b1")).resolves.toBe("#1 DONE");
    expect(fetchMock).toHaveBeenCalledWith("https://ak.example/api/v1/repositories/ray/image-builds/b1/log", {
      credentials: "include",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve("") });
    await expect(imageBuildsApi.log("ray", "b1")).rejects.toThrow("log 404");
    vi.unstubAllGlobals();
  });
});

describe("specGroups", () => {
  it("folds legacy apt, conda and pip ahead of explicit groups and skips empty ones", () => {
    expect(specGroups(emptySpec("x"))).toEqual([]);
    expect(
      specGroups({
        ...emptySpec("x"),
        apt: ["git"],
        conda: [],
        pip: ["ray"],
        packages: [{ manager: "apk", packages: ["curl"] }],
      }),
    ).toEqual([
      { manager: "apt", packages: ["git"] },
      { manager: "pip", packages: ["ray"] },
      { manager: "apk", packages: ["curl"] },
    ]);
    expect(specGroups({ ...emptySpec("x"), conda: ["samtools"] })).toEqual([{ manager: "conda", packages: ["samtools"], channels: [] }]);
  });
});

describe("managersFor", () => {
  const all = ["apt", "dnf", "microdnf", "yum", "apk", "pip", "conda"] as const;
  it("keeps the detected system manager plus pip and conda, or everything when unknown", () => {
    expect(managersFor([...all], "microdnf")).toEqual(["microdnf", "pip", "conda"]);
    expect(managersFor([...all], null)).toEqual([...all]);
    expect(managersFor(["pip", "conda"], "apt")).toEqual(["pip", "conda"]);
  });
});

describe("suggestSystemManager", () => {
  it.each([
    ["alpine:3.20", "apk"],
    ["python:3.12-alpine", "apk"],
    ["registry.access.redhat.com/ubi9/ubi-micro:9.4", "microdnf"],
    ["registry.access.redhat.com/ubi9/ubi-minimal:9.4", "microdnf"],
    ["registry.access.redhat.com/ubi9/ubi:9.4", "dnf"],
    ["quay.io/fedora/fedora:40", "dnf"],
    ["rockylinux:9", "dnf"],
    ["centos:7", "yum"],
    ["public.ecr.aws/amazonlinux/amazonlinux:2", "yum"],
    ["debian:bookworm-slim", "apt"],
    ["ubuntu:24.04", "apt"],
    ["python:3.12-slim", "apt"],
    ["docker.io/library/python:3.12", "apt"],
    ["ghcr.io/acme/mystery:1", null],
    ["", null],
  ])("%s → %s", (base, expected) => {
    expect(suggestSystemManager(base)).toBe(expected);
  });
});
