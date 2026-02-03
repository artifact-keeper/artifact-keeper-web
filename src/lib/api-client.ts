import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { ApiError } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Get the base URL for the currently active instance.
 * Returns empty string for local instance (uses relative URLs).
 */
export function getActiveInstanceBaseUrl(): string {
  if (typeof window === "undefined") return API_BASE_URL;
  try {
    const activeId = localStorage.getItem("ak_active_instance") || "local";
    if (activeId === "local") return API_BASE_URL;
    const stored = localStorage.getItem("ak_instances");
    if (!stored) return API_BASE_URL;
    const instances = JSON.parse(stored) as Array<{ id: string; url: string }>;
    const active = instances.find((i) => i.id === activeId);
    return active?.url ?? API_BASE_URL;
  } catch {
    return API_BASE_URL;
  }
}

/**
 * Get the API key for the currently active remote instance, if any.
 */
export function getActiveInstanceApiKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const activeId = localStorage.getItem("ak_active_instance") || "local";
    if (activeId === "local") return null;
    const stored = localStorage.getItem("ak_instances");
    if (!stored) return null;
    const instances = JSON.parse(stored) as Array<{ id: string; apiKey?: string }>;
    const active = instances.find((i) => i.id === activeId);
    return active?.apiKey ?? null;
  } catch {
    return null;
  }
}

export const apiClient = axios.create({
  baseURL: getActiveInstanceBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token or remote API key
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      // Update baseURL dynamically in case the active instance changed
      config.baseURL = getActiveInstanceBaseUrl();

      const remoteApiKey = getActiveInstanceApiKey();
      if (remoteApiKey) {
        // Use API key for remote instances instead of local auth token
        config.headers.Authorization = `Bearer ${remoteApiKey}`;
      } else {
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle errors and token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config;

    // If 401 and we have a refresh token, try to refresh (only for local instance)
    const isRemote = getActiveInstanceApiKey() !== null;
    if (error.response?.status === 401 && originalRequest && typeof window !== 'undefined' && !isRemote) {
      const refreshToken = localStorage.getItem('refresh_token');

      if (refreshToken) {
        try {
          const response = await axios.post(`${getActiveInstanceBaseUrl()}/api/v1/auth/refresh`, {
            refresh_token: refreshToken,
          });

          const { access_token, refresh_token: newRefreshToken } = response.data;
          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', newRefreshToken);

          // Retry the original request
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return apiClient(originalRequest);
        } catch (refreshError) {
          // Refresh failed, clear tokens and redirect to login
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
