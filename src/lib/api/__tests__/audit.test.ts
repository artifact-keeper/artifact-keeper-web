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
