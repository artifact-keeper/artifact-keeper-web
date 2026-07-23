import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockApiFetch = vi.fn();

vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const ROW = {
  id: "0d9c34a6-9a2e-4f2b-9f7d-1c2d3e4f5a6b",
  user_id: "0e8b23a5-1111-4f2b-9f7d-1c2d3e4f5a6b",
  action: "USER_CREATED",
  resource_type: "user",
  resource_id: "1f7a12b4-2222-4f2b-9f7d-1c2d3e4f5a6b",
  details: { username: "alice" },
  ip_address: "10.0.0.1",
  correlation_id: "2a6b01c3-3333-4f2b-9f7d-1c2d3e4f5a6b",
  created_at: "2026-07-10T12:00:00Z",
};

describe("auditApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses a paginated audit-log response", async () => {
    mockApiFetch.mockResolvedValue({
      items: [ROW],
      total: 1,
      page: 1,
      per_page: 50,
    });
    const mod = await import("../audit");
    const res = await mod.auditApi.list();
    expect(res.total).toBe(1);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].action).toBe("USER_CREATED");
    expect(res.items[0].ip_address).toBe("10.0.0.1");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/admin/audit", {
      method: "GET",
    });
  });

  it("normalizes null/omitted optional fields", async () => {
    mockApiFetch.mockResolvedValue({
      items: [
        {
          ...ROW,
          user_id: null,
          resource_id: null,
          ip_address: null,
          details: undefined,
        },
      ],
      total: 1,
      page: 1,
      per_page: 50,
    });
    const mod = await import("../audit");
    const res = await mod.auditApi.list();
    expect(res.items[0].user_id).toBeNull();
    expect(res.items[0].resource_id).toBeNull();
    expect(res.items[0].ip_address).toBeNull();
    expect(res.items[0].details).toBeNull();
  });

  it("throws on a response that does not match the expected shape", async () => {
    mockApiFetch.mockResolvedValue({ rows: [ROW] });
    const mod = await import("../audit");
    await expect(mod.auditApi.list()).rejects.toThrow(
      /did not match the expected shape/
    );
  });

  it("serializes filters and pagination into the query string", async () => {
    mockApiFetch.mockResolvedValue({ items: [], total: 0, page: 2, per_page: 25 });
    const mod = await import("../audit");
    await mod.auditApi.list({
      user_id: ROW.user_id,
      action: "LOGIN",
      resource_type: "user",
      resource_id: ROW.resource_id,
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-10T23:59:59.999Z",
      page: 2,
      per_page: 25,
    });
    const url = mockApiFetch.mock.calls[0][0] as string;
    const qs = new URLSearchParams(url.split("?")[1]);
    expect(url.startsWith("/api/v1/admin/audit?")).toBe(true);
    expect(qs.get("user_id")).toBe(ROW.user_id);
    expect(qs.get("action")).toBe("LOGIN");
    expect(qs.get("resource_type")).toBe("user");
    expect(qs.get("resource_id")).toBe(ROW.resource_id);
    expect(qs.get("from")).toBe("2026-07-01T00:00:00.000Z");
    expect(qs.get("to")).toBe("2026-07-10T23:59:59.999Z");
    expect(qs.get("page")).toBe("2");
    expect(qs.get("per_page")).toBe("25");
  });

  it("omits empty filters and trims whitespace", async () => {
    const mod = await import("../audit");
    const qs = mod.buildAuditQueryString({
      action: "  LOGIN  ",
      resource_type: "",
      user_id: "   ",
    });
    expect(qs).toBe("?action=LOGIN");
  });

  it("clamps per_page to the backend max and floors page at 1", async () => {
    const mod = await import("../audit");
    const qs = new URLSearchParams(
      mod.buildAuditQueryString({ page: 0, per_page: 999 }).slice(1)
    );
    expect(qs.get("page")).toBe("1");
    expect(qs.get("per_page")).toBe(String(mod.AUDIT_MAX_PER_PAGE));
  });

  it("validates UUIDs for client-side filter feedback", async () => {
    const mod = await import("../audit");
    expect(mod.isValidUuid(ROW.user_id)).toBe(true);
    expect(mod.isValidUuid(` ${ROW.user_id} `)).toBe(true);
    expect(mod.isValidUuid("alice")).toBe(false);
    expect(mod.isValidUuid("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Export builders (#603)
// ---------------------------------------------------------------------------

/** A parsed AuditLogItem as callers see it (nulls normalized). */
const ITEM = {
  id: ROW.id,
  user_id: ROW.user_id,
  actor_username: "alice",
  action: "USER_CREATED",
  resource_type: "user",
  resource_id: ROW.resource_id,
  details: { username: "alice" },
  ip_address: "10.0.0.1",
  correlation_id: ROW.correlation_id,
  created_at: ROW.created_at,
};

describe("auditCsvCell", () => {
  it("returns empty string for null/undefined", async () => {
    const { auditCsvCell } = await import("../audit");
    expect(auditCsvCell(null)).toBe("");
    expect(auditCsvCell(undefined)).toBe("");
  });

  it("quotes and escapes values with commas, quotes, or newlines", async () => {
    const { auditCsvCell } = await import("../audit");
    expect(auditCsvCell("a,b")).toBe('"a,b"');
    expect(auditCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(auditCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralizes spreadsheet formula injection (CWE-1236)", async () => {
    const { auditCsvCell } = await import("../audit");
    expect(auditCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(auditCsvCell("+1")).toBe("'+1");
    expect(auditCsvCell("-1")).toBe("'-1");
    expect(auditCsvCell("@cmd")).toBe("'@cmd");
    // A dangerous prefix combined with a comma is both de-fanged and quoted.
    expect(auditCsvCell("=1,2")).toBe(`"'=1,2"`);
  });
});

describe("auditItemsToCsv", () => {
  it("emits a header-only document for an empty export", async () => {
    const { auditItemsToCsv, AUDIT_EXPORT_COLUMNS } = await import("../audit");
    const csv = auditItemsToCsv([]);
    expect(csv).toBe(`${AUDIT_EXPORT_COLUMNS.join(",")}\r\n`);
  });

  it("writes one CRLF-terminated row per event with details serialized", async () => {
    const { auditItemsToCsv, AUDIT_EXPORT_COLUMNS } = await import("../audit");
    const csv = auditItemsToCsv([ITEM as never]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(AUDIT_EXPORT_COLUMNS.join(","));
    const cols = lines[1].split(",");
    expect(cols[0]).toBe(ITEM.id); // id
    expect(cols[2]).toBe("USER_CREATED"); // action
    // details (last column) is a JSON string, quoted because it contains a comma-free
    // object here but quotes from JSON — assert it round-trips the username.
    expect(lines[1]).toContain("alice");
  });

  it("serializes null and string details safely", async () => {
    const { auditItemsToCsv } = await import("../audit");
    const csv = auditItemsToCsv([
      { ...ITEM, id: "a", details: null } as never,
      { ...ITEM, id: "b", details: "plain" } as never,
    ]);
    const rows = csv.trimEnd().split("\r\n").slice(1);
    expect(rows[0].endsWith(",")).toBe(true); // null -> empty trailing cell
    expect(rows[1].endsWith(",plain")).toBe(true);
  });
});

describe("buildAuditExportEnvelope / auditItemsToJson", () => {
  it("wraps items in a versioned envelope with normalized filters", async () => {
    const { buildAuditExportEnvelope, AUDIT_EXPORT_SCHEMA_VERSION } =
      await import("../audit");
    const env = buildAuditExportEnvelope([ITEM as never], {
      filters: {
        action: "  LOGIN  ",
        resource_type: "",
        user_id: "   ",
        from: "2026-07-01T00:00:00.000Z",
        page: 3,
        per_page: 25,
      },
      total: 42,
      truncated: true,
      exportedAt: "2026-07-19T00:00:00.000Z",
    });
    expect(env.schema_version).toBe(AUDIT_EXPORT_SCHEMA_VERSION);
    expect(env.exported_at).toBe("2026-07-19T00:00:00.000Z");
    expect(env.count).toBe(1);
    expect(env.total).toBe(42);
    expect(env.truncated).toBe(true);
    // Empty + paging filters are dropped; free-text is trimmed.
    expect(env.filters).toEqual({
      action: "LOGIN",
      from: "2026-07-01T00:00:00.000Z",
    });
    expect(env.items).toHaveLength(1);
  });

  it("defaults total/truncated/exported_at when omitted", async () => {
    const { buildAuditExportEnvelope } = await import("../audit");
    const env = buildAuditExportEnvelope([ITEM as never]);
    expect(env.total).toBe(1);
    expect(env.truncated).toBe(false);
    expect(typeof env.exported_at).toBe("string");
    expect(env.filters).toEqual({});
  });

  it("auditItemsToJson produces parseable JSON matching the envelope", async () => {
    const { auditItemsToJson, buildAuditExportEnvelope } = await import(
      "../audit"
    );
    const meta = { exportedAt: "2026-07-19T00:00:00.000Z" };
    const json = auditItemsToJson([ITEM as never], meta);
    expect(JSON.parse(json)).toEqual(
      buildAuditExportEnvelope([ITEM as never], meta)
    );
  });
});

describe("buildAuditExportFilename", () => {
  it("builds a filesystem-safe timestamped name per format", async () => {
    const { buildAuditExportFilename } = await import("../audit");
    const at = new Date("2026-07-19T12:34:56.789Z");
    expect(buildAuditExportFilename("csv", at)).toBe(
      "audit-log-2026-07-19T12-34-56-789Z.csv"
    );
    expect(buildAuditExportFilename("json", at)).toBe(
      "audit-log-2026-07-19T12-34-56-789Z.json"
    );
  });
});

describe("auditApi.export", () => {
  beforeEach(() => vi.clearAllMocks());

  /** Serve `total` rows across pages of `AUDIT_MAX_PER_PAGE` from apiFetch. */
  function servePages(total: number, perPage: number) {
    mockApiFetch.mockImplementation((url: string) => {
      const qs = new URLSearchParams(url.split("?")[1] ?? "");
      const page = Number(qs.get("page") ?? "1");
      const start = (page - 1) * perPage;
      const items = Array.from(
        { length: Math.max(0, Math.min(perPage, total - start)) },
        (_, i) => ({ ...ROW, id: `row-${start + i}` })
      );
      return Promise.resolve({ items, total, page, per_page: perPage });
    });
  }

  it("collects every matching row across pages, honoring filters", async () => {
    const mod = await import("../audit");
    servePages(450, mod.AUDIT_MAX_PER_PAGE); // 200 + 200 + 50 => 3 pages

    const res = await mod.auditApi.export({ action: "LOGIN", page: 9, per_page: 5 });

    expect(res.total).toBe(450);
    expect(res.items).toHaveLength(450);
    expect(res.truncated).toBe(false);

    // Three page requests, each at the backend max page size, all carrying the
    // filter and NOT the caller's page/per_page.
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
    const urls = mockApiFetch.mock.calls.map((c) => c[0] as string);
    urls.forEach((url, idx) => {
      const qs = new URLSearchParams(url.split("?")[1]);
      expect(qs.get("action")).toBe("LOGIN");
      expect(qs.get("per_page")).toBe(String(mod.AUDIT_MAX_PER_PAGE));
      expect(qs.get("page")).toBe(String(idx + 1));
    });
  });

  it("stops after a single page when results fit", async () => {
    const mod = await import("../audit");
    servePages(10, mod.AUDIT_MAX_PER_PAGE);
    const res = await mod.auditApi.export();
    expect(res.items).toHaveLength(10);
    expect(res.truncated).toBe(false);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it("caps at maxRows and reports truncation without over-fetching", async () => {
    const mod = await import("../audit");
    servePages(1000, mod.AUDIT_MAX_PER_PAGE);
    const res = await mod.auditApi.export({}, { maxRows: 250 });
    expect(res.items).toHaveLength(250);
    expect(res.total).toBe(1000);
    expect(res.truncated).toBe(true);
    // Only two pages needed to reach 250 rows (200 + 50 kept).
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it("handles an empty result set", async () => {
    const mod = await import("../audit");
    servePages(0, mod.AUDIT_MAX_PER_PAGE);
    const res = await mod.auditApi.export();
    expect(res.items).toHaveLength(0);
    expect(res.total).toBe(0);
    expect(res.truncated).toBe(false);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});
