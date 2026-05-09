import "@/lib/sdk-client";
import { getSettings } from "@artifact-keeper/sdk";
import { z } from "zod";
import { apiFetch, assertData } from "@/lib/api/fetch";

export interface PasswordPolicy {
  min_length: number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_digit: boolean;
  require_special: boolean;
  history_count: number;
}

export type SmtpTlsMode = "none" | "starttls" | "tls";

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  from_address: string;
  tls_mode: SmtpTlsMode;
}

export interface SendTestEmailRequest {
  recipient: string;
}

export interface SendTestEmailResponse {
  success: boolean;
  message: string;
}

/**
 * Storage configuration surfaced on the admin Settings → Storage tab.
 *
 * `storage_backend` is one of "filesystem", "s3", "gcs", "azure" (the same
 * values the backend's STORAGE_BACKEND env var accepts). UI components are
 * responsible for translating to a friendly display label.
 *
 * `max_upload_size_bytes` is in bytes; UI components format for display.
 */
export interface StorageSettings {
  storage_backend: string;
  storage_path: string;
  max_upload_size_bytes: number;
}

/**
 * Default password policy used when the server doesn't expose policy
 * fields or the settings endpoint is unavailable. These match the
 * backend defaults defined in the Rust configuration.
 */
const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  min_length: 8,
  require_uppercase: true,
  require_lowercase: true,
  require_digit: true,
  require_special: false,
  history_count: 5,
};

// Zod schemas for the password-policy and SMTP fields the backend appends to
// the SystemSettings response but the SDK doesn't yet model. The settings
// endpoint is a real trust boundary (admin-supplied config that drives email
// + password rules) so runtime validation pays for itself here.
const PasswordPolicyExtSchema = z
  .object({
    password_policy: z
      .object({
        min_length: z.number().optional(),
        require_uppercase: z.boolean().optional(),
        require_lowercase: z.boolean().optional(),
        require_digit: z.boolean().optional(),
        require_special: z.boolean().optional(),
        history_count: z.number().optional(),
      })
      .optional(),
    password_min_length: z.number().optional(),
    password_history_count: z.number().optional(),
  })
  .passthrough();

// Shared shape for both `smtp_config` and `smtp` (the backend uses two
// different keys for the same payload depending on version). Defining it
// once avoids drift between the two branches when fields are added.
const SmtpFieldsSchema = z
  .object({
    host: z.string().optional(),
    port: z.number().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    from_address: z.string().optional(),
    tls_mode: z.string().optional(),
  })
  .optional();

const SmtpExtSchema = z
  .object({
    smtp_config: SmtpFieldsSchema,
    smtp: SmtpFieldsSchema,
    smtp_host: z.string().optional(),
    smtp_port: z.number().optional(),
    smtp_username: z.string().optional(),
    smtp_from_address: z.string().optional(),
    smtp_tls_mode: z.string().optional(),
  })
  .passthrough();

/**
 * Bundled response shape returned by `getAllSettings`. Each slice is parsed
 * by the same logic the per-getter API uses, just sharing one HTTP round
 * trip. See #349.
 */
export interface AdminSettings {
  passwordPolicy: PasswordPolicy;
  storageSettings: StorageSettings;
  smtpConfig: SmtpConfig;
}

// ---- Pure parsers (#349 — extracted so getAllSettings can reuse them) ----

function parseStorageSettings(data: unknown): StorageSettings {
  const settings = assertData(data, "settingsApi.getStorageSettings") as
    | Record<string, unknown>
    | null;
  // Backend has historically returned wrongly-shaped responses for this
  // endpoint (see issue #334), so guard at the trust boundary even though
  // the SDK types claim the shape is correct.
  if (
    !settings ||
    typeof settings.storage_backend !== "string" ||
    typeof settings.storage_path !== "string" ||
    typeof settings.max_upload_size_bytes !== "number"
  ) {
    throw new Error(
      "Storage settings response missing storage_backend, storage_path, or max_upload_size_bytes"
    );
  }
  return {
    storage_backend: settings.storage_backend,
    storage_path: settings.storage_path,
    max_upload_size_bytes: settings.max_upload_size_bytes,
  };
}

