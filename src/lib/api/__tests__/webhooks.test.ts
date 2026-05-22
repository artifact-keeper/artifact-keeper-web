import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  WebhookResponse as SdkWebhookResponse,
  DeliveryResponse as SdkDeliveryResponse,
  TestWebhookResponse as SdkTestWebhookResponse,
} from "@artifact-keeper/sdk";

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

// Realistic SDK fixtures, typed as the SDK shape so a generator schema
// drift breaks the fixture at typecheck rather than silently shipping
// stale shape coverage (#359).
const SDK_WEBHOOK: SdkWebhookResponse = {
  id: "w1",
  name: "deploy",
  url: "https://example.com",
  events: ["artifact_uploaded"],
  is_enabled: true,
  repository_id: "repo-a",
  headers: { Authorization: "Bearer xyz" },
  last_triggered_at: "2026-05-01T00:00:00Z",
  created_at: "2026-04-01T00:00:00Z",
};

const SDK_DELIVERY: SdkDeliveryResponse = {
  id: "d1",
  webhook_id: "w1",
  event: "artifact_uploaded",
  payload: { foo: "bar" },
  response_status: 200,
  response_body: "OK",
  success: true,
  attempts: 1,
  delivered_at: "2026-05-01T00:00:00Z",
  created_at: "2026-04-01T00:00:00Z",
};

const SDK_TEST_RESULT: SdkTestWebhookResponse = {
  success: true,
  status_code: 200,
  response_body: "OK",
  error: null,
};

describe("webhooksApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("list returns webhooks", async () => {
    mockListWebhooks.mockResolvedValue({
      data: { items: [SDK_WEBHOOK], total: 1 },
      error: undefined,
    });
    const { webhooksApi } = await import("../webhooks");
    const out = await webhooksApi.list();
    expect(out.total).toBe(1);
    expect(out.items[0].id).toBe("w1");
    expect(out.items[0].events).toEqual(["artifact_uploaded"]);
  });

  it("list normalizes optional+nullable fields (#359)", async () => {
    mockListWebhooks.mockResolvedValue({
      data: {
        items: [
          {
            ...SDK_WEBHOOK,
            repository_id: null,
            headers: null,
            last_triggered_at: null,
          },
        ],
        total: 1,
      },
      error: undefined,
    });
    const { webhooksApi } = await import("../webhooks");
    const out = await webhooksApi.list();
    expect(out.items[0].repository_id).toBeUndefined();
    expect(out.items[0].headers).toBeUndefined();
    expect(out.items[0].last_triggered_at).toBeUndefined();
  });

  it("list narrows unknown event values to fallback (#359)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockListWebhooks.mockResolvedValue({
      data: {
        items: [{ ...SDK_WEBHOOK, events: ["something_new"] }],
        total: 1,
      },
      error: undefined,
    });
    const { webhooksApi } = await import("../webhooks");
    const out = await webhooksApi.list();
    expect(out.items[0].events).toEqual(["artifact_uploaded"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("list throws on error", async () => {
    mockListWebhooks.mockResolvedValue({ data: undefined, error: "fail" });
    const { webhooksApi } = await import("../webhooks");
    await expect(webhooksApi.list()).rejects.toBe("fail");
  });

  it("get returns a webhook", async () => {
    mockGetWebhook.mockResolvedValue({ data: SDK_WEBHOOK, error: undefined });
    const { webhooksApi } = await import("../webhooks");
    const out = await webhooksApi.get("w1");
    expect(out.id).toBe("w1");
    expect(out.name).toBe("deploy");
  });

  it("get throws Empty response body when SDK returns no data (#359)", async () => {
    mockGetWebhook.mockResolvedValue({ data: undefined, error: undefined });
    const { webhooksApi } = await import("../webhooks");
    await expect(webhooksApi.get("w1")).rejects.toThrow(/Empty response body/);
  });

  it("get throws on error", async () => {
    mockGetWebhook.mockResolvedValue({ data: undefined, error: "not found" });
    const { webhooksApi } = await import("../webhooks");
    await expect(webhooksApi.get("w1")).rejects.toBe("not found");
  });

  it("create returns created webhook", async () => {
    mockCreateWebhook.mockResolvedValue({
      data: SDK_WEBHOOK,
      error: undefined,
    });
    const { webhooksApi } = await import("../webhooks");
    const out = await webhooksApi.create({
      name: "deploy",
      url: "https://example.com",
      events: ["artifact_uploaded"],
    });
    expect(out.id).toBe("w1");
  });

  it("create forwards local body shape and strips extras (#359)", async () => {
    mockCreateWebhook.mockResolvedValue({
      data: SDK_WEBHOOK,
      error: undefined,
    });
    const { webhooksApi } = await import("../webhooks");
    await webhooksApi.create({
      name: "deploy",
      url: "https://example.com",
      events: ["artifact_uploaded"],
      secret: "s3kr3t",
      repository_id: "repo-a",
      // @ts-expect-error — intentionally not in CreateWebhookRequest
      bogus_extra_field: "should be stripped by adapter",
    });
    expect(mockCreateWebhook).toHaveBeenCalledWith({
      body: {
        name: "deploy",
        url: "https://example.com",
        events: ["artifact_uploaded"],
        secret: "s3kr3t",
        repository_id: "repo-a",
        headers: undefined,
      },
    });
  });

  it("create throws on error", async () => {
    mockCreateWebhook.mockResolvedValue({ data: undefined, error: "fail" });
    const { webhooksApi } = await import("../webhooks");
    await expect(
      webhooksApi.create({ name: "x", url: "http://x", events: [] }),
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
    mockTestWebhook.mockResolvedValue({
      data: SDK_TEST_RESULT,
      error: undefined,
    });
    const { webhooksApi } = await import("../webhooks");
    const out = await webhooksApi.test("w1");
    expect(out.success).toBe(true);
    expect(out.status_code).toBe(200);
    expect(out.response_body).toBe("OK");
    expect(out.error).toBeUndefined();
  });

  it("test throws on error", async () => {
    mockTestWebhook.mockResolvedValue({ data: undefined, error: "timeout" });
    const { webhooksApi } = await import("../webhooks");
    await expect(webhooksApi.test("w1")).rejects.toBe("timeout");
  });

  it("listDeliveries returns deliveries", async () => {
    mockListDeliveries.mockResolvedValue({
      data: { items: [SDK_DELIVERY], total: 1 },
      error: undefined,
    });
    const { webhooksApi } = await import("../webhooks");
    const out = await webhooksApi.listDeliveries("w1");
    expect(out.total).toBe(1);
    expect(out.items[0].id).toBe("d1");
  });

  it("listDeliveries throws on error", async () => {
    mockListDeliveries.mockResolvedValue({ data: undefined, error: "fail" });
    const { webhooksApi } = await import("../webhooks");
    await expect(webhooksApi.listDeliveries("w1")).rejects.toBe("fail");
  });

  it("redeliver returns delivery", async () => {
    mockRedeliver.mockResolvedValue({ data: SDK_DELIVERY, error: undefined });
    const { webhooksApi } = await import("../webhooks");
    const out = await webhooksApi.redeliver("w1", "d1");
    expect(out.id).toBe("d1");
    expect(out.success).toBe(true);
  });

  it("redeliver throws on error", async () => {
    mockRedeliver.mockResolvedValue({ data: undefined, error: "fail" });
    const { webhooksApi } = await import("../webhooks");
    await expect(webhooksApi.redeliver("w1", "d1")).rejects.toBe("fail");
  });
});
