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

describe("migrationApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("listConnections returns connections from items wrapper", async () => {
    const items = [{ id: "c1" }];
    mockListConnections.mockResolvedValue({ data: { items }, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.listConnections()).toEqual(items);
  });

  it("listConnections falls back when no items wrapper", async () => {
    const data = [{ id: "c1" }];
    mockListConnections.mockResolvedValue({ data, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.listConnections()).toEqual(data);
  });

  it("listConnections throws on error", async () => {
    mockListConnections.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.listConnections()).rejects.toBe("fail");
  });

  it("createConnection returns connection", async () => {
    const conn = { id: "c2" };
    mockCreateConnection.mockResolvedValue({ data: conn, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.createConnection({} as any)).toEqual(conn);
  });

  it("createConnection throws on error", async () => {
    mockCreateConnection.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.createConnection({} as any)).rejects.toBe("fail");
  });

  it("getConnection returns connection", async () => {
    const conn = { id: "c1" };
    mockGetConnection.mockResolvedValue({ data: conn, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.getConnection("c1")).toEqual(conn);
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
    const result = { success: true };
    mockTestConnection.mockResolvedValue({ data: result, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.testConnection("c1")).toEqual(result);
  });

  it("testConnection throws on error", async () => {
    mockTestConnection.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.testConnection("c1")).rejects.toBe("fail");
  });

  it("listSourceRepositories returns from items wrapper", async () => {
    const items = [{ name: "repo1" }];
    mockListSourceRepositories.mockResolvedValue({ data: { items }, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.listSourceRepositories("c1")).toEqual(items);
  });

  it("listSourceRepositories throws on error", async () => {
    mockListSourceRepositories.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.listSourceRepositories("c1")).rejects.toBe("fail");
  });

  it("listMigrations returns paginated data", async () => {
    const data = { items: [{ id: "m1" }], pagination: { total: 1 } };
    mockListMigrations.mockResolvedValue({ data, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.listMigrations()).toEqual(data);
  });

  it("listMigrations throws on error", async () => {
    mockListMigrations.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.listMigrations()).rejects.toBe("fail");
  });

  it("createMigration returns job", async () => {
    const job = { id: "m2" };
    mockCreateMigration.mockResolvedValue({ data: job, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.createMigration({} as any)).toEqual(job);
  });

  it("createMigration throws on error", async () => {
    mockCreateMigration.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.createMigration({} as any)).rejects.toBe("fail");
  });

  it("getMigration returns job", async () => {
    const job = { id: "m1" };
    mockGetMigration.mockResolvedValue({ data: job, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.getMigration("m1")).toEqual(job);
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

  it("startMigration returns job", async () => {
    const job = { id: "m1", status: "running" };
    mockStartMigration.mockResolvedValue({ data: job, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.startMigration("m1")).toEqual(job);
  });

  it("startMigration throws on error", async () => {
    mockStartMigration.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.startMigration("m1")).rejects.toBe("fail");
  });

  it("pauseMigration returns job", async () => {
    const job = { id: "m1", status: "paused" };
    mockPauseMigration.mockResolvedValue({ data: job, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.pauseMigration("m1")).toEqual(job);
  });

  it("pauseMigration throws on error", async () => {
    mockPauseMigration.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.pauseMigration("m1")).rejects.toBe("fail");
  });

  it("resumeMigration returns job", async () => {
    const job = { id: "m1", status: "running" };
    mockResumeMigration.mockResolvedValue({ data: job, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.resumeMigration("m1")).toEqual(job);
  });

  it("resumeMigration throws on error", async () => {
    mockResumeMigration.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.resumeMigration("m1")).rejects.toBe("fail");
  });

  it("cancelMigration returns job", async () => {
    const job = { id: "m1", status: "cancelled" };
    mockCancelMigration.mockResolvedValue({ data: job, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.cancelMigration("m1")).toEqual(job);
  });

  it("cancelMigration throws on error", async () => {
    mockCancelMigration.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.cancelMigration("m1")).rejects.toBe("fail");
  });

  it("listMigrationItems returns paginated items", async () => {
    const data = { items: [{ id: "i1" }], pagination: { total: 1 } };
    mockListMigrationItems.mockResolvedValue({ data, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.listMigrationItems("m1")).toEqual(data);
  });

  it("listMigrationItems throws on error", async () => {
    mockListMigrationItems.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.listMigrationItems("m1")).rejects.toBe("fail");
  });

  it("getMigrationReport returns report", async () => {
    const report = { summary: "done" };
    mockGetMigrationReport.mockResolvedValue({ data: report, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.getMigrationReport("m1")).toEqual(report);
  });

  it("getMigrationReport throws on error", async () => {
    mockGetMigrationReport.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.getMigrationReport("m1")).rejects.toBe("fail");
  });

  it("runAssessment returns job", async () => {
    const job = { id: "m1" };
    mockRunAssessment.mockResolvedValue({ data: job, error: undefined });
    const { migrationApi } = await import("../migration");
    expect(await migrationApi.runAssessment("m1")).toEqual(job);
  });

  it("runAssessment throws on error", async () => {
    mockRunAssessment.mockResolvedValue({ data: undefined, error: "fail" });
    const { migrationApi } = await import("../migration");
    await expect(migrationApi.runAssessment("m1")).rejects.toBe("fail");
  });

  it("getAssessment returns result", async () => {
    const result = { total: 100 };
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
});
