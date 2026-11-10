import { describe, it, expect, vi, beforeEach } from "vitest";

const mockApiFetch = vi.fn();
vi.mock("../fetch", () => ({
  apiFetch: (...a: unknown[]) => mockApiFetch(...a),
}));

import {
  exceptionsApi,
  EXCEPTION_GATES,
  EXCEPTION_STATUSES,
  DEFAULT_EXPIRY_DAYS,
} from "../exceptions";

/** One row as the backend serialises it. */
const WIRE = {
  id: "ex1",
  repository_key: "npm-remote",
  package_name: "leftpad-clone",
  package_version: "0.0.1",
  gate: "scan",
  status: "pending",
  origin: "requested",
  justification: "the build needs it",
  request_count: 4,
  requested_at: "2026-07-15T00:00:00Z",
  last_requested_at: "2026-07-20T00:00:00Z",
  reviewed_at: null,
  reviewed_by: null,
  review_reason: null,
  requested_by: "u-1",
  expires_at: null,
  upstream_published_at: "2026-07-10T00:00:00Z",
};

/** The last path `apiFetch` was called with. */
const lastPath = () => mockApiFetch.mock.calls.at(-1)?.[0] as string;
/** The last request body, parsed back out of JSON. */
const lastBody = () =>
  JSON.parse(
    (mockApiFetch.mock.calls.at(-1)?.[1] as RequestInit).body as string,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue(WIRE);
});

describe("constants", () => {
  it("pins the gates and statuses the backend models", () => {
    // The page keys plain-language copy off each of these, so a new gate has
    // to be added here and labelled there in the same change.
    expect(EXCEPTION_GATES).toEqual(["age", "scan", "curation"]);
    expect(EXCEPTION_STATUSES).toEqual(["pending", "approved", "rejected"]);
    expect(DEFAULT_EXPIRY_DAYS).toBe(90);
  });
});

describe("exceptionsApi.list", () => {
  beforeEach(() => {
    mockApiFetch.mockResolvedValue({ items: [WIRE], pagination: { total: 7 } });
  });

  it("asks for every gate and status with no query string when unfiltered", async () => {
    const out = await exceptionsApi.list();
    expect(lastPath()).toBe("/api/v1/exceptions/reviews");
    expect(out.total).toBe(7);
    expect(out.items).toHaveLength(1);
  });

  it("joins multi-valued filters into the comma-separated form the backend parses", async () => {
    await exceptionsApi.list({
      gates: ["scan", "curation"],
      statuses: ["pending", "approved"],
      repositoryKey: "npm-remote",
      page: 2,
      perPage: 50,
    });
    const q = new URLSearchParams(lastPath().split("?")[1]);
    expect(q.get("gate")).toBe("scan,curation");
    expect(q.get("status")).toBe("pending,approved");
    expect(q.get("repository_key")).toBe("npm-remote");
    expect(q.get("page")).toBe("2");
    expect(q.get("per_page")).toBe("50");
  });

  it("omits justified_only rather than sending false, which the backend already defaults to", async () => {
    await exceptionsApi.list({ justifiedOnly: false });
    expect(lastPath()).toBe("/api/v1/exceptions/reviews");
    await exceptionsApi.list({ justifiedOnly: true });
    expect(lastPath()).toContain("justified_only=true");
  });

  it("drops an empty gate or status array instead of sending an empty filter", async () => {
    // An empty array means "the caller has nothing selected", and sending
    // `gate=` would ask the backend for rows matching no gate at all.
    await exceptionsApi.list({ gates: [], statuses: [] });
    expect(lastPath()).toBe("/api/v1/exceptions/reviews");
  });

  it("survives a response with neither items nor pagination", async () => {
    mockApiFetch.mockResolvedValue({});
    const out = await exceptionsApi.list();
    expect(out).toEqual({ items: [], total: 0 });
  });
});

describe("adapting a wire row", () => {
  const adapted = async (over: Record<string, unknown> = {}) => {
    mockApiFetch.mockResolvedValue({
      items: [{ ...WIRE, ...over }],
      pagination: { total: 1 },
    });
    return (await exceptionsApi.list()).items[0];
  };

  it("renames every snake_case field to the camelCase the UI reads", async () => {
    expect(await adapted()).toEqual({
      id: "ex1",
      repositoryKey: "npm-remote",
      packageName: "leftpad-clone",
      packageVersion: "0.0.1",
      gate: "scan",
      status: "pending",
      origin: "requested",
      justification: "the build needs it",
      requestCount: 4,
      requestedAt: "2026-07-15T00:00:00Z",
      lastRequestedAt: "2026-07-20T00:00:00Z",
      requestedBy: "u-1",
      reviewedAt: null,
      reviewedBy: null,
      reviewedByUsername: null,
      reviewReason: null,
      expiresAt: null,
      upstreamPublishedAt: "2026-07-10T00:00:00Z",
    });
  });

  it("leaves an unknown or absent gate null rather than guessing age", async () => {
    // A row from a backend older than the queue carries no gate. Inventing
    // `age` for it would mislabel a scan refusal on the reviewer's screen.
    expect((await adapted({ gate: undefined })).gate).toBeNull();
    expect((await adapted({ gate: null })).gate).toBeNull();
    expect((await adapted({ gate: "quarantine" })).gate).toBeNull();
  });

  it("treats any origin that is not `requested` as an auto-filed attempt", async () => {
    expect((await adapted({ origin: "attempted" })).origin).toBe("attempted");
    expect((await adapted({ origin: "something-new" })).origin).toBe(
      "attempted",
    );
  });

  it("normalises every absent optional to null", async () => {
    const row = await adapted({
      justification: undefined,
      reviewed_at: undefined,
      reviewed_by: undefined,
      reviewed_by_username: undefined,
      review_reason: undefined,
      requested_by: undefined,
      expires_at: undefined,
      upstream_published_at: undefined,
    });
    expect(row.justification).toBeNull();
    expect(row.reviewedAt).toBeNull();
    expect(row.reviewedBy).toBeNull();
    expect(row.reviewedByUsername).toBeNull();
    expect(row.reviewReason).toBeNull();
    expect(row.requestedBy).toBeNull();
    expect(row.expiresAt).toBeNull();
    expect(row.upstreamPublishedAt).toBeNull();
  });
});

