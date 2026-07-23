import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAssertData = vi.fn(<T,>(d: T) => d);
vi.mock("../fetch", () => ({
  assertData: <T,>(d: T) => mockAssertData(d),
}));

vi.mock("@/lib/sdk-client", () => ({}));

const mockListPypiTracks = vi.fn();
const mockPutPypiTrack = vi.fn();
const mockDeletePypiTrack = vi.fn();
vi.mock("@artifact-keeper/sdk", () => ({
  listPypiTracks: (...args: unknown[]) => mockListPypiTracks(...args),
  putPypiTrack: (...args: unknown[]) => mockPutPypiTrack(...args),
  deletePypiTrack: (...args: unknown[]) => mockDeletePypiTrack(...args),
}));

import pypiTracksApi from "../pypi-tracks";

describe("pypiTracksApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("list() maps the SDK list response to PypiTrack[]", async () => {
    mockListPypiTracks.mockResolvedValue({
      data: {
        items: [
          { normalized_name: "acme-sdk", repository_key: "pypi-virt", tracks_url: "https://pypi.org/simple/acme-sdk/" },
        ],
      },
      error: undefined,
    });

    const result = await pypiTracksApi.list("pypi-virt");

    expect(mockListPypiTracks).toHaveBeenCalledWith({ path: { key: "pypi-virt" } });
    expect(result).toEqual([
      { normalized_name: "acme-sdk", repository_key: "pypi-virt", tracks_url: "https://pypi.org/simple/acme-sdk/" },
    ]);
  });

  it("list() throws on SDK error", async () => {
    mockListPypiTracks.mockResolvedValue({ data: undefined, error: { status: 500 } });
    await expect(pypiTracksApi.list("pypi-virt")).rejects.toEqual({ status: 500 });
  });

  it("upsert() sends the project path and tracks_url body", async () => {
    mockPutPypiTrack.mockResolvedValue({
      data: { normalized_name: "acme-sdk", repository_key: "pypi-virt", tracks_url: "https://pypi.org/simple/acme-sdk/" },
      error: undefined,
    });

    const result = await pypiTracksApi.upsert("pypi-virt", "acme-sdk", "https://pypi.org/simple/acme-sdk/");

    expect(mockPutPypiTrack).toHaveBeenCalledWith({
      path: { key: "pypi-virt", project: "acme-sdk" },
      body: { tracks_url: "https://pypi.org/simple/acme-sdk/" },
    });
    expect(result.normalized_name).toBe("acme-sdk");
  });

  it("upsert() throws on SDK error", async () => {
    mockPutPypiTrack.mockResolvedValue({ data: undefined, error: { status: 400 } });
    await expect(
      pypiTracksApi.upsert("pypi-virt", "acme-sdk", "bad-url"),
    ).rejects.toEqual({ status: 400 });
  });

  it("remove() deletes by project and resolves void on success", async () => {
    mockDeletePypiTrack.mockResolvedValue({ data: undefined, error: undefined });

    await expect(pypiTracksApi.remove("pypi-virt", "acme-sdk")).resolves.toBeUndefined();
    expect(mockDeletePypiTrack).toHaveBeenCalledWith({ path: { key: "pypi-virt", project: "acme-sdk" } });
  });

  it("remove() throws on SDK error", async () => {
    mockDeletePypiTrack.mockResolvedValue({ error: { status: 404 } });
    await expect(pypiTracksApi.remove("pypi-virt", "missing")).rejects.toEqual({ status: 404 });
  });
});
