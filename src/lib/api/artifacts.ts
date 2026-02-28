/* eslint-disable @typescript-eslint/no-explicit-any */
import '@/lib/sdk-client';
import {
  listArtifacts,
  deleteArtifact,
  createDownloadTicket,
} from '@artifact-keeper/sdk';
import { getActiveInstanceBaseUrl } from '@/lib/sdk-client';
import type { Artifact, PaginatedResponse } from '@/types';

export interface ListArtifactsParams {
  page?: number;
  per_page?: number;
  path_prefix?: string;
  q?: string;
  /** @deprecated Use `q` instead */
  search?: string;
}

export const artifactsApi = {
  list: async (repoKey: string, params: ListArtifactsParams = {}): Promise<PaginatedResponse<Artifact>> => {
    // Map 'search' to 'q' for backwards compat
    const { search, ...rest } = params;
    const query = { ...rest, q: params.q || search || undefined };
    const { data, error } = await listArtifacts({ path: { key: repoKey }, query: query as any });
    if (error) throw error;
    return data as any as PaginatedResponse<Artifact>;
  },

  get: async (repoKey: string, artifactPath: string): Promise<Artifact> => {
    // The SDK uses getRepositoryArtifactMetadata for GET /api/v1/repositories/{key}/artifacts/{path}
    // but the original code uses a URL-encoded path. Use the SDK's downloadArtifact metadata or
    // fall back to a direct fetch since the SDK's getArtifact uses /api/v1/artifacts/{id} which
    // is a different endpoint.
    const baseUrl = getActiveInstanceBaseUrl();
    const response = await fetch(
      `${baseUrl}/api/v1/repositories/${repoKey}/artifacts/${encodeURIComponent(artifactPath)}`,
      { credentials: 'include' }
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch artifact: ${response.status}`);
    }
    return response.json() as Promise<Artifact>;
  },

  delete: async (repoKey: string, artifactPath: string): Promise<void> => {
    const { error } = await deleteArtifact({ path: { key: repoKey, path: artifactPath } });
    if (error) throw error;
  },

  getDownloadUrl: (repoKey: string, artifactPath: string): string => {
    return `/api/v1/repositories/${repoKey}/download/${artifactPath}`;
  },

  createDownloadTicket: async (repoKey: string, artifactPath: string): Promise<string> => {
    const { data, error } = await createDownloadTicket({
      body: { purpose: 'download', resource_path: `${repoKey}/${artifactPath}` } as any,
    });
    if (error) throw error;
    return (data as any).ticket as string;
  },

  upload: async (
    repoKey: string,
    file: File,
    path?: string,
    onProgress?: (percent: number) => void
  ): Promise<Artifact> => {
    // Keep using XMLHttpRequest for upload progress tracking since
    // fetch doesn't support upload progress callbacks
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      if (path) {
        formData.append('path', path);
      }

      xhr.open('POST', `${getActiveInstanceBaseUrl()}/api/v1/repositories/${repoKey}/artifacts`);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.round((event.loaded * 100) / event.total);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText) as Artifact);
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(formData);
    });
  },
};

export default artifactsApi;
