import '@/lib/sdk-client';
import { login as sdkLogin, logout as sdkLogout, refreshToken as sdkRefreshToken, getCurrentUser as sdkGetCurrentUser } from '@artifact-keeper/sdk';
import type { LoginRequest, RefreshTokenRequest } from '@artifact-keeper/sdk';
import type { LoginResponse, User } from '@/types';

export interface LoginCredentials {
  username: string;
  password: string;
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<LoginResponse> => {
    const body: LoginRequest = credentials;
    const { data, error } = await sdkLogin({ body });
    if (error) throw error;
    return data as unknown as LoginResponse;
  },

  logout: async (): Promise<void> => {
    const { error } = await sdkLogout();
    if (error) throw error;
  },

  refreshToken: async (): Promise<LoginResponse> => {
    const body: RefreshTokenRequest = {};
    const { data, error } = await sdkRefreshToken({ body });
    if (error) throw error;
    return data as unknown as LoginResponse;
  },

  getCurrentUser: async (): Promise<User> => {
    const { data, error } = await sdkGetCurrentUser();
    if (error) throw error;
    return data as unknown as User;
  },
};

export default authApi;
