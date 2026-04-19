import { getActiveInstanceBaseUrl } from '@/lib/sdk-client';

/**
 * Shared fetch wrapper for API modules that don't use the generated SDK.
 * Adds base URL resolution, JSON headers, credentials, and error handling.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getActiveInstanceBaseUrl();
  const { headers: callerHeaders, ...rest } = init ?? {};

  // Build headers with defaults first so caller values take precedence.
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const incoming = new Headers(callerHeaders);
  incoming.forEach((value, key) => {
    headers.set(key, value);
  });

  const response = await fetch(`${baseUrl}${path}`, {
    credentials: 'include',
    ...rest,
    headers,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`API error ${response.status}: ${body}`);
  }
  if (response.status === 204) return undefined as T;

  // Guard against empty response bodies (e.g. 200 with no content, or a 204
  // that was rewritten to 200 by the Next.js middleware proxy). Calling
  // response.json() on an empty body throws a SyntaxError which would cause
  // mutations to appear to fail even though the server processed the request.
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
