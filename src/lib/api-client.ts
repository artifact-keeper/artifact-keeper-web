import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { ApiError } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Get the base URL for the currently active instance.
 * For "local", returns the normal API base URL.
 * For remote instances, returns a proxy URL through the local backend so
 * that API keys are never exposed to the browser.
 */
export function getActiveInstanceBaseUrl(): string {
  if (typeof window === "undefined") return API_BASE_URL;
  try {
    const activeId = localStorage.getItem("ak_active_instance") || "local";
    if (activeId === "local") return API_BASE_URL;
    // Route remote instance requests through the backend proxy
    return `${API_BASE_URL}/api/v1/instances/${activeId}/proxy`;
  } catch {
    return API_BASE_URL;
  }
}

/**
 * Check whether the currently active instance is a remote one.
 */
function isRemoteInstance(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const activeId = localStorage.getItem("ak_active_instance") || "local";
    return activeId !== "local";
  } catch {
    return false;
  }
}

export const apiClient = axios.create({
  baseURL: getActiveInstanceBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor: set baseURL dynamically.
// For remote instances the backend proxy handles the remote API key,
// but the local auth cookie is still sent automatically via withCredentials
// so the proxy can verify the caller's identity.
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      // Update baseURL dynamically in case the active instance changed
      config.baseURL = getActiveInstanceBaseUrl();
      // For local instance, httpOnly cookies handle auth automatically.
      // For remote instances, the same cookies authorise the proxy call.
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Token refresh mutex to prevent race conditions with concurrent 401 responses
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

// Response interceptor to handle errors and token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config;
    const isRemote = isRemoteInstance();

    if (
      error.response?.status === 401 &&
      originalRequest &&
      typeof window !== 'undefined' &&
      !isRemote &&
      !(originalRequest as InternalAxiosRequestConfig & { _retry?: boolean })._retry
    ) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          addRefreshSubscriber(() => {
            // Cookies are updated by the refresh response; just retry the request
            resolve(apiClient(originalRequest));
          });
        });
      }

      (originalRequest as InternalAxiosRequestConfig & { _retry?: boolean })._retry = true;
      isRefreshing = true;

      try {
        // Send empty body - refresh token is sent automatically via httpOnly cookie
        const response = await axios.post(
          `${getActiveInstanceBaseUrl()}/api/v1/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const { access_token } = response.data;

        isRefreshing = false;
        onTokenRefreshed(access_token);

        // Don't set Authorization header - cookies handle auth for local instance
        return apiClient(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        refreshSubscribers = [];
        // Clean up any legacy localStorage tokens
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
