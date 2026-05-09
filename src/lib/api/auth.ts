import '@/lib/sdk-client';
import { login as sdkLogin, logout as sdkLogout, refreshToken as sdkRefreshToken, getCurrentUser as sdkGetCurrentUser } from '@artifact-keeper/sdk';
import type {
  LoginRequest,
  RefreshTokenRequest,
  LoginResponse as SdkLoginResponse,
  UserResponse as SdkUserResponse,
} from '@artifact-keeper/sdk';
import type { LoginResponse, User } from '@/types';
import { assertData } from '@/lib/api/fetch';

export interface LoginCredentials {
  username: string;
  password: string;
}

// SDK uses `T | null | undefined` for optional fields; the app's hand-rolled
// types use `T | undefined`. Normalize null → undefined at the API boundary.
function adaptLoginResponse(sdk: SdkLoginResponse): LoginResponse {
  return {
    access_token: sdk.access_token,
    refresh_token: sdk.refresh_token,
    expires_in: sdk.expires_in,
    token_type: sdk.token_type,
    must_change_password: sdk.must_change_password,
    totp_required: sdk.totp_required ?? undefined,
    totp_token: sdk.totp_token ?? undefined,
  };
}

function adaptUser(sdk: SdkUserResponse): User {
  return {
    id: sdk.id,
    username: sdk.username,
    email: sdk.email,
    display_name: sdk.display_name ?? undefined,
    is_admin: sdk.is_admin,
    totp_enabled: sdk.totp_enabled,
  };
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<LoginResponse> => {
    const body: LoginRequest = credentials;
    const { data, error } = await sdkLogin({ body });
    if (error) throw error;
    return adaptLoginResponse(assertData(data, 'login'));
  },

  logout: async (): Promise<void> => {
    const { error } = await sdkLogout();
    if (error) throw error;
  },

  refreshToken: async (): Promise<LoginResponse> => {
    const body: RefreshTokenRequest = {};
    const { data, error } = await sdkRefreshToken({ body });
    if (error) throw error;
    return adaptLoginResponse(assertData(data, 'refreshToken'));
  },

  getCurrentUser: async (): Promise<User> => {
    const { data, error } = await sdkGetCurrentUser();
    if (error) throw error;
    return adaptUser(assertData(data, 'getCurrentUser'));
  },
};

export default authApi;
