import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockGetSettings = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
}));

const mockApiFetch = vi.fn();

vi.mock("@/lib/api/fetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  // Re-implement assertData rather than importing the real module so the
  // mock stays self-contained.
  assertData: <T,>(data: T | undefined, context: string): T => {
    if (data === undefined || data === null) {
      throw new Error(`Empty response body for ${context}`);
    }
    return data;
  },
}));

describe("settingsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // Password policy tests (existing)
  // -------------------------------------------------------------------------

  it("getPasswordPolicy returns defaults when server has no policy fields", async () => {
    mockGetSettings.mockResolvedValue({
      data: { storage_backend: "fs", storage_path: "/data" },
      error: undefined,
    });
    const mod = await import("../settings");
    const policy = await mod.settingsApi.getPasswordPolicy();
    expect(policy).toEqual(mod.settingsApi.DEFAULT_PASSWORD_POLICY);
  });

  it("getPasswordPolicy extracts nested password_policy object", async () => {
    mockGetSettings.mockResolvedValue({
      data: {
        password_policy: {
          min_length: 12,
          require_uppercase: false,
          require_lowercase: true,
          require_digit: true,
          require_special: true,
          history_count: 10,
        },
      },
      error: undefined,
    });
    const mod = await import("../settings");
    const policy = await mod.settingsApi.getPasswordPolicy();
    expect(policy.min_length).toBe(12);
    expect(policy.require_uppercase).toBe(false);
    expect(policy.require_special).toBe(true);
    expect(policy.history_count).toBe(10);
  });

  it("getPasswordPolicy reads flat password_min_length field", async () => {
    mockGetSettings.mockResolvedValue({
      data: { password_min_length: 16 },
      error: undefined,
    });
    const mod = await import("../settings");
    const policy = await mod.settingsApi.getPasswordPolicy();
    expect(policy.min_length).toBe(16);
  });

  it("getPasswordPolicy reads flat password_history_count field", async () => {
    mockGetSettings.mockResolvedValue({
      data: { password_history_count: 3 },
      error: undefined,
    });
    const mod = await import("../settings");
    const policy = await mod.settingsApi.getPasswordPolicy();
    expect(policy.history_count).toBe(3);
  });

  it("getPasswordPolicy returns defaults on SDK error", async () => {
    mockGetSettings.mockResolvedValue({
      data: undefined,
      error: "unauthorized",
    });
    const mod = await import("../settings");
    const policy = await mod.settingsApi.getPasswordPolicy();
    expect(policy).toEqual(mod.settingsApi.DEFAULT_PASSWORD_POLICY);
  });

  it("getPasswordPolicy returns defaults when SDK throws", async () => {
    mockGetSettings.mockRejectedValue(new Error("network error"));
    const mod = await import("../settings");
    const policy = await mod.settingsApi.getPasswordPolicy();
    expect(policy).toEqual(mod.settingsApi.DEFAULT_PASSWORD_POLICY);
  });

  it("nested password_policy takes precedence over flat fields", async () => {
    mockGetSettings.mockResolvedValue({
      data: {
        password_min_length: 6,
        password_policy: { min_length: 20 },
      },
      error: undefined,
    });
    const mod = await import("../settings");
    const policy = await mod.settingsApi.getPasswordPolicy();
    expect(policy.min_length).toBe(20);
  });

  // -------------------------------------------------------------------------
  // SMTP config tests
  // -------------------------------------------------------------------------

  it("getSmtpConfig returns defaults when server has no SMTP fields", async () => {
    mockGetSettings.mockResolvedValue({
      data: { storage_backend: "fs" },
      error: undefined,
    });
    const mod = await import("../settings");
    const config = await mod.settingsApi.getSmtpConfig();
    expect(config).toEqual(mod.DEFAULT_SMTP_CONFIG);
  });

  it("getSmtpConfig extracts nested smtp_config object", async () => {
    mockGetSettings.mockResolvedValue({
      data: {
        smtp_config: {
          host: "mail.example.com",
          port: 465,
          username: "user",
          password: "pass",
          from_address: "noreply@example.com",
          tls_mode: "tls",
        },
      },
      error: undefined,
    });
    const mod = await import("../settings");
    const config = await mod.settingsApi.getSmtpConfig();
    expect(config.host).toBe("mail.example.com");
    expect(config.port).toBe(465);
    expect(config.username).toBe("user");
    expect(config.password).toBe("pass");
    expect(config.from_address).toBe("noreply@example.com");
    expect(config.tls_mode).toBe("tls");
  });

  it("getSmtpConfig extracts nested smtp object (alternative key)", async () => {
    mockGetSettings.mockResolvedValue({
      data: {
        smtp: {
          host: "smtp.alt.com",
          port: 25,
          username: "alt-user",
          password: "",
          from_address: "alerts@alt.com",
          tls_mode: "none",
        },
      },
      error: undefined,
    });
    const mod = await import("../settings");
    const config = await mod.settingsApi.getSmtpConfig();
    expect(config.host).toBe("smtp.alt.com");
    expect(config.port).toBe(25);
    expect(config.tls_mode).toBe("none");
  });

  it("getSmtpConfig reads flat smtp_* fields", async () => {
    mockGetSettings.mockResolvedValue({
      data: {
        smtp_host: "flat.example.com",
        smtp_port: 587,
        smtp_username: "flat-user",
        smtp_from_address: "flat@example.com",
        smtp_tls_mode: "starttls",
      },
      error: undefined,
    });
    const mod = await import("../settings");
    const config = await mod.settingsApi.getSmtpConfig();
    expect(config.host).toBe("flat.example.com");
    expect(config.port).toBe(587);
    expect(config.username).toBe("flat-user");
    expect(config.from_address).toBe("flat@example.com");
    expect(config.tls_mode).toBe("starttls");
  });

  it("getSmtpConfig prefers smtp_config over flat fields", async () => {
    mockGetSettings.mockResolvedValue({
      data: {
        smtp_host: "flat.example.com",
        smtp_config: { host: "nested.example.com" },
      },
      error: undefined,
    });
    const mod = await import("../settings");
    const config = await mod.settingsApi.getSmtpConfig();
    expect(config.host).toBe("nested.example.com");
  });

  it("getSmtpConfig returns defaults on SDK error", async () => {
    mockGetSettings.mockResolvedValue({
      data: undefined,
      error: "unauthorized",
    });
    const mod = await import("../settings");
    const config = await mod.settingsApi.getSmtpConfig();
    expect(config).toEqual(mod.DEFAULT_SMTP_CONFIG);
  });

  it("getSmtpConfig returns defaults when SDK throws", async () => {
    mockGetSettings.mockRejectedValue(new Error("network error"));
    const mod = await import("../settings");
    const config = await mod.settingsApi.getSmtpConfig();
    expect(config).toEqual(mod.DEFAULT_SMTP_CONFIG);
  });

  it("getSmtpConfig uses default tls_mode for invalid values", async () => {
    mockGetSettings.mockResolvedValue({
      data: {
        smtp_config: {
          host: "mail.example.com",
          tls_mode: "invalid",
        },
      },
      error: undefined,
    });
    const mod = await import("../settings");
    const config = await mod.settingsApi.getSmtpConfig();
    expect(config.tls_mode).toBe("starttls");
  });

  it("getSmtpConfig uses default tls_mode for flat invalid values", async () => {
    mockGetSettings.mockResolvedValue({
      data: {
        smtp_tls_mode: "bogus",
      },
      error: undefined,
    });
    const mod = await import("../settings");
    const config = await mod.settingsApi.getSmtpConfig();
    expect(config.tls_mode).toBe("starttls");
  });

  // -------------------------------------------------------------------------
  // Storage settings tests
  // -------------------------------------------------------------------------

  it("getStorageSettings extracts storage_backend, storage_path, and max_upload_size_bytes", async () => {
    mockGetSettings.mockResolvedValue({
      data: {
        storage_backend: "s3",
        storage_path: "/data/storage",
        max_upload_size_bytes: 1_073_741_824,
      },
      error: undefined,
    });
    const mod = await import("../settings");
    const settings = await mod.settingsApi.getStorageSettings();
    expect(settings.storage_backend).toBe("s3");
    expect(settings.storage_path).toBe("/data/storage");
    expect(settings.max_upload_size_bytes).toBe(1_073_741_824);
  });

  it("getStorageSettings throws when fields are missing", async () => {
    mockGetSettings.mockResolvedValue({
      data: { unrelated: "value" },
      error: undefined,
    });
    const mod = await import("../settings");
    await expect(mod.settingsApi.getStorageSettings()).rejects.toThrow(
      /missing/i
    );
  });

  it("getStorageSettings throws on fields with wrong types", async () => {
    mockGetSettings.mockResolvedValue({
      data: {
        storage_backend: 123,
        storage_path: ["/wrong"],
        max_upload_size_bytes: "not-a-number",
      },
      error: undefined,
    });
    const mod = await import("../settings");
    await expect(mod.settingsApi.getStorageSettings()).rejects.toThrow(
      /missing/i
    );
  });

  it("getStorageSettings throws on SDK error", async () => {
    mockGetSettings.mockResolvedValue({
      data: undefined,
      error: "unauthorized",
    });
    const mod = await import("../settings");
    await expect(mod.settingsApi.getStorageSettings()).rejects.toThrow(
      /Failed to load storage settings/
    );
  });

  it("getStorageSettings propagates SDK rejection", async () => {
    mockGetSettings.mockRejectedValue(new Error("network error"));
    const mod = await import("../settings");
    await expect(mod.settingsApi.getStorageSettings()).rejects.toThrow(
      "network error"
    );
  });

  // -------------------------------------------------------------------------
  // updateSmtpConfig tests
  // -------------------------------------------------------------------------

  it("updateSmtpConfig calls PUT /api/v1/admin/smtp", async () => {
    mockApiFetch.mockResolvedValue(undefined);
    const mod = await import("../settings");
    const config = {
      host: "smtp.test.com",
      port: 587,
      username: "user",
      password: "pass",
      from_address: "test@test.com",
      tls_mode: "starttls" as const,
    };
    await mod.settingsApi.updateSmtpConfig(config);
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/admin/smtp", {
      method: "PUT",
      body: JSON.stringify(config),
    });
  });

  it("updateSmtpConfig propagates errors", async () => {
    mockApiFetch.mockRejectedValue(new Error("API error 500: server error"));
    const mod = await import("../settings");
    await expect(
      mod.settingsApi.updateSmtpConfig({
        host: "smtp.test.com",
        port: 587,
        username: "",
        password: "",
        from_address: "test@test.com",
        tls_mode: "starttls",
      })
    ).rejects.toThrow("API error 500");
  });

  // -------------------------------------------------------------------------
  // sendTestEmail tests
  // -------------------------------------------------------------------------

  it("sendTestEmail calls POST /api/v1/admin/smtp/test", async () => {
    const response = { success: true, message: "Email sent" };
    mockApiFetch.mockResolvedValue(response);
    const mod = await import("../settings");
    const result = await mod.settingsApi.sendTestEmail("admin@test.com");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/v1/admin/smtp/test", {
      method: "POST",
      body: JSON.stringify({ recipient: "admin@test.com" }),
    });
    expect(result).toEqual(response);
  });

  it("sendTestEmail propagates errors", async () => {
    mockApiFetch.mockRejectedValue(new Error("API error 502: bad gateway"));
    const mod = await import("../settings");
    await expect(
      mod.settingsApi.sendTestEmail("admin@test.com")
    ).rejects.toThrow("API error 502");
  });
});
