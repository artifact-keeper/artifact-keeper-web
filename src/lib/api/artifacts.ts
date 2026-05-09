import '@/lib/sdk-client';
import {
  listArtifacts,
  deleteArtifact,
  createDownloadTicket,
} from '@artifact-keeper/sdk';
import type {
  ArtifactResponse,
  ArtifactListResponse,
} from '@artifact-keeper/sdk';
import { getActiveInstanceBaseUrl } from '@/lib/sdk-client';
import type { Artifact, PaginatedResponse } from '@/types';
import { assertData } from '@/lib/api/fetch';

export interface ListArtifactsParams {
  page?: number;
  per_page?: number;
  path_prefix?: string;
  q?: string;
  /** @deprecated Use `q` instead */
  search?: string;
}

// Local Artifact extends ArtifactResponse with quarantine fields the SDK
// doesn't model yet — leave those undefined and let callers fetch detail
// endpoints if they need quarantine state.
function adaptArtifact(sdk: ArtifactResponse): Artifact {
  return {
    id: sdk.id,
    repository_key: sdk.repository_key,
    path: sdk.path,
    name: sdk.name,
    version: sdk.version ?? undefined,
    size_bytes: sdk.size_bytes,
    checksum_sha256: sdk.checksum_sha256,
    content_type: sdk.content_type,
    download_count: sdk.download_count,
    created_at: sdk.created_at,
    metadata: sdk.metadata ?? undefined,
  };
}

function adaptArtifactList(sdk: ArtifactListResponse): PaginatedResponse<Artifact> {
  return {
    items: sdk.items.map(adaptArtifact),
    pagination: sdk.pagination,
  };
}

export const artifactsApi = {
  list: async (repoKey: string, params: ListArtifactsParams = {}): Promise<PaginatedResponse<Artifact>> => {
    // Map 'search' to 'q' for backwards compat
    const { search, ...rest } = params;
    const query = { ...rest, q: params.q || search || undefined };
    const { data, error } = await listArtifacts({ path: { key: repoKey }, query });
    if (error) throw error;
    return adaptArtifactList(assertData(data, 'artifactsApi.list'));
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
      body: { purpose: 'download', resource_path: `${repoKey}/${artifactPath}` },
    });
    if (error) throw error;
    return assertData(data, 'artifactsApi.createDownloadTicket').ticket;
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
          let detail = '';
          try {
            const body = JSON.parse(xhr.responseText);
            detail = body?.error || body?.message || '';
          } catch {
            // response is not JSON
          }
          if (xhr.status === 413) {
            reject(new Error('File exceeds the maximum upload size allowed by the server.'));
          } else {
            reject(new Error(detail || `Upload failed with status ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Upload failed. Check your network connection and try again.'));
      xhr.send(formData);
    });
  },
};

export default artifactsApi;
