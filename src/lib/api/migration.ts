import '@/lib/sdk-client';
import {
  listConnections as sdkListConnections,
  createConnection as sdkCreateConnection,
  getConnection as sdkGetConnection,
  deleteConnection as sdkDeleteConnection,
  testConnection as sdkTestConnection,
  listSourceRepositories as sdkListSourceRepositories,
  listMigrations as sdkListMigrations,
  createMigration as sdkCreateMigration,
  getMigration as sdkGetMigration,
  deleteMigration as sdkDeleteMigration,
  startMigration as sdkStartMigration,
  pauseMigration as sdkPauseMigration,
  resumeMigration as sdkResumeMigration,
  cancelMigration as sdkCancelMigration,
  listMigrationItems as sdkListMigrationItems,
  getMigrationReport as sdkGetMigrationReport,
  runAssessment as sdkRunAssessment,
  getAssessment as sdkGetAssessment,
  createDownloadTicket as sdkCreateDownloadTicket,
} from '@artifact-keeper/sdk';
import type {
  ConnectionResponse as SdkConnectionResponse,
  SourceRepository as SdkSourceRepository,
  TicketResponse,
  ConnectionTestResult as SdkConnectionTestResult,
  MigrationJobResponse as SdkMigrationJobResponse,
  MigrationItemResponse as SdkMigrationItemResponse,
  MigrationReportResponse as SdkMigrationReportResponse,
  AssessmentResult as SdkAssessmentResult,
  RepositoryAssessment as SdkRepositoryAssessment,
  CreateConnectionRequest as SdkCreateConnectionRequest,
  CreateMigrationRequest as SdkCreateMigrationRequest,
  CreateTicketRequest as SdkCreateTicketRequest,
} from '@artifact-keeper/sdk';
import type {
  SourceConnection,
  SourceType,
  CreateConnectionRequest,
  ConnectionTestResult,
  SourceRepository,
  MigrationJob,
  MigrationJobStatus,
  MigrationJobType,
  MigrationItem,
  MigrationItemType,
  MigrationItemStatus,
  MigrationConfig,
  MigrationReport,
  ReportSummary,
  ReportWarning,
  ReportError,
  AssessmentResult,
  RepositoryAssessment,
  CreateMigrationRequest,
  PaginatedResponse,
} from '@/types';
import { assertData, narrowEnum } from '@/lib/api/fetch';

// SDK ConnectionResponse exposes auth_type as `string`; the local AuthType is
// a narrowed union. Default unrecognized values to 'api_token' rather than
// throwing — list endpoints should still render even with stale enum entries.
function narrowAuthType(v: string): SourceConnection['auth_type'] {
  return v === 'basic_auth' ? 'basic_auth' : 'api_token';
}

// Backend accepts 'artifactory' (default) or 'nexus'. Unknown values fall back
// to 'artifactory' so existing connections keep rendering if a new registry
// type is added server-side before the UI is updated.
const SOURCE_TYPES: ReadonlySet<SourceType> = new Set(['artifactory', 'nexus']);
function narrowSourceType(v: string): SourceType {
  return narrowEnum<SourceType>(v, SOURCE_TYPES, 'artifactory');
}

function adaptSourceConnection(sdk: SdkConnectionResponse): SourceConnection {
  return {
    id: sdk.id,
    name: sdk.name,
    url: sdk.url,
    auth_type: narrowAuthType(sdk.auth_type),
    source_type: narrowSourceType(sdk.source_type),
    created_at: sdk.created_at,
    verified_at: sdk.verified_at ?? undefined,
  };
}

const SOURCE_REPO_TYPES = new Set<SourceRepository['type']>(['local', 'remote', 'virtual']);

function adaptSourceRepository(sdk: SdkSourceRepository): SourceRepository {
  return {
    key: sdk.key,
    // Default to 'local' but warn so a new upstream classification ('federated', etc.)
    // surfaces in the console instead of silently misrendering.
    type: narrowEnum(
      sdk.type,
      SOURCE_REPO_TYPES,
      'local',
      `migrationApi: unknown source repository type "${sdk.type}" — defaulting to 'local'.`,
    ),
    package_type: sdk.package_type,
    url: sdk.url,
    description: sdk.description ?? undefined,
  };
}

const MIGRATION_JOB_STATUSES = new Set<MigrationJobStatus>([
  'pending',
  'assessing',
  'ready',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
]);
const MIGRATION_JOB_TYPES = new Set<MigrationJobType>(['full', 'incremental', 'assessment']);
const MIGRATION_ITEM_TYPES = new Set<MigrationItemType>([
  'repository',
  'artifact',
  'user',
  'group',
  'permission',
  'property',
]);
const MIGRATION_ITEM_STATUSES = new Set<MigrationItemStatus>([
  'pending',
  'in_progress',
  'completed',
  'failed',
  'skipped',
]);

