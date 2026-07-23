import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../fetch", () => ({ assertData: <T,>(d: T) => d }));
vi.mock("@/lib/sdk-client", () => ({}));

const m = {
  listFormatHandlers: vi.fn(),
  getFormatHandler: vi.fn(),
  enableFormatHandler: vi.fn(),
  disableFormatHandler: vi.fn(),
  testFormatHandler: vi.fn(),
};
vi.mock("@artifact-keeper/sdk", () => ({
  listFormatHandlers: (...a: unknown[]) => m.listFormatHandlers(...a),
  getFormatHandler: (...a: unknown[]) => m.getFormatHandler(...a),
  enableFormatHandler: (...a: unknown[]) => m.enableFormatHandler(...a),
  disableFormatHandler: (...a: unknown[]) => m.disableFormatHandler(...a),
  testFormatHandler: (...a: unknown[]) => m.testFormatHandler(...a),
}));

import formatHandlersApi from "../format-handlers";

const SDK = {
  id: "h1",
  format_key: "pypi",
  display_name: "PyPI",
  description: null,
  extensions: [".whl", ".tar.gz"],
  handler_type: "Core",
  is_enabled: true,
  priority: 10,
  plugin_id: null,
  capabilities: null,
  created_at: "x",
};

beforeEach(() => vi.clearAllMocks());

describe("formatHandlersApi", () => {
  it("list maps FormatHandlerResponse[]", async () => {
    m.listFormatHandlers.mockResolvedValue({ data: [SDK], error: undefined });
    const out = await formatHandlersApi.list();
    expect(out[0]).toMatchObject({ format_key: "pypi", handler_type: "Core", extensions: [".whl", ".tar.gz"], description: null });
  });

  it("list throws on error", async () => {
    m.listFormatHandlers.mockResolvedValue({ data: undefined, error: { status: 500 } });
    await expect(formatHandlersApi.list()).rejects.toEqual({ status: 500 });
  });

  it("setEnabled(true) calls enable; setEnabled(false) calls disable", async () => {
    m.enableFormatHandler.mockResolvedValue({ data: { ...SDK, is_enabled: true }, error: undefined });
    m.disableFormatHandler.mockResolvedValue({ data: { ...SDK, is_enabled: false }, error: undefined });
    await formatHandlersApi.setEnabled("pypi", true);
    await formatHandlersApi.setEnabled("pypi", false);
    expect(m.enableFormatHandler).toHaveBeenCalledWith({ path: { format_key: "pypi" } });
    expect(m.disableFormatHandler).toHaveBeenCalledWith({ path: { format_key: "pypi" } });
    expect(m.enableFormatHandler).toHaveBeenCalledTimes(1);
    expect(m.disableFormatHandler).toHaveBeenCalledTimes(1);
  });

  it("setEnabled throws on error", async () => {
    m.enableFormatHandler.mockResolvedValue({ data: undefined, error: { status: 403 } });
    await expect(formatHandlersApi.setEnabled("pypi", true)).rejects.toEqual({ status: 403 });
  });

  it("get passes format_key", async () => {
    m.getFormatHandler.mockResolvedValue({ data: SDK, error: undefined });
    await formatHandlersApi.get("pypi");
    expect(m.getFormatHandler).toHaveBeenCalledWith({ path: { format_key: "pypi" } });
  });

  it("test sends path+content+base64 and maps the result", async () => {
    m.testFormatHandler.mockResolvedValue({ data: { valid: false, parse_error: "bad header" }, error: undefined });
    const res = await formatHandlersApi.test("pypi", { path: "a.whl", content: "xyz" });
    expect(m.testFormatHandler).toHaveBeenCalledWith({ path: { format_key: "pypi" }, body: { path: "a.whl", content: "xyz", base64: false } });
    expect(res).toEqual({ valid: false, parse_error: "bad header" });
  });

  it("test maps a valid result (null parse_error)", async () => {
    m.testFormatHandler.mockResolvedValue({ data: { valid: true }, error: undefined });
    const res = await formatHandlersApi.test("pypi", { path: "a.whl", content: "xyz", base64: true });
    expect(res).toEqual({ valid: true, parse_error: null });
  });
});
