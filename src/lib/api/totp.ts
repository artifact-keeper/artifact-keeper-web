import apiClient from "@/lib/api-client";

export interface TotpSetupResponse {
  secret: string;
  qr_code_url: string;
}

export interface TotpEnableResponse {
  backup_codes: string[];
}

export const totpApi = {
  setup: () =>
    apiClient.post<TotpSetupResponse>("/api/v1/auth/totp/setup").then((r) => r.data),

  enable: (code: string) =>
    apiClient.post<TotpEnableResponse>("/api/v1/auth/totp/enable", { code }).then((r) => r.data),

  verify: (totpToken: string, code: string) =>
    apiClient.post("/api/v1/auth/totp/verify", { totp_token: totpToken, code }).then((r) => r.data),

  disable: (password: string, code: string) =>
    apiClient.post("/api/v1/auth/totp/disable", { password, code }).then((r) => r.data),
};
