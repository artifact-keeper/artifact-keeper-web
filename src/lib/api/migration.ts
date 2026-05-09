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
} from '@artifact-keeper/sdk';
import type {
  SourceConnection,
  CreateConnectionRequest,
  ConnectionTestResult,
  SourceRepository,
  MigrationJob,
  CreateMigrationRequest,
  MigrationItem,
  MigrationReport,
  AssessmentResult,
  PaginatedResponse,
} from '@/types';
import { assertData } from '@/lib/api/fetch';

// SDK ConnectionResponse exposes auth_type as `string`; the local AuthType is
// a narrowed union. Default unrecognized values to 'api_token' rather than
// throwing — list endpoints should still render even with stale enum entries.
function narrowAuthType(v: string): SourceConnection['auth_type'] {
  return v === 'basic_auth' ? 'basic_auth' : 'api_token';
}

function adaptSourceConnection(sdk: SdkConnectionResponse): SourceConnection {
  return {
    id: sdk.id,
    name: sdk.name,
    url: sdk.url,
    auth_type: narrowAuthType(sdk.auth_type),
    created_at: sdk.created_at,
    verified_at: sdk.verified_at ?? undefined,
  };
}

function narrowSourceRepoType(v: string): SourceRepository['type'] {
  return v === 'remote' || v === 'virtual' ? v : 'local';
}

function adaptSourceRepository(sdk: SdkSourceRepository): SourceRepository {
  return {
    key: sdk.key,
    type: narrowSourceRepoType(sdk.type),
    package_type: sdk.package_type,
    url: sdk.url,
    description: sdk.description ?? undefined,
  };
}

export const migrationApi = {
  // Source Connections
  listConnections: async (): Promise<SourceConnection[]> => {
    const { data, error } = await sdkListConnections();
    if (error) throw error;
    // SDK declares the response as Array<ConnectionResponse>, but historically
    // some deployments returned `{ items: [...] }`. Honor both shapes.
    const raw: unknown = data;
    const arr: SdkConnectionResponse[] = Array.isArray(raw)
      ? (raw as SdkConnectionResponse[])
      : ((raw as { items?: SdkConnectionResponse[] } | undefined)?.items ?? []);
    return arr.map(adaptSourceConnection);
  },

  createConnection: async (
    reqData: CreateConnectionRequest
  ): Promise<SourceConnection> => {
    const { data, error } = await sdkCreateConnection({ body: reqData as never });
    if (error) throw error;
    return data as never;
  },

  getConnection: async (id: string): Promise<SourceConnection> => {
    const { data, error } = await sdkGetConnection({ path: { id } });
    if (error) throw error;
    return data as never;
  },

  deleteConnection: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteConnection({ path: { id } });
    if (error) throw error;
  },

  testConnection: async (id: string): Promise<ConnectionTestResult> => {
    const { data, error } = await sdkTestConnection({ path: { id } });
    if (error) throw error;
    return data as never;
  },

  listSourceRepositories: async (
    connectionId: string
  ): Promise<SourceRepository[]> => {
    const { data, error } = await sdkListSourceRepositories({ path: { id: connectionId } });
    if (error) throw error;
    // SDK declares an Array; defensively accept `{ items: [] }` for older servers.
    const raw: unknown = data;
    const arr: SdkSourceRepository[] = Array.isArray(raw)
      ? (raw as SdkSourceRepository[])
      : ((raw as { items?: SdkSourceRepository[] } | undefined)?.items ?? []);
    return arr.map(adaptSourceRepository);
  },

  // Migration Jobs
  listMigrations: async (params?: {
    status?: string;
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResponse<MigrationJob>> => {
    const { data, error } = await sdkListMigrations({ query: params as never });
    if (error) throw error;
    return data as never;
  },

  createMigration: async (
    reqData: CreateMigrationRequest
  ): Promise<MigrationJob> => {
    const { data, error } = await sdkCreateMigration({ body: reqData as never });
    if (error) throw error;
    return data as never;
  },

  getMigration: async (id: string): Promise<MigrationJob> => {
    const { data, error } = await sdkGetMigration({ path: { id } });
    if (error) throw error;
    return data as never;
  },

  deleteMigration: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteMigration({ path: { id } });
    if (error) throw error;
  },

  startMigration: async (id: string): Promise<MigrationJob> => {
    const { data, error } = await sdkStartMigration({ path: { id } });
    if (error) throw error;
    return data as never;
  },

  pauseMigration: async (id: string): Promise<MigrationJob> => {
    const { data, error } = await sdkPauseMigration({ path: { id } });
    if (error) throw error;
    return data as never;
  },

  resumeMigration: async (id: string): Promise<MigrationJob> => {
    const { data, error } = await sdkResumeMigration({ path: { id } });
    if (error) throw error;
    return data as never;
  },

  cancelMigration: async (id: string): Promise<MigrationJob> => {
    const { data, error } = await sdkCancelMigration({ path: { id } });
    if (error) throw error;
    return data as never;
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
    const { data, error } = await sdkListMigrationItems({ path: { id: jobId }, query: params as never });
    if (error) throw error;
    return data as never;
  },

  getMigrationReport: async (
    jobId: string,
    format: 'json' | 'html' = 'json'
  ): Promise<MigrationReport | string> => {
    const { data, error } = await sdkGetMigrationReport({ path: { id: jobId }, query: { format } as never });
    if (error) throw error;
    return data as never;
  },

  // Assessment
  runAssessment: async (jobId: string): Promise<MigrationJob> => {
    const { data, error } = await sdkRunAssessment({ path: { id: jobId } });
    if (error) throw error;
    return data as never;
  },

  getAssessment: async (jobId: string): Promise<AssessmentResult> => {
    const { data, error } = await sdkGetAssessment({ path: { id: jobId } });
    if (error) throw error;
    return data as never;
  },

  // Download/stream tickets
  createStreamTicket: async (jobId: string): Promise<string> => {
    const { data, error } = await sdkCreateDownloadTicket({
      body: { purpose: 'stream', resource_path: `migration/${jobId}` } as never,
    });
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