function adaptMigrationJob(sdk: SdkMigrationJobResponse): MigrationJob {
  return {
    id: sdk.id,
    source_connection_id: sdk.source_connection_id,
    status: narrowEnum(sdk.status, MIGRATION_JOB_STATUSES, 'pending'),
    job_type: narrowEnum(sdk.job_type, MIGRATION_JOB_TYPES, 'full'),
    // SDK config is a free-form record; the local MigrationConfig models the
    // fields this UI knows how to render. Unknown keys are ignored at the boundary.
    config: sdk.config as MigrationConfig,
    total_items: sdk.total_items,
    completed_items: sdk.completed_items,
    failed_items: sdk.failed_items,
    skipped_items: sdk.skipped_items,
    total_bytes: sdk.total_bytes,
    transferred_bytes: sdk.transferred_bytes,
    progress_percent: sdk.progress_percent,
    estimated_time_remaining: sdk.estimated_time_remaining ?? undefined,
    started_at: sdk.started_at ?? undefined,
    finished_at: sdk.finished_at ?? undefined,
    created_at: sdk.created_at,
    error_summary: sdk.error_summary ?? undefined,
  };
}

function adaptMigrationItem(sdk: SdkMigrationItemResponse): MigrationItem {
  return {
    id: sdk.id,
    job_id: sdk.job_id,
    item_type: narrowEnum(sdk.item_type, MIGRATION_ITEM_TYPES, 'artifact'),
    source_path: sdk.source_path,
    target_path: sdk.target_path ?? undefined,
    status: narrowEnum(sdk.status, MIGRATION_ITEM_STATUSES, 'pending'),
    size_bytes: sdk.size_bytes,
    checksum_source: sdk.checksum_source ?? undefined,
    checksum_target: sdk.checksum_target ?? undefined,
    error_message: sdk.error_message ?? undefined,
    retry_count: sdk.retry_count,
    started_at: sdk.started_at ?? undefined,
    completed_at: sdk.completed_at ?? undefined,
  };
}

function adaptConnectionTestResult(sdk: SdkConnectionTestResult): ConnectionTestResult {
  return {
    success: sdk.success,
    message: sdk.message,
    artifactory_version: sdk.artifactory_version ?? undefined,
    license_type: sdk.license_type ?? undefined,
  };
}

const REPO_ASSESSMENT_TYPES = new Set<RepositoryAssessment['type']>(['local', 'remote', 'virtual']);
const REPO_COMPATIBILITY = new Set<RepositoryAssessment['compatibility']>([
  'full',
  'partial',
  'unsupported',
]);

function adaptRepositoryAssessment(sdk: SdkRepositoryAssessment): RepositoryAssessment {
  return {
    key: sdk.key,
    type: narrowEnum(sdk.type, REPO_ASSESSMENT_TYPES, 'local'),
    package_type: sdk.package_type,
    artifact_count: sdk.artifact_count,
    total_size_bytes: sdk.total_size_bytes,
    compatibility: narrowEnum(sdk.compatibility, REPO_COMPATIBILITY, 'unsupported'),
    warnings: sdk.warnings,
  };
}

function adaptAssessmentResult(sdk: SdkAssessmentResult): AssessmentResult {
  return {
    job_id: sdk.job_id,
    status: sdk.status,
    repositories: sdk.repositories.map(adaptRepositoryAssessment),
    users_count: sdk.users_count,
    groups_count: sdk.groups_count,
    permissions_count: sdk.permissions_count,
    total_artifacts: sdk.total_artifacts,
    total_size_bytes: sdk.total_size_bytes,
    estimated_duration_seconds: sdk.estimated_duration_seconds,
    warnings: sdk.warnings,
    blockers: sdk.blockers,
  };
}

// SDK MigrationReportResponse models summary/warnings/errors/recommendations
// as free-form records. The local MigrationReport types are stricter, but the
// backend produces them shaped per the local interfaces — so we accept the
// record at the boundary and cast through unknown into the structured shape.
// If the backend diverges, the cast surfaces as a runtime mismatch in the UI
// rather than at the SDK seam (acceptable: this is a read-only reporting view).
function adaptMigrationReport(sdk: SdkMigrationReportResponse): MigrationReport {
  return {
    id: sdk.id,
    job_id: sdk.job_id,
    generated_at: sdk.generated_at,
    summary: sdk.summary as unknown as ReportSummary,
    warnings: sdk.warnings as unknown as ReportWarning[],
    errors: sdk.errors as unknown as ReportError[],
    recommendations: sdk.recommendations as unknown as string[],
  };
}

