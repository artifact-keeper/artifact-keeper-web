import "@/lib/sdk-client";
import { getSettings } from "@artifact-keeper/sdk";

export interface PasswordPolicy {
  min_length: number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_digit: boolean;
  require_special: boolean;
  history_count: number;
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
};

export default settingsApi;
