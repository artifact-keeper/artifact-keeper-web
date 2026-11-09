import { describe, it, expect, vi, afterEach } from "vitest";
import {
  adaptAllowlist,
  condaAllowlistApi,
  filtersHostedMembers,
  supportsCondaAllowlist,
} from "../conda-allowlist";
import { ApiError } from "../fetch";

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const SAVED = {
  repository_key: "conda-virtual",
  enabled: true,
  entries: [
    { name: "numpy", version: ">=2,<3", subdirs: ["linux-64"] },
    { name: "tzdata" },
  ],
  entry_count: 2,
};

afterEach(() => vi.unstubAllGlobals());

describe("adaptAllowlist", () => {
  it("keeps well-formed entries and drops the rest", () => {
    const a = adaptAllowlist(
      { enabled: true, entries: [{ name: "a", subdirs: ["noarch", 3] }, { version: "1" }, "x"] },
      "k",
    );
    expect(a).toEqual({
      repository_key: "k",
      enabled: true,
      scope: null,
      entries: [{ name: "a", subdirs: ["noarch"] }],
      entry_count: 1,
      error: undefined,
    });
  });

  it("reports the unusable-list error state", () => {
    const a = adaptAllowlist(
      { repository_key: "k", enabled: true, entries: [], entry_count: 0, error: "expected value at line 1" },
      "k",
    );
    expect(a.enabled).toBe(true);
    expect(a.error).toBe("expected value at line 1");
  });

  it("reads the scope a 1.11.9+ backend reports (artifact-keeper#5055)", () => {
    expect(adaptAllowlist({ ...SAVED, scope: "all_members" }, "k").scope).toBe("all_members");
    expect(adaptAllowlist({ ...SAVED, scope: "remote_only" }, "k").scope).toBe("remote_only");
  });

  it("reports no scope for an older backend or an unknown value", () => {
    // An older backend omits the field; an unknown value must not be
    // overwritten by a save, so it is treated as not reported either.
    expect(adaptAllowlist(SAVED, "k").scope).toBeNull();
    expect(adaptAllowlist({ ...SAVED, scope: "hosted_only" }, "k").scope).toBeNull();
    expect(adaptAllowlist({ ...SAVED, scope: 1 }, "k").scope).toBeNull();
  });

  it("treats an empty body as no list", () => {
    expect(adaptAllowlist(undefined, "k")).toMatchObject({ enabled: false, entries: [], entry_count: 0 });
  });
});

describe("condaAllowlistApi", () => {
  it("GETs the repository's allowlist, key encoded", async () => {
    const fetchMock = stubFetch(SAVED);
    const r = await condaAllowlistApi.get("conda virtual");
    expect(r.entry_count).toBe(2);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/v1\/repositories\/conda%20virtual\/allowlist$/);
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
  });

  it("PUTs the whole list", async () => {
    const fetchMock = stubFetch(SAVED);
    const body = { enabled: true, entries: SAVED.entries };
    const r = await condaAllowlistApi.set("conda-virtual", body);
    expect(r).toMatchObject({ enabled: true, entry_count: 2 });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it("PUTs the scope when given and leaves it out otherwise", async () => {
    const fetchMock = stubFetch({ ...SAVED, scope: "remote_only" });
    const r = await condaAllowlistApi.set("conda-virtual", {
      enabled: true,
      scope: "remote_only",
      entries: SAVED.entries,
    });
    expect(r.scope).toBe("remote_only");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).scope).toBe("remote_only");

    const older = stubFetch(SAVED);
    await condaAllowlistApi.set("conda-virtual", { enabled: true, entries: SAVED.entries });
    expect(JSON.parse(older.mock.calls[0][1].body)).not.toHaveProperty("scope");
  });

  it("DELETEs the list", async () => {
    const fetchMock = stubFetch({ repository_key: "conda-virtual", enabled: false, entries: [], entry_count: 0 });
    const r = await condaAllowlistApi.remove("conda-virtual");
    expect(r.enabled).toBe(false);
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });

  it("throws an ApiError carrying the backend's message on a refused PUT", async () => {
    stubFetch({ code: "VALIDATION_ERROR", message: 'entries[1]: version ">=>2" is not a conda version spec' }, 400);
    const err = await condaAllowlistApi
      .set("conda-virtual", { enabled: true, entries: [{ name: "a" }, { name: "b", version: ">=>2" }] })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.body).toContain("entries[1]");
  });
});

describe("filtersHostedMembers", () => {
  it("is true only for an all_members scope; an older backend filters remotes only", () => {
    expect(filtersHostedMembers({ scope: "all_members" })).toBe(true);
    expect(filtersHostedMembers({ scope: "remote_only" })).toBe(false);
    expect(filtersHostedMembers({ scope: null })).toBe(false);
  });
});

describe("supportsCondaAllowlist", () => {
  it("is true for virtual conda repositories only", () => {
    expect(supportsCondaAllowlist({ format: "conda", repo_type: "virtual" })).toBe(true);
    expect(supportsCondaAllowlist({ format: "conda_native", repo_type: "virtual" })).toBe(true);
    expect(supportsCondaAllowlist({ format: "conda", repo_type: "remote" })).toBe(false);
    expect(supportsCondaAllowlist({ format: "pypi", repo_type: "virtual" })).toBe(false);
    expect(supportsCondaAllowlist(undefined)).toBe(false);
  });
});
