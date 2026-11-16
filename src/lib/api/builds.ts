import '@/lib/sdk-client';
import {
  listBuilds as sdkListBuilds,
  getBuild as sdkGetBuild,
  createBuild as sdkCreateBuild,
  updateBuild as sdkUpdateBuild,
  getBuildDiff,
} from '@artifact-keeper/sdk';
import type {
  BuildResponse,
  BuildListResponse,
  BuildDiffResponse,
  BuildModule as SdkBuildModule,
  CreateBuildRequest as SdkCreateBuildRequest,
  UpdateBuildRequest as SdkUpdateBuildRequest,
} from '@artifact-keeper/sdk';
import type { PaginatedResponse } from '@/types';
import { assertData, narrowEnum } from '@/lib/api/fetch';

// Re-export types from the canonical types/ module
export type { BuildStatus, Build, BuildModule, BuildDiff, BuildArtifact, BuildArtifactDiff } from '@/types/builds';
import type { Build, BuildStatus, BuildDiff, BuildModule } from '@/types/builds';
import { unwrap } from '@/lib/sdk-utils';

export interface ListBuildsParams {
  page?: number;
  per_page?: number;
  status?: BuildStatus;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

const BUILD_STATUSES = new Set<BuildStatus>([
  'pending',
  'running',
  'success',
  'failed',
  'cancelled',
]);

function adaptBuildModule(sdk: SdkBuildModule): BuildModule {
  return {
    id: sdk.id,
    name: sdk.name,
    artifacts: sdk.artifacts.map((a) => ({
      name: a.name,
      path: a.path,
      checksum_sha256: a.checksum_sha256,
      size_bytes: a.size_bytes,
    })),
  };
}

function adaptBuild(sdk: BuildResponse): Build {
  return {
    id: sdk.id,
    name: sdk.name,
    number: sdk.number,
    status: narrowEnum(sdk.status, BUILD_STATUSES, 'pending'),
    started_at: sdk.started_at ?? undefined,
    finished_at: sdk.finished_at ?? undefined,
    duration_ms: sdk.duration_ms ?? undefined,
    agent: sdk.agent ?? undefined,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
    artifact_count: sdk.artifact_count ?? undefined,
    modules: sdk.modules
      ? sdk.modules.map(adaptBuildModule)
      : undefined,
    vcs_url: sdk.vcs_url ?? undefined,
    vcs_revision: sdk.vcs_revision ?? undefined,
    vcs_branch: sdk.vcs_branch ?? undefined,
    vcs_message: sdk.vcs_message ?? undefined,
    metadata: sdk.metadata,
  };
}

function adaptBuildList(sdk: BuildListResponse): PaginatedResponse<Build> {
  return {
    items: sdk.items.map(adaptBuild),
    pagination: sdk.pagination,
  };
}

function adaptBuildDiff(sdk: BuildDiffResponse): BuildDiff {
  return {
    build_a: sdk.build_a,
    build_b: sdk.build_b,
    added: sdk.added,
    removed: sdk.removed,
    modified: sdk.modified,
  };
}

export const buildsApi = {
  list: async (params: ListBuildsParams = {}): Promise<PaginatedResponse<Build>> => {
    const data = await unwrap(sdkListBuilds({ query: params }));
    return adaptBuildList(assertData(data, 'buildsApi.list'));
  },

  get: async (buildId: string): Promise<Build> => {
    const data = await unwrap(sdkGetBuild({ path: { id: buildId } }));
    return adaptBuild(assertData(data, 'buildsApi.get'));
  },

  create: async (input: {
    name: string;
    build_number: number;
    agent?: string;
    started_at?: string;
    vcs_url?: string;
    vcs_revision?: string;
    vcs_branch?: string;
    vcs_message?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Build> => {
    const body: SdkCreateBuildRequest = {
      name: input.name,
      build_number: input.build_number,
      agent: input.agent,
      started_at: input.started_at,
      vcs_url: input.vcs_url,
      vcs_revision: input.vcs_revision,
      vcs_branch: input.vcs_branch,
      vcs_message: input.vcs_message,
      metadata: input.metadata ?? {},
    };
    const data = await unwrap(sdkCreateBuild({ body }));
    return adaptBuild(assertData(data, 'buildsApi.create'));
  },

  updateStatus: async (
    buildId: string,
    input: { status: string; finished_at?: string }
  ): Promise<Build> => {
    const body: SdkUpdateBuildRequest = {
      status: input.status,
      finished_at: input.finished_at,
    };
    const data = await unwrap(sdkUpdateBuild({ path: { id: buildId }, body }));
    return adaptBuild(assertData(data, 'buildsApi.updateStatus'));
  },

  diff: async (buildIdA: string, buildIdB: string): Promise<BuildDiff> => {
    const data = await unwrap(getBuildDiff({
      query: { build_a: buildIdA, build_b: buildIdB },
    }));
    return adaptBuildDiff(assertData(data, 'buildsApi.diff'));
  },
};

