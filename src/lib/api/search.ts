import '@/lib/sdk-client';
import { quickSearch, advancedSearch, checksumSearch } from '@artifact-keeper/sdk';
import type {
  SearchResultItem,
  AdvancedSearchResponse,
  ChecksumArtifact,
} from '@artifact-keeper/sdk';
import type { Artifact, PaginatedResponse } from '@/types';
import { assertData, narrowEnum } from '@/lib/api/fetch';

export interface SearchResult {
  id: string;
  type: 'artifact' | 'package' | 'repository';
  name: string;
  path?: string;
  repository_key: string;
  format?: string;
  version?: string;
  size_bytes?: number;
  is_quarantined?: boolean;
  quarantine_until?: string | null;
  quarantine_reason?: string | null;
  created_at: string;
  highlights?: string[];
}

export interface QuickSearchParams {
  query: string;
  limit?: number;
  types?: ('artifact' | 'package' | 'repository')[];
}

export interface AdvancedSearchParams {
  page?: number;
  per_page?: number;
  query?: string;
  repository_key?: string;
  format?: string;
  name?: string;
  path?: string;
  version?: string;
  min_size?: number;
  max_size?: number;
  created_after?: string;
  created_before?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface ChecksumSearchParams {
  checksum: string;
  algorithm?: 'sha256' | 'sha1' | 'md5';
}

const SEARCH_RESULT_TYPES = new Set<SearchResult['type']>(['artifact', 'package', 'repository']);

// SDK's SearchResultItem.type is `string`; narrow to the local union, falling
// back to 'artifact' for unrecognized values rather than throwing — search
// UIs should still render unknown items.
function adaptSearchResult(sdk: SearchResultItem): SearchResult {
  return {
    id: sdk.id,
    type: narrowEnum(sdk.type, SEARCH_RESULT_TYPES, 'artifact'),
    name: sdk.name,
    path: sdk.path ?? undefined,
    repository_key: sdk.repository_key,
    format: sdk.format ?? undefined,
    version: sdk.version ?? undefined,
    size_bytes: sdk.size_bytes ?? undefined,
    created_at: sdk.created_at,
    highlights: sdk.highlights ?? undefined,
  };
}

// ChecksumSearchResponse.artifacts uses ChecksumArtifact, which is a strict
// subset of the local Artifact (no checksum_sha256, content_type, etc.).
// Adapt by filling in known fields and leaving the rest as defaults.
function adaptChecksumArtifact(sdk: ChecksumArtifact): Artifact {
  return {
    id: sdk.id,
    repository_key: sdk.repository_key,
    path: sdk.path,
    name: sdk.name,
    version: sdk.version ?? undefined,
    size_bytes: sdk.size_bytes,
    checksum_sha256: '',
    content_type: '',
    download_count: 0,
    created_at: '',
  };
}

function adaptAdvancedSearch(sdk: AdvancedSearchResponse): PaginatedResponse<SearchResult> {
  return {
    items: sdk.items.map(adaptSearchResult),
    pagination: sdk.pagination,
  };
}

export const searchApi = {
  quickSearch: async (params: QuickSearchParams): Promise<SearchResult[]> => {
    const { data, error } = await quickSearch({
      query: {
        q: params.query,
        limit: params.limit,
        types: params.types?.join(','),
      },
    });
    if (error) throw error;
    return assertData(data, 'searchApi.quickSearch').results.map(adaptSearchResult);
  },

  advancedSearch: async (
    params: AdvancedSearchParams
  ): Promise<PaginatedResponse<SearchResult>> => {
    const { data, error } = await advancedSearch({ query: params });
    if (error) throw error;
    return adaptAdvancedSearch(assertData(data, 'searchApi.advancedSearch'));
  },

  checksumSearch: async (params: ChecksumSearchParams): Promise<Artifact[]> => {
    const { data, error } = await checksumSearch({
      query: {
        checksum: params.checksum,
        algorithm: params.algorithm || 'sha256',
      },
    });
    if (error) throw error;
    return assertData(data, 'searchApi.checksumSearch').artifacts.map(adaptChecksumArtifact);
  },
};

export default searchApi;
