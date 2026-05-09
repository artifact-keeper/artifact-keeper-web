import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockListConnections = vi.fn();
const mockCreateConnection = vi.fn();
const mockGetConnection = vi.fn();
const mockDeleteConnection = vi.fn();
const mockTestConnection = vi.fn();
const mockListSourceRepositories = vi.fn();
const mockListMigrations = vi.fn();
const mockCreateMigration = vi.fn();
const mockGetMigration = vi.fn();
const mockDeleteMigration = vi.fn();
const mockStartMigration = vi.fn();
const mockPauseMigration = vi.fn();
const mockResumeMigration = vi.fn();
const mockCancelMigration = vi.fn();
const mockListMigrationItems = vi.fn();
const mockGetMigrationReport = vi.fn();
const mockRunAssessment = vi.fn();
const mockGetAssessment = vi.fn();
const mockCreateDownloadTicket = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  listConnections: (...args: unknown[]) => mockListConnections(...args),
  createConnection: (...args: unknown[]) => mockCreateConnection(...args),
  getConnection: (...args: unknown[]) => mockGetConnection(...args),
  deleteConnection: (...args: unknown[]) => mockDeleteConnection(...args),
  testConnection: (...args: unknown[]) => mockTestConnection(...args),
  listSourceRepositories: (...args: unknown[]) => mockListSourceRepositories(...args),
  listMigrations: (...args: unknown[]) => mockListMigrations(...args),
  createMigration: (...args: unknown[]) => mockCreateMigration(...args),
  getMigration: (...args: unknown[]) => mockGetMigration(...args),
  deleteMigration: (...args: unknown[]) => mockDeleteMigration(...args),
  startMigration: (...args: unknown[]) => mockStartMigration(...args),
  pauseMigration: (...args: unknown[]) => mockPauseMigration(...args),
  resumeMigration: (...args: unknown[]) => mockResumeMigration(...args),
  cancelMigration: (...args: unknown[]) => mockCancelMigration(...args),
  listMigrationItems: (...args: unknown[]) => mockListMigrationItems(...args),
  getMigrationReport: (...args: unknown[]) => mockGetMigrationReport(...args),
  runAssessment: (...args: unknown[]) => mockRunAssessment(...args),
  getAssessment: (...args: unknown[]) => mockGetAssessment(...args),
  createDownloadTicket: (...args: unknown[]) => mockCreateDownloadTicket(...args),
}));

// Full-shape fixtures matching the SDK response types so the adapters in
// migration.ts can map them to the local domain types.
function sdkConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    name: "n",
    url: "https://x",
    auth_type: "api_token",
    source_type: "artifactory",
    created_at: "2025-01-01",
    verified_at: null,
    ...overrides,
  };
}

function sdkJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    source_connection_id: "c1",
    status: "pending",
    job_type: "full",
    config: {},
    total_items: 0,
    completed_items: 0,
    failed_items: 0,
    skipped_items: 0,
    total_bytes: 0,
    transferred_bytes: 0,
    progress_percent: 0,
    estimated_time_remaining: null,
    started_at: null,
    finished_at: null,
    created_at: "2025-01-01",
    error_summary: null,
    ...overrides,
  };
}

function sdkItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "i1",
    job_id: "m1",
    item_type: "artifact",
    source_path: "src/foo",
    target_path: null,
    status: "pending",
    size_bytes: 0,
    checksum_source: null,
    checksum_target: null,
    error_message: null,
    retry_count: 0,
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

function localJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    source_connection_id: "c1",
    status: "pending",
    job_type: "full",
    config: {},
    total_items: 0,
    completed_items: 0,
    failed_items: 0,
    skipped_items: 0,
    total_bytes: 0,
    transferred_bytes: 0,
    progress_percent: 0,
    estimated_time_remaining: undefined,
    started_at: undefined,
    finished_at: undefined,
    created_at: "2025-01-01",
    error_summary: undefined,
    ...overrides,
  };
}

function localItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "i1",
    job_id: "m1",
    item_type: "artifact",
    source_path: "src/foo",
    target_path: undefined,
    status: "pending",
    size_bytes: 0,
    checksum_source: undefined,
    checksum_target: undefined,
    error_message: undefined,
    retry_count: 0,
    started_at: undefined,
    completed_at: undefined,
    ...overrides,
  };
}

