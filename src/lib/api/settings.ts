import "@/lib/sdk-client";
import { getSettings } from "@artifact-keeper/sdk";
import { apiFetch } from "@/lib/api/fetch";

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

export const settingsApi = {
  DEFAULT_PASSWORD_POLICY,

  /**
   * Fetch the password policy from system settings.
   *
   * The /api/v1/admin/settings endpoint returns a SystemSettings object.
   * The backend may include password_policy fields in the response even
   * though the current SDK type definition doesn't declare them. We
   * extract those fields if present and merge with defaults.
   *
   * TODO: Once the backend exposes password_policy as a typed field in
   * the OpenAPI spec and the SDK regenerates, replace the `as unknown`
   * cast with proper typed access.
   */
  getPasswordPolicy: async (): Promise<PasswordPolicy> => {
    try {
      const { data, error } = await getSettings();
      if (error) return DEFAULT_PASSWORD_POLICY;

      // The backend may return password policy fields that aren't yet
      // typed in the SDK. Safely extract them from the raw response.
      const raw = data as unknown as Record<string, unknown>;
      const serverPolicy =
        (raw?.password_policy as Partial<PasswordPolicy>) ?? {};

      return {
        min_length:
          typeof serverPolicy.min_length === "number"
            ? serverPolicy.min_length
            : (typeof raw?.password_min_length === "number"
                ? raw.password_min_length
                : DEFAULT_PASSWORD_POLICY.min_length),
        require_uppercase:
          typeof serverPolicy.require_uppercase === "boolean"
            ? serverPolicy.require_uppercase
            : DEFAULT_PASSWORD_POLICY.require_uppercase,
        require_lowercase:
          typeof serverPolicy.require_lowercase === "boolean"
            ? serverPolicy.require_lowercase
            : DEFAULT_PASSWORD_POLICY.require_lowercase,
        require_digit:
          typeof serverPolicy.require_digit === "boolean"
            ? serverPolicy.require_digit
            : DEFAULT_PASSWORD_POLICY.require_digit,
        require_special:
          typeof serverPolicy.require_special === "boolean"
            ? serverPolicy.require_special
            : DEFAULT_PASSWORD_POLICY.require_special,
        history_count:
          typeof serverPolicy.history_count === "number"
            ? serverPolicy.history_count
            : (typeof raw?.password_history_count === "number"
                ? raw.password_history_count
                : DEFAULT_PASSWORD_POLICY.history_count),
      };
    } catch {
      return DEFAULT_PASSWORD_POLICY;
    }
  },

  /**
   * Fetch the SMTP configuration from system settings.
   *
   * The backend includes SMTP fields in the /api/v1/admin/settings response
   * but the SDK type definition does not yet declare them. We extract the
   * smtp_config object (or individual smtp_* fields) from the raw response
   * and merge with defaults.
   */
  getSmtpConfig: async (): Promise<SmtpConfig> => {
    try {
      const { data, error } = await getSettings();
      if (error) return DEFAULT_SMTP_CONFIG;

      const raw = data as unknown as Record<string, unknown>;
      const serverSmtp =
        (raw?.smtp_config as Partial<SmtpConfig>) ??
        (raw?.smtp as Partial<SmtpConfig>) ??
        {};

      return {
        host:
          typeof serverSmtp.host === "string"
            ? serverSmtp.host
            : (typeof raw?.smtp_host === "string"
                ? raw.smtp_host
                : DEFAULT_SMTP_CONFIG.host),
        port:
          typeof serverSmtp.port === "number"
            ? serverSmtp.port
            : (typeof raw?.smtp_port === "number"
                ? raw.smtp_port
                : DEFAULT_SMTP_CONFIG.port),
        username:
          typeof serverSmtp.username === "string"
            ? serverSmtp.username
            : (typeof raw?.smtp_username === "string"
                ? raw.smtp_username
                : DEFAULT_SMTP_CONFIG.username),
        password:
          typeof serverSmtp.password === "string"
            ? serverSmtp.password
            : DEFAULT_SMTP_CONFIG.password,
        from_address:
          typeof serverSmtp.from_address === "string"
            ? serverSmtp.from_address
            : (typeof raw?.smtp_from_address === "string"
                ? raw.smtp_from_address
                : DEFAULT_SMTP_CONFIG.from_address),
        tls_mode:
          isValidTlsMode(serverSmtp.tls_mode)
            ? serverSmtp.tls_mode
            : (isValidTlsMode(raw?.smtp_tls_mode)
                ? (raw.smtp_tls_mode as SmtpTlsMode)
                : DEFAULT_SMTP_CONFIG.tls_mode),
      };
    } catch {
      return DEFAULT_SMTP_CONFIG;
    }
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
