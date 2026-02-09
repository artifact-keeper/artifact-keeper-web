/* eslint-disable @typescript-eslint/no-explicit-any */
import '@/lib/sdk-client';
import { login as sdkLogin, logout as sdkLogout, refreshToken as sdkRefreshToken, getCurrentUser as sdkGetCurrentUser } from '@artifact-keeper/sdk';
import type { LoginResponse, User } from '@/types';

export interface LoginCredentials {
  username: string;
  password: string;
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<LoginResponse> => {
    const { data, error } = await sdkLogin({ body: credentials as any });
    if (error) throw error;
    return data as any as LoginResponse;
  },

  logout: async (): Promise<void> => {
    const { error } = await sdkLogout();
    if (error) throw error;
  },

  refreshToken: async (refreshToken: string): Promise<LoginResponse> => {
    const { data, error } = await sdkRefreshToken({
      body: { refresh_token: refreshToken } as any,
    });
    if (error) throw error;
    return data as any as LoginResponse;
  },

  getCurrentUser: async (): Promise<User> => {
    const { data, error } = await sdkGetCurrentUser();
    if (error) throw error;
    return data as any as User;
  },
};

export default authApi;
