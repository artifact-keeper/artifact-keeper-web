import '@/lib/sdk-client';
import {
  setupTotp as sdkSetupTotp,
  enableTotp as sdkEnableTotp,
  verifyTotp as sdkVerifyTotp,
  disableTotp as sdkDisableTotp,
} from '@artifact-keeper/sdk';

export interface TotpSetupResponse {
  secret: string;
  qr_code_url: string;
}

export interface TotpEnableResponse {
  backup_codes: string[];
}

export const totpApi = {
  setup: async (): Promise<TotpSetupResponse> => {
    const { data, error } = await sdkSetupTotp();
    if (error) throw error;
    return data as unknown as TotpSetupResponse;
  },

  enable: async (code: string): Promise<TotpEnableResponse> => {
    const { data, error } = await sdkEnableTotp({ body: { code } as never });
    if (error) throw error;
    return data as unknown as TotpEnableResponse;
  },

  verify: async (totpToken: string, code: string): Promise<unknown> => {
    const { data, error } = await sdkVerifyTotp({ body: { totp_token: totpToken, code } as never });
    if (error) throw error;
    return data;
  },

  disable: async (password: string, code: string): Promise<void> => {
    const { error } = await sdkDisableTotp({ body: { password, code } as never });
    if (error) throw error;
  },
};
