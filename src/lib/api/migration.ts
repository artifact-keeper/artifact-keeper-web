/* eslint-disable @typescript-eslint/no-explicit-any */
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

export const migrationApi = {
  // Source Connections
  listConnections: async (): Promise<SourceConnection[]> => {
    const { data, error } = await sdkListConnections();
    if (error) throw error;
    return (data as any)?.items ?? (data as any);
  },

  createConnection: async (
    reqData: CreateConnectionRequest
  ): Promise<SourceConnection> => {
    const { data, error } = await sdkCreateConnection({ body: reqData as any });
    if (error) throw error;
    return data as any;
  },

  getConnection: async (id: string): Promise<SourceConnection> => {
    const { data, error } = await sdkGetConnection({ path: { id } });
    if (error) throw error;
    return data as any;
  },

  deleteConnection: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteConnection({ path: { id } });
    if (error) throw error;
  },

  testConnection: async (id: string): Promise<ConnectionTestResult> => {
    const { data, error } = await sdkTestConnection({ path: { id } });
    if (error) throw error;
    return data as any;
  },

  listSourceRepositories: async (
    connectionId: string
  ): Promise<SourceRepository[]> => {
    const { data, error } = await sdkListSourceRepositories({ path: { id: connectionId } });
    if (error) throw error;
    return (data as any)?.items ?? (data as any);
  },

  // Migration Jobs
  listMigrations: async (params?: {
    status?: string;
    page?: number;
    per_page?: number;
  }): Promise<PaginatedResponse<MigrationJob>> => {
    const { data, error } = await sdkListMigrations({ query: params as any });
    if (error) throw error;
    return data as any;
  },

  createMigration: async (
    reqData: CreateMigrationRequest
  ): Promise<MigrationJob> => {
    const { data, error } = await sdkCreateMigration({ body: reqData as any });
    if (error) throw error;
    return data as any;
  },

  getMigration: async (id: string): Promise<MigrationJob> => {
    const { data, error } = await sdkGetMigration({ path: { id } });
    if (error) throw error;
    return data as any;
  },

  deleteMigration: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteMigration({ path: { id } });
    if (error) throw error;
  },

  startMigration: async (id: string): Promise<MigrationJob> => {
    const { data, error } = await sdkStartMigration({ path: { id } });
    if (error) throw error;
    return data as any;
  },

  pauseMigration: async (id: string): Promise<MigrationJob> => {
    const { data, error } = await sdkPauseMigration({ path: { id } });
    if (error) throw error;
    return data as any;
  },

  resumeMigration: async (id: string): Promise<MigrationJob> => {
    const { data, error } = await sdkResumeMigration({ path: { id } });
    if (error) throw error;
    return data as any;
  },

  cancelMigration: async (id: string): Promise<MigrationJob> => {
    const { data, error } = await sdkCancelMigration({ path: { id } });
    if (error) throw error;
    return data as any;
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
    const { data, error } = await sdkListMigrationItems({ path: { id: jobId }, query: params as any });
    if (error) throw error;
    return data as any;
  },

  getMigrationReport: async (
    jobId: string,
    format: 'json' | 'html' = 'json'
  ): Promise<MigrationReport | string> => {
    const { data, error } = await sdkGetMigrationReport({ path: { id: jobId }, query: { format } as any });
    if (error) throw error;
    return data as any;
  },

  // Assessment
  runAssessment: async (jobId: string): Promise<MigrationJob> => {
    const { data, error } = await sdkRunAssessment({ path: { id: jobId } });
    if (error) throw error;
    return data as any;
  },

  getAssessment: async (jobId: string): Promise<AssessmentResult> => {
    const { data, error } = await sdkGetAssessment({ path: { id: jobId } });
    if (error) throw error;
    return data as any;
  },

  // Download/stream tickets
  createStreamTicket: async (jobId: string): Promise<string> => {
    const { data, error } = await sdkCreateDownloadTicket({
      body: { purpose: 'stream', resource_path: `migration/${jobId}` } as any,
    });
    if (error) throw error;
    return (data as any).ticket;
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
