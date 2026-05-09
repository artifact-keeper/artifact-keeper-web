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

// SDK BuildModule: { id, name, artifacts: BuildArtifact[] }
// Local BuildModule: { id, build_id, module_name, name, path, checksum_sha256,
// size_bytes, created_at }. The SDK shape is a parent record holding its
// artifacts; the local shape was modeled per-artifact-row.
//
// INTENTIONAL LOSS: this adapter collapses an N-artifact SDK module to a
// single local BuildModule by keeping only `artifacts[0]`. Pages that need
// per-artifact data should consume the SDK shape directly via
// `BuildResponse.modules[i].artifacts`. Pending: rework the local BuildModule
// type to carry an `artifacts` array so the collapse can be removed (#206
// follow-up).
//
// While the local type still drops siblings, log a warning when a module
// arrives with multiple artifacts so the regression is observable rather
// than silent.
function adaptBuildModule(sdk: SdkBuildModule, buildId: string): BuildModule {
  if (sdk.artifacts.length > 1) {
    console.warn(
      `buildsApi: collapsing SDK BuildModule "${sdk.name}" (${sdk.artifacts.length} artifacts) ` +
        `to a single local BuildModule entry — extra artifacts are dropped. ` +
        `Pages that need full per-artifact data must consume modules[i].artifacts directly.`
    );
  }
  const first = sdk.artifacts[0];
  return {
    id: sdk.id,
    build_id: buildId,
    module_name: sdk.name,
    name: first?.name ?? sdk.name,
    path: first?.path ?? '',
    checksum_sha256: first?.checksum_sha256 ?? '',
    size_bytes: first?.size_bytes ?? 0,
    created_at: '',
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
    modules: sdk.modules ? sdk.modules.map((m) => adaptBuildModule(m, sdk.id)) : undefined,
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
    const { data, error } = await sdkListBuilds({ query: params });
    if (error) throw error;
    return adaptBuildList(assertData(data, 'buildsApi.list'));
  },

  get: async (buildId: string): Promise<Build> => {
    const { data, error } = await sdkGetBuild({ path: { id: buildId } });
    if (error) throw error;
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
    const { data, error } = await sdkCreateBuild({ body });
    if (error) throw error;
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
    const { data, error } = await sdkUpdateBuild({ path: { id: buildId }, body });
    if (error) throw error;
    return adaptBuild(assertData(data, 'buildsApi.updateStatus'));
  },

  diff: async (buildIdA: string, buildIdB: string): Promise<BuildDiff> => {
    const { data, error } = await getBuildDiff({
      query: { build_a: buildIdA, build_b: buildIdB },
    });
    if (error) throw error;
    return adaptBuildDiff(assertData(data, 'buildsApi.diff'));
  },
};

export default buildsApi;
