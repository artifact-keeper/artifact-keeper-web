/* eslint-disable @typescript-eslint/no-explicit-any */
import '@/lib/sdk-client';
import { quickSearch, advancedSearch, checksumSearch } from '@artifact-keeper/sdk';
import type { Artifact, PaginatedResponse } from '@/types';

export interface SearchResult {
  id: string;
  type: 'artifact' | 'package' | 'repository';
  name: string;
  path?: string;
  repository_key: string;
  format?: string;
  version?: string;
  size_bytes?: number;
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

export const searchApi = {
  quickSearch: async (params: QuickSearchParams): Promise<SearchResult[]> => {
    const { data, error } = await quickSearch({
      query: {
        q: params.query,
        limit: params.limit,
        types: params.types?.join(','),
      } as any,
    });
    if (error) throw error;
    return (data as any).results as SearchResult[];
  },

  advancedSearch: async (
    params: AdvancedSearchParams
  ): Promise<PaginatedResponse<SearchResult>> => {
    const { data, error } = await advancedSearch({ query: params as any });
    if (error) throw error;
    return data as any as PaginatedResponse<SearchResult>;
  },

  checksumSearch: async (params: ChecksumSearchParams): Promise<Artifact[]> => {
    const { data, error } = await checksumSearch({
      query: {
        checksum: params.checksum,
        algorithm: params.algorithm || 'sha256',
      } as any,
    });
    if (error) throw error;
    return (data as any).artifacts as Artifact[];
  },
};

export default searchApi;