describe("exceptionsApi.approve", () => {
  it("sends the expiry window it was given", async () => {
    await exceptionsApi.approve("ex1", { reason: "vendor confirmed", expiresInDays: 30 });
    expect(lastPath()).toBe("/api/v1/exceptions/reviews/ex1/approve");
    expect(lastBody()).toEqual({ reason: "vendor confirmed", expires_in_days: 30 });
  });

  it("sends never_expires INSTEAD of a window, never both", async () => {
    // The backend refuses both at once: "forever" has to be stated, not
    // reached by leaving a field blank.
    await exceptionsApi.approve("ex1", {
      reason: "accepted permanently",
      neverExpires: true,
      expiresInDays: 30,
    });
    expect(lastBody()).toEqual({
      reason: "accepted permanently",
      never_expires: true,
    });
  });

  it("omits the expiry entirely when the caller states neither", async () => {
    await exceptionsApi.approve("ex1", { reason: "why" });
    expect(lastBody()).toEqual({ reason: "why" });
  });

  it("sends a blank or whitespace-only reason as null", async () => {
    await exceptionsApi.approve("ex1", { reason: "   " });
    expect(lastBody().reason).toBeNull();
    await exceptionsApi.approve("ex1");
    expect(lastBody().reason).toBeNull();
  });

  it("percent-encodes the id into the path", async () => {
    await exceptionsApi.approve("a/b?c", {});
    expect(lastPath()).toBe("/api/v1/exceptions/reviews/a%2Fb%3Fc/approve");
  });

  it("adapts the row the backend returns", async () => {
    const out = await exceptionsApi.approve("ex1", {});
    expect(out.packageName).toBe("leftpad-clone");
    expect(out.repositoryKey).toBe("npm-remote");
  });
});

describe("exceptionsApi.reject", () => {
  it("posts the reason to the reject route", async () => {
    await exceptionsApi.reject("ex1", "  not accepting this  ");
    expect(lastPath()).toBe("/api/v1/exceptions/reviews/ex1/reject");
    expect(lastBody()).toEqual({ reason: "not accepting this" });
  });

  it("allows a refusal with no reason at all", async () => {
    await exceptionsApi.reject("ex1");
    expect(lastBody()).toEqual({ reason: null });
  });
});

describe("exceptionsApi.reopen", () => {
  it("posts the reason to the reopen route", async () => {
    await exceptionsApi.reopen("ex1", "  granted the wrong version  ");
    expect(lastPath()).toBe("/api/v1/exceptions/reviews/ex1/reopen");
    expect(lastBody()).toEqual({ reason: "granted the wrong version" });
  });

  it("refuses a blank reason without spending a round trip", async () => {
    // Reopen is the one action whose audit entry has nothing else to say why
    // a recorded decision was reversed, so the guard is client-side too.
    await expect(exceptionsApi.reopen("ex1", "   ")).rejects.toThrow(
      /reason is required/i,
    );
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe("exceptionsApi.request", () => {
  const input = {
    repositoryKey: "npm-remote",
    gate: "scan" as const,
    packageName: "  leftpad-clone  ",
    packageVersion: "  0.0.1  ",
    justification: "  the build needs it  ",
  };

  it("posts the trimmed coordinate to the requests route", async () => {
    await exceptionsApi.request(input);
    expect(lastPath()).toBe("/api/v1/exceptions/requests");
    expect(lastBody()).toEqual({
      repository_key: "npm-remote",
      gate: "scan",
      package_name: "leftpad-clone",
      package_version: "0.0.1",
      justification: "the build needs it",
    });
  });

  it("sends a null version for a request against the whole package", async () => {
    await exceptionsApi.request({ ...input, packageVersion: "   " });
    expect(lastBody().package_version).toBeNull();
    await exceptionsApi.request({ ...input, packageVersion: undefined });
    expect(lastBody().package_version).toBeNull();
  });

  it("refuses a blank justification without spending a round trip", async () => {
    // The justification is the whole point: it is what promotes an
    // auto-filed row from `attempted` to a request a reviewer sees.
    await expect(
      exceptionsApi.request({ ...input, justification: "   " }),
    ).rejects.toThrow(/justification is required/i);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("lets a transport failure through untouched", async () => {
    const boom = new Error("API error 403: forbidden");
    mockApiFetch.mockRejectedValue(boom);
    await expect(exceptionsApi.request(input)).rejects.toBe(boom);
  });
});