// Map local CreateConnectionRequest → SDK shape. Local nests credentials
// under a ConnectionCredentials object; the SDK matches structurally so this
// is essentially a re-shape with explicit field selection.
function toSdkCreateConnectionRequest(req: CreateConnectionRequest): SdkCreateConnectionRequest {
  return {
    name: req.name,
    url: req.url,
    auth_type: req.auth_type,
    source_type: req.source_type,
    credentials: {
      token: req.credentials.token,
      username: req.credentials.username,
      password: req.credentials.password,
    },
  };
}

// Map local CreateMigrationRequest → SDK shape. SDK config is a free-form
// record; the local MigrationConfig is structurally compatible (all primitive
// or array fields), so we widen with `satisfies` rather than copying field by
// field.
function toSdkCreateMigrationRequest(req: CreateMigrationRequest): SdkCreateMigrationRequest {
  return {
    source_connection_id: req.source_connection_id,
    job_type: req.job_type,
    config: req.config as { [key: string]: unknown },
  };
}

// SDK declares list endpoints as `Array<T>`, but historically some deployments
// returned `{ items: [...] }`. Honor both shapes; treat anything else as empty.
// Warn on unrecognized non-null/undefined shapes so a backend regression is
// observable instead of silently producing an empty list.
function coerceItemsArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw == null) return [];
  const wrapped = raw as { items?: T[] };
  if (Array.isArray(wrapped.items)) return wrapped.items;
  console.warn(
    `[migration] coerceItemsArray: expected array or { items: [] }, got ${typeof raw} ` +
      `— treating as empty. The backend may have changed its response shape.`,
  );
  return [];
}

// Some paginated endpoints surface either a bare array or a `{ items, pagination }`
// wrapper. Synthesize a single-page pagination block when the response is bare.
//
// CAVEAT: when the backend returns a bare array, we have no way to know whether
// it's the full result or page-1-of-many. We optimistically synthesize
// `total_pages: 1` and `total: items.length`, which is correct for endpoints
// that return everything in one shot and incorrect for paged endpoints that
// elided the wrapper. UI consumers that depend on accurate `total` for
// "load more" pagination should pass an explicit `{ items, pagination }` from
// the backend rather than relying on this synthesis.
function coercePaginated<TSdk, TLocal>(
  raw: unknown,
  adapt: (sdk: TSdk) => TLocal,
): PaginatedResponse<TLocal> {
  if (Array.isArray(raw)) {
    const items = (raw as TSdk[]).map(adapt);
    console.warn(
      `[migration] coercePaginated: synthesizing pagination for bare-array response ` +
        `(${items.length} items). UIs that rely on accurate total/total_pages will ` +
        `not see additional pages — backend should return { items, pagination }.`,
    );
    return {
      items,
      pagination: { page: 1, per_page: items.length, total: items.length, total_pages: 1 },
    };
  }
  const wrapped = raw as {
    items?: TSdk[];
    pagination?: PaginatedResponse<TLocal>['pagination'];
  };
  const items = (wrapped.items ?? []).map(adapt);
  const pagination = wrapped.pagination ?? {
    page: 1,
    per_page: items.length,
    total: items.length,
    total_pages: 1,
  };
  return { items, pagination };
}