function parsePasswordPolicy(data: unknown): PasswordPolicy {
  const parsed = PasswordPolicyExtSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Failed to load password policy: response did not match expected shape`
    );
  }
  const ext = parsed.data;
  const serverPolicy = ext.password_policy ?? {};

  return {
    min_length:
      serverPolicy.min_length ??
      ext.password_min_length ??
      DEFAULT_PASSWORD_POLICY.min_length,
    require_uppercase:
      serverPolicy.require_uppercase ?? DEFAULT_PASSWORD_POLICY.require_uppercase,
    require_lowercase:
      serverPolicy.require_lowercase ?? DEFAULT_PASSWORD_POLICY.require_lowercase,
    require_digit:
      serverPolicy.require_digit ?? DEFAULT_PASSWORD_POLICY.require_digit,
    require_special:
      serverPolicy.require_special ?? DEFAULT_PASSWORD_POLICY.require_special,
    history_count:
      serverPolicy.history_count ??
      ext.password_history_count ??
      DEFAULT_PASSWORD_POLICY.history_count,
  };
}

function parseSmtpConfig(data: unknown): SmtpConfig {
  const parsed = SmtpExtSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `Failed to load SMTP config: response did not match expected shape`
    );
  }
  const ext = parsed.data;
  const serverSmtp = ext.smtp_config ?? ext.smtp ?? {};

  return {
    host: serverSmtp.host ?? ext.smtp_host ?? DEFAULT_SMTP_CONFIG.host,
    port: serverSmtp.port ?? ext.smtp_port ?? DEFAULT_SMTP_CONFIG.port,
    username:
      serverSmtp.username ?? ext.smtp_username ?? DEFAULT_SMTP_CONFIG.username,
    password: serverSmtp.password ?? DEFAULT_SMTP_CONFIG.password,
    from_address:
      serverSmtp.from_address ??
      ext.smtp_from_address ??
      DEFAULT_SMTP_CONFIG.from_address,
    tls_mode: isValidTlsMode(serverSmtp.tls_mode)
      ? serverSmtp.tls_mode
      : isValidTlsMode(ext.smtp_tls_mode)
        ? ext.smtp_tls_mode
        : DEFAULT_SMTP_CONFIG.tls_mode,
  };
}

export const settingsApi = {
  DEFAULT_PASSWORD_POLICY,

  /**
   * Fetch all admin settings slices (password policy, storage, SMTP) in a
   * single HTTP round trip. The admin Settings page used to call
   * `/api/v1/admin/settings` three times via separate useQuery hooks (one
   * per slice); this collapses to one. See #349.
   *
   * Throws on SDK error. Each slice's parser may also throw if its part
   * of the response is malformed.
   */
  getAllSettings: async (): Promise<AdminSettings> => {
    const { data, error } = await getSettings();
    if (error) {
      throw new Error(`Failed to load admin settings: ${String(error)}`);
    }
    return {
      passwordPolicy: parsePasswordPolicy(data),
      storageSettings: parseStorageSettings(data),
      smtpConfig: parseSmtpConfig(data),
    };
  },

  /**
   * Fetch storage configuration from system settings.
   *
   * Throws on SDK error or when the response is missing the required
   * fields (or has them as the wrong type). Callers are expected to
   * surface the error state to the UI — silently returning placeholder
   * defaults here would re-create the bug this endpoint was wired up
   * to fix (see issue #334).
   */
  getStorageSettings: async (): Promise<StorageSettings> => {
    const { data, error } = await getSettings();
    if (error) {
      throw new Error(`Failed to load storage settings: ${String(error)}`);
    }
    return parseStorageSettings(data);
  },

  /**
   * Fetch the password policy from system settings.
   *
   * Throws on SDK error or unparseable response. See #347 for why we
   * surface failures rather than silently returning defaults.
   */
  getPasswordPolicy: async (): Promise<PasswordPolicy> => {
    const { data, error } = await getSettings();
    if (error) {
      throw new Error(`Failed to load password policy: ${String(error)}`);
    }
    return parsePasswordPolicy(data);
  },

  /**
   * Fetch the SMTP configuration from system settings.
   *
   * Throws on SDK error or unparseable response. See #347 for why we
   * surface failures rather than silently returning defaults.
   */
  getSmtpConfig: async (): Promise<SmtpConfig> => {
    const { data, error } = await getSettings();
    if (error) {
      throw new Error(`Failed to load SMTP config: ${String(error)}`);
    }
    return parseSmtpConfig(data);
  },

  /**
   * Save SMTP configuration. Uses the /api/v1/admin/smtp endpoint which
   * is not yet in the generated SDK.
   */
  updateSmtpConfig: async (config: SmtpConfig): Promise<void> => {
    await apiFetch<void>("/api/v1/admin/smtp", {
      method: "PUT",
      body: JSON.stringify(config),
    });
  },

  /**
   * Send a test email through the configured SMTP server.
   */
  sendTestEmail: async (recipient: string): Promise<SendTestEmailResponse> => {
    return apiFetch<SendTestEmailResponse>("/api/v1/admin/smtp/test", {
      method: "POST",
      body: JSON.stringify({ recipient }),
    });
  },
};

function isValidTlsMode(value: unknown): value is SmtpTlsMode {
  return value === "none" || value === "starttls" || value === "tls";
}

const DEFAULT_SMTP_CONFIG: SmtpConfig = {
  host: "",
  port: 587,
  username: "",
  password: "",
  from_address: "",
  tls_mode: "starttls",
};

export { DEFAULT_SMTP_CONFIG };

export default settingsApi;
