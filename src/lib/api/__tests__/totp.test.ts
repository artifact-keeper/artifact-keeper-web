import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockSetupTotp = vi.fn();
const mockEnableTotp = vi.fn();
const mockVerifyTotp = vi.fn();
const mockDisableTotp = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  setupTotp: (...args: unknown[]) => mockSetupTotp(...args),
  enableTotp: (...args: unknown[]) => mockEnableTotp(...args),
  verifyTotp: (...args: unknown[]) => mockVerifyTotp(...args),
  disableTotp: (...args: unknown[]) => mockDisableTotp(...args),
}));

describe("totpApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("setup returns secret and QR code URL", async () => {
    const data = { secret: "abc123", qr_code_url: "otpauth://totp/..." };
    mockSetupTotp.mockResolvedValue({ data, error: undefined });
    const { totpApi } = await import("../totp");
    expect(await totpApi.setup()).toEqual(data);
  });

  it("setup throws on error", async () => {
    mockSetupTotp.mockResolvedValue({ data: undefined, error: "fail" });
    const { totpApi } = await import("../totp");
    await expect(totpApi.setup()).rejects.toBe("fail");
  });

  it("enable returns backup codes", async () => {
    const data = { backup_codes: ["code1", "code2"] };
    mockEnableTotp.mockResolvedValue({ data, error: undefined });
    const { totpApi } = await import("../totp");
    expect(await totpApi.enable("123456")).toEqual(data);
  });

  it("enable throws on error", async () => {
    mockEnableTotp.mockResolvedValue({ data: undefined, error: "invalid code" });
    const { totpApi } = await import("../totp");
    await expect(totpApi.enable("000000")).rejects.toBe("invalid code");
  });

  it("verify returns data", async () => {
    const data = { verified: true };
    mockVerifyTotp.mockResolvedValue({ data, error: undefined });
    const { totpApi } = await import("../totp");
    expect(await totpApi.verify("token", "123456")).toEqual(data);
  });

  it("verify throws on error", async () => {
    mockVerifyTotp.mockResolvedValue({ data: undefined, error: "fail" });
    const { totpApi } = await import("../totp");
    await expect(totpApi.verify("token", "000")).rejects.toBe("fail");
  });

  it("disable calls SDK with password and code", async () => {
    mockDisableTotp.mockResolvedValue({ error: undefined });
    const { totpApi } = await import("../totp");
    await totpApi.disable("mypass", "123456");
    expect(mockDisableTotp).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { password: "mypass", code: "123456" },
      })
    );
  });

  it("disable throws on error", async () => {
    mockDisableTotp.mockResolvedValue({ error: "wrong password" });
    const { totpApi } = await import("../totp");
    await expect(totpApi.disable("bad", "000")).rejects.toBe("wrong password");
  });
});
