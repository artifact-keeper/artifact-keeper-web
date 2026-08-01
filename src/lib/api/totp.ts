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
import { unwrap } from '@/lib/sdk-utils';

// Local aliases for SDK response types — shapes match exactly.
export type TotpSetupResponse = SdkTotpSetupResponse;
export type TotpEnableResponse = SdkTotpEnableResponse;

export const totpApi = {
  setup: async (): Promise<TotpSetupResponse> => {
    const data = await unwrap(sdkSetupTotp());
    return assertData(data, 'totp.setup');
  },

  enable: async (code: string): Promise<TotpEnableResponse> => {
    const data = await unwrap(sdkEnableTotp({ body: { code } }));
    return assertData(data, 'totp.enable');
  },

  verify: async (totpToken: string, code: string): Promise<unknown> => {
    const data = await unwrap(sdkVerifyTotp({ body: { totp_token: totpToken, code } }));
    return data;
  },

  disable: async (password: string, code: string): Promise<void> => {
    await unwrap(sdkDisableTotp({ body: { password, code } }));
  },
};
