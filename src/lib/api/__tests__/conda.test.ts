import { describe, it, expect } from "vitest";
import { adaptNotices, noticeForPackage } from "../conda";

describe("adaptNotices", () => {
  it("keeps well-formed notices and drops the rest", () => {
    const n = adaptNotices({
      notices: [
        { id: "1", message: "Package a.conda was withdrawn from this channel: CVE", package: "a.conda" },
        { id: "2" },
        "junk",
      ],
    });
    expect(n).toHaveLength(1);
    expect(n[0].package).toBe("a.conda");
  });

  it("returns an empty list for an unexpected body", () => {
    expect(adaptNotices(undefined)).toEqual([]);
    expect(adaptNotices({ notices: {} })).toEqual([]);
  });
});

describe("noticeForPackage", () => {
  it("returns the newest notice for the file", () => {
    const n = adaptNotices({
      notices: [
        { id: "1", message: "old", package: "a.conda" },
        { id: "2", message: "other", package: "b.conda" },
        { id: "3", message: "new", package: "a.conda" },
      ],
    });
    expect(noticeForPackage(n, "a.conda")?.message).toBe("new");
    expect(noticeForPackage(n, "c.conda")).toBeUndefined();
  });
});

import { vi, afterEach } from "vitest";
import { condaApi } from "../conda";

describe("condaApi.withdraw", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("DELETEs the package's channel path with the reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ withdrawn: true, notice_id: "n1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await condaApi.withdraw("conda-internal", "noarch/acme core-1.0-py_0.conda", "CVE-2026-1");
    expect(r.notice_id).toBe("n1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/conda\/conda-internal\/noarch\/acme%20core-1\.0-py_0\.conda$/);
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual({ reason: "CVE-2026-1" });
  });
});

describe("condaApi.getNotices", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("bypasses the browser cache (the channel sends max-age=60)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ notices: [{ id: "1", message: "m" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const n = await condaApi.getNotices("conda-internal");
    expect(n).toHaveLength(1);
    expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
  });
});
