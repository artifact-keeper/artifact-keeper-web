import { ApiError, apiFetch } from '@/lib/api/fetch';
import { parseInstanceQuota, type InstanceQuota } from '@/lib/quota';

/** React Query keys for the instance quota reads. */
export const quotaKeys = {
  system: ['system-quota'] as const,
};

/**
 * `GET /api/v1/system/quota`: the instance-wide storage and transfer quotas,
 * readable by any signed-in user. Resolves to null when the backend predates
 * the endpoint (404/405/501) or does not let the caller read it (401/403), so
 * the UI falls back to showing no quota rather than an error.
 */
export const quotaApi = {
  get: async (): Promise<InstanceQuota | null> => {
    try {
      return parseInstanceQuota(await apiFetch<unknown>('/api/v1/system/quota'));
    } catch (err) {
      if (err instanceof ApiError && [401, 403, 404, 405, 501].includes(err.status)) {
        return null;
      }
      throw err;
    }
  },
};
