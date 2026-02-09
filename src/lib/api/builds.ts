/* eslint-disable @typescript-eslint/no-explicit-any */
import '@/lib/sdk-client';
import {
  listBuilds as sdkListBuilds,
  getBuild as sdkGetBuild,
  createBuild as sdkCreateBuild,
  updateBuild as sdkUpdateBuild,
  getBuildDiff,
} from '@artifact-keeper/sdk';
import type { PaginatedResponse } from '@/types';

// Re-export types from the canonical types/ module
export type { BuildStatus, Build, BuildModule, BuildDiff, BuildArtifact, BuildArtifactDiff } from '@/types/builds';
import type { Build, BuildStatus, BuildDiff } from '@/types/builds';

export interface ListBuildsParams {
  page?: number;
  per_page?: number;
  status?: BuildStatus;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export const buildsApi = {
  list: async (params: ListBuildsParams = {}): Promise<PaginatedResponse<Build>> => {
    const { data, error } = await sdkListBuilds({ query: params as any });
    if (error) throw error;
    return data as any as PaginatedResponse<Build>;
  },

  get: async (buildId: string): Promise<Build> => {
    const { data, error } = await sdkGetBuild({ path: { id: buildId } });
    if (error) throw error;
    return data as any as Build;
  },

  create: async (data: { name: string; build_number: number; agent?: string; started_at?: string; vcs_url?: string; vcs_revision?: string; vcs_branch?: string; vcs_message?: string; metadata?: Record<string, unknown> }): Promise<Build> => {
    const { data: result, error } = await sdkCreateBuild({ body: data as any });
    if (error) throw error;
    return result as any as Build;
  },

  updateStatus: async (buildId: string, data: { status: string; finished_at?: string }): Promise<Build> => {
    const { data: result, error } = await sdkUpdateBuild({ path: { id: buildId }, body: data as any });
    if (error) throw error;
    return result as any as Build;
  },

  diff: async (buildIdA: string, buildIdB: string): Promise<BuildDiff> => {
    const { data, error } = await getBuildDiff({
      query: { build_a: buildIdA, build_b: buildIdB } as any,
    });
    if (error) throw error;
    return data as any as BuildDiff;
  },
};

export default buildsApi;
