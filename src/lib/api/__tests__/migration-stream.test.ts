// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockCreateDownloadTicket = vi.fn();
vi.mock("@artifact-keeper/sdk", () => ({
  listConnections: vi.fn(),
  createConnection: vi.fn(),
  getConnection: vi.fn(),
  deleteConnection: vi.fn(),
  testConnection: vi.fn(),
  listSourceRepositories: vi.fn(),
  listMigrations: vi.fn(),
  createMigration: vi.fn(),
  getMigration: vi.fn(),
  deleteMigration: vi.fn(),
  startMigration: vi.fn(),
  pauseMigration: vi.fn(),
  resumeMigration: vi.fn(),
  cancelMigration: vi.fn(),
  listMigrationItems: vi.fn(),
  getMigrationReport: vi.fn(),
  runAssessment: vi.fn(),
  getAssessment: vi.fn(),
  createDownloadTicket: (...args: unknown[]) => mockCreateDownloadTicket(...args),
}));

// jsdom does not provide EventSource; stub it so we can observe the URL it
// is constructed with.
class FakeEventSource {
  url: string;
  constructor(url: string) {
    this.url = url;
  }
  close() {}
}

describe("migrationApi.createProgressStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource =
      FakeEventSource;
  });

  it("appends the stream ticket as a query param", async () => {
    mockCreateDownloadTicket.mockResolvedValue({ data: { ticket: "tk-abc" }, error: undefined });
    const { migrationApi } = await import("../migration");
    const es = (await migrationApi.createProgressStream("m1")) as unknown as FakeEventSource;
    expect(es.url).toContain("/api/v1/migrations/m1/stream");
    expect(es.url).toContain("ticket=tk-abc");
  });

  it("falls back to a ticketless stream when ticket creation fails", async () => {
    mockCreateDownloadTicket.mockResolvedValue({ data: undefined, error: "boom" });
    const { migrationApi } = await import("../migration");
    const es = (await migrationApi.createProgressStream("m2")) as unknown as FakeEventSource;
    expect(es.url).toContain("/api/v1/migrations/m2/stream");
    expect(es.url).not.toContain("ticket=");
  });
});
