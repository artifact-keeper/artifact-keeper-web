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
import type {
  Artifact,
  GroupedArtifactListResponse,
  MavenComponent,
  PaginatedResponse,
} from '@/types';
import { apiFetch, assertData } from '@/lib/api/fetch';

export interface ListArtifactsParams {
  page?: number;
  per_page?: number;
  path_prefix?: string;
  q?: string;
  /** @deprecated Use `q` instead */
  search?: string;
  /**
   * Server-side grouping mode.  Currently only `'maven_component'` is
   * supported (backend ak#701, issue #254): when set on a Maven/Gradle repo
   * the response includes a `components` array of GAV-grouped entries
   * alongside (an empty) `items` array.
   */
  group_by?: 'maven_component';
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

/**
 * Raw shape returned by the backend when `?group_by=maven_component` is used.
 * The SDK types haven't been regenerated for ak#701 yet, so we model it here.
 */
interface RawGroupedArtifactListResponse {
  items: ArtifactResponse[];
  pagination: ArtifactListResponse['pagination'];
  components?: MavenComponent[];
}

/**
 * Build the path-and-query portion of the artifacts listing URL.  Used by
 * `listGrouped` which routes through the shared `apiFetch` helper instead
 * of the generated SDK (the SDK has no `group_by` parameter yet — see #254
 * / ak#701).  `apiFetch` prepends the active instance base URL itself.
 */
function buildArtifactsListPath(repoKey: string, params: ListArtifactsParams): string {
  const search = new URLSearchParams();
  if (params.page != null) search.set('page', String(params.page));
  if (params.per_page != null) search.set('per_page', String(params.per_page));
  if (params.path_prefix) search.set('path_prefix', params.path_prefix);
  const q = params.q || params.search;
  if (q) search.set('q', q);
  if (params.group_by) search.set('group_by', params.group_by);
  const qs = search.toString();
  const base = `/api/v1/repositories/${encodeURIComponent(repoKey)}/artifacts`;
  return qs ? `${base}?${qs}` : base;
}

export const artifactsApi = {
  list: async (repoKey: string, params: ListArtifactsParams = {}): Promise<PaginatedResponse<Artifact>> => {
    // Map 'search' to 'q' for backwards compat
    const { search, group_by, ...rest } = params;
    if (group_by) {
      // Grouped variant — SDK doesn't model `group_by` yet, so go direct.
      // The caller should use `listGrouped` for the typed result; this branch
      // exists so existing callers that flip a single param still work.
      const grouped = await artifactsApi.listGrouped(repoKey, { ...params, group_by });
      return { items: grouped.items, pagination: grouped.pagination };
    }
    const query = { ...rest, q: params.q || search || undefined };
    const { data, error } = await listArtifacts({ path: { key: repoKey }, query });
    if (error) throw error;
    return adaptArtifactList(assertData(data, 'artifactsApi.list'));
  },

  /**
   * Same endpoint as `list`, but preserves the optional `components` array
   * returned when `group_by=maven_component` is set.  Used by the Maven
   * component grouping view (#254).  Goes through `apiFetch` instead of the
   * generated SDK because the SDK doesn't yet model `group_by`; once the
   * SDK is regenerated this can collapse back into `list`.
   */
  listGrouped: async (
    repoKey: string,
    params: ListArtifactsParams = {}
  ): Promise<GroupedArtifactListResponse> => {
    const path = buildArtifactsListPath(repoKey, params);
    const raw = await apiFetch<RawGroupedArtifactListResponse>(path);
    return {
      items: (raw.items ?? []).map(adaptArtifact),
      pagination: raw.pagination,
      components: raw.components,
    };
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
