/* eslint-disable @typescript-eslint/no-explicit-any */
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
  setup: async () => {
    const { data, error } = await sdkSetupTotp();
    if (error) throw error;
    return data as any;
  },

  enable: async (code: string) => {
    const { data, error } = await sdkEnableTotp({ body: { code } as any });
    if (error) throw error;
    return data as any;
  },

  verify: async (totpToken: string, code: string) => {
    const { data, error } = await sdkVerifyTotp({ body: { totp_token: totpToken, code } as any });
    if (error) throw error;
    return data as any;
  },

  disable: async (password: string, code: string) => {
    const { data, error } = await sdkDisableTotp({ body: { password, code } as any });
    if (error) throw error;
    return data as any;
  },
};