export const migrationApi = {
  // Source Connections
  listConnections: async (): Promise<SourceConnection[]> => {
    const { data, error } = await sdkListConnections();
    if (error) throw error;
    return coerceItemsArray<SdkConnectionResponse>(data).map(adaptSourceConnection);
  },

  createConnection: async (
    reqData: CreateConnectionRequest
  ): Promise<SourceConnection> => {
    const { data, error } = await sdkCreateConnection({
      body: toSdkCreateConnectionRequest(reqData),
    });
    if (error) throw error;
    return adaptSourceConnection(assertData(data, 'migrationApi.createConnection'));
  },

  getConnection: async (id: string): Promise<SourceConnection> => {
    const { data, error } = await sdkGetConnection({ path: { id } });
    if (error) throw error;
    return adaptSourceConnection(assertData(data, 'migrationApi.getConnection'));
  },

  deleteConnection: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteConnection({ path: { id } });
    if (error) throw error;
  },

  testConnection: async (id: string): Promise<ConnectionTestResult> => {
    const { data, error } = await sdkTestConnection({ path: { id } });
    if (error) throw error;
    return adaptConnectionTestResult(assertData(data, 'migrationApi.testConnection'));
  },

  listSourceRepositories: async (
    connectionId: string
  ): Promise<SourceRepository[]> => {
    const { data, error } = await sdkListSourceRepositories({ path: { id: connectionId } });
    if (error) throw error;
    return coerceItemsArray<SdkSourceRepository>(data).map(adaptSourceRepository);
  },

  // Migration Jobs
  listMigrations: async (params?: {
    status?: string;
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResponse<MigrationJob>> => {
    // SDK declares `query: { status, page, per_page }` with `string | null`
    // for status, but the local caller signature uses plain `string` — which
    // is structurally assignable, so no cast is needed.
    const { data, error } = await sdkListMigrations({ query: params });
    if (error) throw error;
    // SDK declares Array<MigrationJobResponse>; some deployments wrap in
    // { items, pagination } — accept both. Bare arrays get synthesized pagination.
    const raw = assertData(data, 'migrationApi.listMigrations');
    return coercePaginated<SdkMigrationJobResponse, MigrationJob>(raw, adaptMigrationJob);
  },

  createMigration: async (
    reqData: CreateMigrationRequest
  ): Promise<MigrationJob> => {
    const { data, error } = await sdkCreateMigration({
      body: toSdkCreateMigrationRequest(reqData),
    });
    if (error) throw error;
    return adaptMigrationJob(assertData(data, 'migrationApi.createMigration'));
  },

  getMigration: async (id: string): Promise<MigrationJob> => {
    const { data, error } = await sdkGetMigration({ path: { id } });
    if (error) throw error;
    return adaptMigrationJob(assertData(data, 'migrationApi.getMigration'));
  },

  deleteMigration: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteMigration({ path: { id } });
    if (error) throw error;
  },

  startMigration: async (id: string): Promise<MigrationJob> => {
    const { data, error } = await sdkStartMigration({ path: { id } });
    if (error) throw error;
    return adaptMigrationJob(assertData(data, 'migrationApi.startMigration'));
  },

  pauseMigration: async (id: string): Promise<MigrationJob> => {
    const { data, error } = await sdkPauseMigration({ path: { id } });
    if (error) throw error;
    return adaptMigrationJob(assertData(data, 'migrationApi.pauseMigration'));
  },

  resumeMigration: async (id: string): Promise<MigrationJob> => {
    const { data, error } = await sdkResumeMigration({ path: { id } });
    if (error) throw error;
    return adaptMigrationJob(assertData(data, 'migrationApi.resumeMigration'));
  },

  cancelMigration: async (id: string): Promise<MigrationJob> => {
    const { data, error } = await sdkCancelMigration({ path: { id } });
    if (error) throw error;
    return adaptMigrationJob(assertData(data, 'migrationApi.cancelMigration'));
  },

  listMigrationItems: async (
    jobId: string,
    params?: {
      status?: string;
      item_type?: string;
      page?: number;
      per_page?: number;
    }
  ): Promise<PaginatedResponse<MigrationItem>> => {
    const { data, error } = await sdkListMigrationItems({
      path: { id: jobId },
      query: params,
    });
    if (error) throw error;
    // Same dual-shape handling as listMigrations.
    const raw = assertData(data, 'migrationApi.listMigrationItems');
    return coercePaginated<SdkMigrationItemResponse, MigrationItem>(raw, adaptMigrationItem);
  },

  getMigrationReport: async (
    jobId: string,
    format: 'json' | 'html' = 'json'
  ): Promise<MigrationReport | string> => {
    const { data, error } = await sdkGetMigrationReport({
      path: { id: jobId },
      query: { format },
    });
    if (error) throw error;
    // For HTML the backend returns a raw string body which the SDK still
    // surfaces via `data`; pass it through. For JSON, structure it.
    const raw = assertData(data, 'migrationApi.getMigrationReport');
    if (format === 'html' && typeof raw === 'string') {
      return raw;
    }
    return adaptMigrationReport(raw as SdkMigrationReportResponse);
  },

  // Assessment
  runAssessment: async (jobId: string): Promise<MigrationJob> => {
    const { data, error } = await sdkRunAssessment({ path: { id: jobId } });
    if (error) throw error;
    return adaptMigrationJob(assertData(data, 'migrationApi.runAssessment'));
  },

  getAssessment: async (jobId: string): Promise<AssessmentResult> => {
    const { data, error } = await sdkGetAssessment({ path: { id: jobId } });
    if (error) throw error;
    return adaptAssessmentResult(assertData(data, 'migrationApi.getAssessment'));
  },

  // Download/stream tickets
  createStreamTicket: async (jobId: string): Promise<string> => {
    const body: SdkCreateTicketRequest = {
      purpose: 'stream',
      resource_path: `migration/${jobId}`,
    };
    const { data, error } = await sdkCreateDownloadTicket({ body });
    if (error) throw error;
    return assertData(data as TicketResponse | undefined, 'migrationApi.createStreamTicket').ticket;
  },

  // SSE Stream for progress — kept as native EventSource (not SDK)
  createProgressStream: async (jobId: string): Promise<EventSource> => {
    const url = new URL(`/api/v1/migrations/${jobId}/stream`, window.location.origin);
    try {
      const ticket = await migrationApi.createStreamTicket(jobId);
      url.searchParams.set('ticket', ticket);
    } catch {
      // Continue without ticket - backend may support cookie auth
    }
    return new EventSource(url.toString());
  },
};

export default migrationApi;
