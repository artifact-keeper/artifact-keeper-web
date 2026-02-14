import { getActiveInstanceBaseUrl } from '@/lib/sdk-client';

/**
 * Shared fetch wrapper for API modules that don't use the generated SDK.
 * Adds base URL resolution, JSON headers, credentials, and error handling.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getActiveInstanceBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`API error ${response.status}: ${body}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