const validCreateConnReq = {
  name: "n",
  url: "https://x",
  auth_type: "api_token" as const,
  source_type: "artifactory" as const,
  credentials: {},
};
const validCreateMigrationReq = {
  source_connection_id: "c1",
  job_type: "full" as const,
  config: {},
};

describe("migrationApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("listConnections returns connections from items wrapper", async () => {
    const items = [sdkConnection()];
    mockListConnections.mockResolvedValue({ data: { items }, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.listConnections()).toEqual([
      {
        id: "c1",
        name: "n",
        url: "https://x",
        auth_type: "api_token",
        source_type: "artifactory",
        created_at: "2025-01-01",
        verified_at: undefined,
      },
    ]);
  });

  it("listConnections falls back when no items wrapper", async () => {
    mockListConnections.mockResolvedValue({
      data: [sdkConnection({ auth_type: "basic_auth" })],
      error: undefined,
    });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.listConnections()).toEqual([
      {
        id: "c1",
        name: "n",
        url: "https://x",
        auth_type: "basic_auth",
        source_type: "artifactory",
        created_at: "2025-01-01",
        verified_at: undefined,
      },
    ]);
  });

  it("listConnections throws on error", async () => {
    mockListConnections.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.listConnections()).rejects.toBe("fail");
  });

  it("listConnections preserves source_type=nexus from the SDK response", async () => {
    mockListConnections.mockResolvedValue({
      data: [sdkConnection({ source_type: "nexus" })],
      error: undefined,
    });
    const { migrationApi } = await import("../migration");
    const result = await migrationApi.listConnections();
    expect(result[0].source_type).toBe("nexus");
  });

  it("listConnections defaults unknown source_type to 'artifactory'", async () => {
    mockListConnections.mockResolvedValue({
      data: [sdkConnection({ source_type: "future-registry" })],
      error: undefined,
    });
    const { migrationApi } = await import("../migration");
    const result = await migrationApi.listConnections();
    expect(result[0].source_type).toBe("artifactory");
  });

  it("createConnection forwards source_type to the SDK call", async () => {
    mockCreateConnection.mockResolvedValue({
      data: sdkConnection({ source_type: "nexus" }),
      error: undefined,
    });
    const { migrationApi } = await import("../migration");
    await migrationApi.createConnection({
      ...validCreateConnReq,
      source_type: "nexus",
    });
    expect(mockCreateConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ source_type: "nexus" }),
      }),
    );
  });

  it("createConnection returns connection", async () => {
    mockCreateConnection.mockResolvedValue({
      data: sdkConnection({ id: "c2" }),
      error: undefined,
    });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.createConnection(validCreateConnReq)).toEqual({
      id: "c2",
      name: "n",
      url: "https://x",
      auth_type: "api_token",
      source_type: "artifactory",
      created_at: "2025-01-01",
      verified_at: undefined,
    });
  });

  it("createConnection throws on error", async () => {
    mockCreateConnection.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.createConnection(validCreateConnReq)).rejects.toBe("fail");
  });

  it("getConnection returns connection", async () => {
    mockGetConnection.mockResolvedValue({ data: sdkConnection(), error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.getConnection("c1")).toEqual({
      id: "c1",
      name: "n",
      url: "https://x",
      auth_type: "api_token",
      source_type: "artifactory",
      created_at: "2025-01-01",
      verified_at: undefined,
    });
  });

  it("getConnection throws on error", async () => {
    mockGetConnection.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.getConnection("c1")).rejects.toBe("fail");
  });

  it("deleteConnection calls SDK", async () => {
    mockDeleteConnection.mockResolvedValue({ error: undefined });
    const { migrationApi } = await import("../migration");
    await migrationApi.deleteConnection("c1");
    expect(mockDeleteConnection).toHaveBeenCalled();
  });

  it("deleteConnection throws on error", async () => {
    mockDeleteConnection.mockResolvedValue({ error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.deleteConnection("c1")).rejects.toBe("fail");
  });

  it("testConnection returns result", async () => {
    const result = {
      success: true,
      message: "ok",
      artifactory_version: null,
      license_type: null,
    };
    mockTestConnection.mockResolvedValue({ data: result, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.testConnection("c1")).toEqual({
      success: true,
      message: "ok",
      artifactory_version: undefined,
      license_type: undefined,
    });
  });

  it("testConnection throws on error", async () => {
    mockTestConnection.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.testConnection("c1")).rejects.toBe("fail");
  });

  it("listSourceRepositories returns from items wrapper", async () => {
    const sdkRepo = {
      key: "repo1",
      type: "local",
      package_type: "npm",
      url: "https://x",
    };
    mockListSourceRepositories.mockResolvedValue({ data: { items: [sdkRepo] }, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.listSourceRepositories("c1")).toEqual([
      {
        key: "repo1",
        type: "local",
        package_type: "npm",
        url: "https://x",
        description: undefined,
      },
    ]);
  });

  it("listSourceRepositories throws on error", async () => {
    mockListSourceRepositories.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.listSourceRepositories("c1")).rejects.toBe("fail");
  });

  it("listMigrations returns paginated data with adapter applied", async () => {
    const data = {
      items: [sdkJob()],
      pagination: { page: 1, per_page: 10, total: 1, total_pages: 1 },
    };
    mockListMigrations.mockResolvedValue({ data, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.listMigrations()).toEqual({
      items: [localJob()],
      pagination: { page: 1, per_page: 10, total: 1, total_pages: 1 },
    });
  });

  it("listMigrations falls back to bare-array shape with synthesized pagination", async () => {
    mockListMigrations.mockResolvedValue({ data: [sdkJob()], error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.listMigrations()).toEqual({
      items: [localJob()],
      pagination: { page: 1, per_page: 1, total: 1, total_pages: 1 },
    });
  });

  it("listMigrations throws on error", async () => {
    mockListMigrations.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.listMigrations()).rejects.toBe("fail");
  });

  it("createMigration returns adapted job", async () => {
    mockCreateMigration.mockResolvedValue({ data: sdkJob({ id: "m2" }), error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.createMigration(validCreateMigrationReq)).toEqual(
      localJob({ id: "m2" })
    );
  });

  it("createMigration throws on error", async () => {
    mockCreateMigration.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.createMigration(validCreateMigrationReq)).rejects.toBe("fail");
  });

  it("getMigration returns adapted job", async () => {
    mockGetMigration.mockResolvedValue({ data: sdkJob(), error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.getMigration("m1")).toEqual(localJob());
  });

  it("getMigration throws on error", async () => {
    mockGetMigration.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.getMigration("m1")).rejects.toBe("fail");
  });

  it("deleteMigration calls SDK", async () => {
    mockDeleteMigration.mockResolvedValue({ error: undefined });
    const { migrationApi } = await import("../migration");
    await migrationApi.deleteMigration("m1");
    expect(mockDeleteMigration).toHaveBeenCalled();
  });

  it("deleteMigration throws on error", async () => {
    mockDeleteMigration.mockResolvedValue({ error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.deleteMigration("m1")).rejects.toBe("fail");
  });

  it("startMigration returns adapted job", async () => {
    mockStartMigration.mockResolvedValue({
      data: sdkJob({ status: "running" }),
      error: undefined,
    });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.startMigration("m1")).toEqual(localJob({ status: "running" }));
  });

  it("startMigration throws on error", async () => {
    mockStartMigration.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.startMigration("m1")).rejects.toBe("fail");
  });

  it("pauseMigration returns adapted job", async () => {
    mockPauseMigration.mockResolvedValue({
      data: sdkJob({ status: "paused" }),
      error: undefined,
    });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.pauseMigration("m1")).toEqual(localJob({ status: "paused" }));
  });

  it("pauseMigration throws on error", async () => {
    mockPauseMigration.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.pauseMigration("m1")).rejects.toBe("fail");
  });

  it("resumeMigration returns adapted job", async () => {
    mockResumeMigration.mockResolvedValue({
      data: sdkJob({ status: "running" }),
      error: undefined,
    });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.resumeMigration("m1")).toEqual(localJob({ status: "running" }));
  });

  it("resumeMigration throws on error", async () => {
    mockResumeMigration.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.resumeMigration("m1")).rejects.toBe("fail");
  });

  it("cancelMigration returns adapted job", async () => {
    mockCancelMigration.mockResolvedValue({
      data: sdkJob({ status: "cancelled" }),
      error: undefined,
    });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.cancelMigration("m1")).toEqual(localJob({ status: "cancelled" }));
  });

  it("cancelMigration throws on error", async () => {
    mockCancelMigration.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.cancelMigration("m1")).rejects.toBe("fail");
  });

  it("listMigrationItems returns paginated items with adapter applied", async () => {
    const data = {
      items: [sdkItem()],
      pagination: { page: 1, per_page: 10, total: 1, total_pages: 1 },
    };
    mockListMigrationItems.mockResolvedValue({ data, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.listMigrationItems("m1")).toEqual({
      items: [localItem()],
      pagination: { page: 1, per_page: 10, total: 1, total_pages: 1 },
    });
  });

  it("listMigrationItems falls back to bare-array shape", async () => {
    mockListMigrationItems.mockResolvedValue({ data: [sdkItem()], error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.listMigrationItems("m1")).toEqual({
      items: [localItem()],
      pagination: { page: 1, per_page: 1, total: 1, total_pages: 1 },
    });
  });

  it("listMigrationItems throws on error", async () => {
    mockListMigrationItems.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.listMigrationItems("m1")).rejects.toBe("fail");
  });

  it("getMigrationReport returns adapted JSON report", async () => {
    const report = {
      id: "r1",
      job_id: "m1",
      generated_at: "2025-01-01",
      summary: { duration_seconds: 60 },
      warnings: [],
      errors: [],
      recommendations: [],
    };
    mockGetMigrationReport.mockResolvedValue({ data: report, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.getMigrationReport("m1")).toEqual({
      id: "r1",
      job_id: "m1",
      generated_at: "2025-01-01",
      summary: { duration_seconds: 60 },
      warnings: [],
      errors: [],
      recommendations: [],
    });
  });

  it("getMigrationReport returns raw HTML body when format=html", async () => {
    mockGetMigrationReport.mockResolvedValue({ data: "<html>ok</html>", error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.getMigrationReport("m1", "html")).toBe("<html>ok</html>");
  });

  it("getMigrationReport throws on error", async () => {
    mockGetMigrationReport.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.getMigrationReport("m1")).rejects.toBe("fail");
  });

  it("runAssessment returns adapted job", async () => {
    mockRunAssessment.mockResolvedValue({ data: sdkJob(), error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.runAssessment("m1")).toEqual(localJob());
  });

  it("runAssessment throws on error", async () => {
    mockRunAssessment.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.runAssessment("m1")).rejects.toBe("fail");
  });

  it("getAssessment returns adapted result", async () => {
    const result = {
      job_id: "m1",
      status: "complete",
      repositories: [],
      users_count: 0,
      groups_count: 0,
      permissions_count: 0,
      total_artifacts: 100,
      total_size_bytes: 0,
      estimated_duration_seconds: 0,
      warnings: [],
      blockers: [],
    };
    mockGetAssessment.mockResolvedValue({ data: result, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.getAssessment("m1")).toEqual(result);
  });

  it("getAssessment throws on error", async () => {
    mockGetAssessment.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.getAssessment("m1")).rejects.toBe("fail");
  });

  it("createStreamTicket returns ticket string", async () => {
    mockCreateDownloadTicket.mockResolvedValue({ data: { ticket: "tk123" }, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.createStreamTicket("m1")).toBe("tk123");
  });

  it("createStreamTicket throws on error", async () => {
    mockCreateDownloadTicket.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.createStreamTicket("m1")).rejects.toBe("fail");
  });

  it("narrowSourceRepoType warns on unknown type", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockListSourceRepositories.mockResolvedValue({
      data: { items: [{ key: "r", type: "federated", package_type: "npm", url: "u" }] },
      error: undefined,
    });
    const { migrationApi } = await import("../migration");
    const out = await migrationApi.listSourceRepositories("c1");
    expect(out[0].type).toBe("local");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
