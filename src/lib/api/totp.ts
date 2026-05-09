import '@/lib/sdk-client';
import {
  setupTotp as sdkSetupTotp,
  enableTotp as sdkEnableTotp,
  verifyTotp as sdkVerifyTotp,
  disableTotp as sdkDisableTotp,
} from '@artifact-keeper/sdk';
import type {
  TotpSetupResponse as SdkTotpSetupResponse,
  TotpEnableResponse as SdkTotpEnableResponse,
} from '@artifact-keeper/sdk';
import { assertData } from '@/lib/api/fetch';

// Local aliases for SDK response types — shapes match exactly.
export type TotpSetupResponse = SdkTotpSetupResponse;
export type TotpEnableResponse = SdkTotpEnableResponse;

export const totpApi = {
  setup: async (): Promise<TotpSetupResponse> => {
    const { data, error } = await sdkSetupTotp();
    if (error) throw error;
    return assertData(data, 'totp.setup');
  },

  enable: async (code: string): Promise<TotpEnableResponse> => {
    const { data, error } = await sdkEnableTotp({ body: { code } });
    if (error) throw error;
    return assertData(data, 'totp.enable');
  },

  verify: async (totpToken: string, code: string): Promise<unknown> => {
    const { data, error } = await sdkVerifyTotp({ body: { totp_token: totpToken, code } });
    if (error) throw error;
    return data;
  },

  disable: async (password: string, code: string): Promise<void> => {
    const { error } = await sdkDisableTotp({ body: { password, code } });
    if (error) throw error;
  },
};
