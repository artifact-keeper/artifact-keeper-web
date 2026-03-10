import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockListWebhooks = vi.fn();
const mockGetWebhook = vi.fn();
const mockCreateWebhook = vi.fn();
const mockDeleteWebhook = vi.fn();
const mockEnableWebhook = vi.fn();
const mockDisableWebhook = vi.fn();
const mockTestWebhook = vi.fn();
const mockListDeliveries = vi.fn();
const mockRedeliver = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  listWebhooks: (...args: unknown[]) => mockListWebhooks(...args),
  getWebhook: (...args: unknown[]) => mockGetWebhook(...args),
  createWebhook: (...args: unknown[]) => mockCreateWebhook(...args),
  deleteWebhook: (...args: unknown[]) => mockDeleteWebhook(...args),
  enableWebhook: (...args: unknown[]) => mockEnableWebhook(...args),
  disableWebhook: (...args: unknown[]) => mockDisableWebhook(...args),
  testWebhook: (...args: unknown[]) => mockTestWebhook(...args),
  listDeliveries: (...args: unknown[]) => mockListDeliveries(...args),
  redeliver: (...args: unknown[]) => mockRedeliver(...args),
}));

describe("webhooksApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("list returns webhooks", async () => {
    const data = { items: [{ id: "w1" }], total: 1 };
    mockListWebhooks.mockResolvedValue({ data, error: undefined });
    const { webhooksApi } = await import("../webhooks");
    expect(await webhooksApi.list()).toEqual(data);
  });

  it("list throws on error", async () => {
    mockListWebhooks.mockResolvedValue({ data: undefined, error: "fail" });
    const { webhooksApi } = await import("../webhooks");
    await expect(webhooksApi.list()).rejects.toBe("fail");
  });

  it("get returns a webhook", async () => {
    const wh = { id: "w1", name: "deploy" };
    mockGetWebhook.mockResolvedValue({ data: wh, error: undefined });
    const { webhooksApi } = await import("../webhooks");
    expect(await webhooksApi.get("w1")).toEqual(wh);
  });

  it("get throws on error", async () => {
    mockGetWebhook.mockResolvedValue({ data: undefined, error: "not found" });
    const { webhooksApi } = await import("../webhooks");
    await expect(webhooksApi.get("w1")).rejects.toBe("not found");
  });

  it("create returns created webhook", async () => {
    const wh = { id: "w2", name: "notify" };
    mockCreateWebhook.mockResolvedValue({ data: wh, error: undefined });
    const { webhooksApi } = await import("../webhooks");
    expect(
      await webhooksApi.create({ name: "notify", url: "https://example.com", events: ["artifact_uploaded"] })
    ).toEqual(wh);
  });

  it("create throws on error", async () => {
    mockCreateWebhook.mockResolvedValue({ data: undefined, error: "fail" });
    const { webhooksApi } = await import("../webhooks");
    await expect(
      webhooksApi.create({ name: "x", url: "http://x", events: [] })
    ).rejects.toBe("fail");
  });

  it("delete calls SDK", async () => {
    mockDeleteWebhook.mockResolvedValue({ error: undefined });
    const { webhooksApi } = await import("../webhooks");
    await webhooksApi.delete("w1");
    expect(mockDeleteWebhook).toHaveBeenCalled();
  });

  it("delete throws on error", async () => {
    mockDeleteWebhook.mockResolvedValue({ error: "fail" });
    const { webhooksApi } = await import("../webhooks");
    await expect(webhooksApi.delete("w1")).rejects.toBe("fail");
  });

  it("enable calls SDK", async () => {
    mockEnableWebhook.mockResolvedValue({ error: undefined });
    const { webhooksApi } = await import("../webhooks");
    await webhooksApi.enable("w1");
    expect(mockEnableWebhook).toHaveBeenCalled();
  });

  it("enable throws on error", async () => {
    mockEnableWebhook.mockResolvedValue({ error: "fail" });
    const { webhooksApi } = await import("../webhooks");
    await expect(webhooksApi.enable("w1")).rejects.toBe("fail");
  });

  it("disable calls SDK", async () => {
    mockDisableWebhook.mockResolvedValue({ error: undefined });
    const { webhooksApi } = await import("../webhooks");
    await webhooksApi.disable("w1");
    expect(mockDisableWebhook).toHaveBeenCalled();
  });

  it("disable throws on error", async () => {
    mockDisableWebhook.mockResolvedValue({ error: "fail" });
    const { webhooksApi } = await import("../webhooks");
    await expect(webhooksApi.disable("w1")).rejects.toBe("fail");
  });

  it("test returns test result", async () => {
    const result = { success: true, status_code: 200 };
    mockTestWebhook.mockResolvedValue({ data: result, error: undefined });
    const { webhooksApi } = await import("../webhooks");
    expect(await webhooksApi.test("w1")).toEqual(result);
  });

  it("test throws on error", async () => {
    mockTestWebhook.mockResolvedValue({ data: undefined, error: "timeout" });
    const { webhooksApi } = await import("../webhooks");
    await expect(webhooksApi.test("w1")).rejects.toBe("timeout");
  });

  it("listDeliveries returns deliveries", async () => {
    const data = { items: [{ id: "d1" }], total: 1 };
    mockListDeliveries.mockResolvedValue({ data, error: undefined });
    const { webhooksApi } = await import("../webhooks");
    expect(await webhooksApi.listDeliveries("w1")).toEqual(data);
  });

  it("listDeliveries throws on error", async () => {
    mockListDeliveries.mockResolvedValue({ data: undefined, error: "fail" });
    const { webhooksApi } = await import("../webhooks");
    await expect(webhooksApi.listDeliveries("w1")).rejects.toBe("fail");
  });

  it("redeliver returns delivery", async () => {
    const delivery = { id: "d1", success: true };
    mockRedeliver.mockResolvedValue({ data: delivery, error: undefined });
    const { webhooksApi } = await import("../webhooks");
    expect(await webhooksApi.redeliver("w1", "d1")).toEqual(delivery);
  });

  it("redeliver throws on error", async () => {
    mockRedeliver.mockResolvedValue({ data: undefined, error: "fail" });
    const { webhooksApi } = await import("../webhooks");
    await expect(webhooksApi.redeliver("w1", "d1")).rejects.toBe("fail");
  });
});
