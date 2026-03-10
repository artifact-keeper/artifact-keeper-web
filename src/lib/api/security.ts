import '@/lib/sdk-client';
import {
  getDashboard as sdkGetDashboard,
  getAllScores as sdkGetAllScores,
  triggerScan as sdkTriggerScan,
  listScans as sdkListScans,
  getScan as sdkGetScan,
  listFindings as sdkListFindings,
  acknowledgeFinding as sdkAcknowledgeFinding,
  revokeAcknowledgment as sdkRevokeAcknowledgment,
  listPolicies as sdkListPolicies,
  createPolicy as sdkCreatePolicy,
  getPolicy as sdkGetPolicy,
  updatePolicy as sdkUpdatePolicy,
  deletePolicy as sdkDeletePolicy,
  getRepoSecurity as sdkGetRepoSecurity,
  updateRepoSecurity as sdkUpdateRepoSecurity,
  listRepoScans as sdkListRepoScans,
  listArtifactScans as sdkListArtifactScans,
} from '@artifact-keeper/sdk';
import type {
  DashboardSummary,
  RepoSecurityScore,
  ScanResult,
  ScanFinding,
  ScanPolicy,
  ScanConfig,
  RepoSecurityInfo,
  CreatePolicyRequest,
  UpdatePolicyRequest,
  TriggerScanRequest,
  TriggerScanResponse,
  UpsertScanConfigRequest,
} from '@/types/security';

export interface ScanListResponse {
  items: ScanResult[];
  total: number;
}

export interface FindingListResponse {
  items: ScanFinding[];
  total: number;
}

export interface ListScansParams {
  repository_id?: string;
  artifact_id?: string;
  status?: string;
  page?: number;
  per_page?: number;
}

export interface ListFindingsParams {
  page?: number;
  per_page?: number;
}

const securityApi = {
  // Dashboard
  getDashboard: async (): Promise<DashboardSummary> => {
    const { data, error } = await sdkGetDashboard();
    if (error) throw error;
    return data as never;
  },

  // Scores
  getAllScores: async (): Promise<RepoSecurityScore[]> => {
    const { data, error } = await sdkGetAllScores();
    if (error) throw error;
    return data as never;
  },

  // Scan operations
  triggerScan: async (req: TriggerScanRequest): Promise<TriggerScanResponse> => {
    const { data, error } = await sdkTriggerScan({ body: req as never });
    if (error) throw error;
    return data as never;
  },

  listScans: async (params?: ListScansParams): Promise<ScanListResponse> => {
    const { data, error } = await sdkListScans({ query: params as never });
    if (error) throw error;
    return data as never;
  },

  getScan: async (id: string): Promise<ScanResult> => {
    const { data, error } = await sdkGetScan({ path: { id } });
    if (error) throw error;
    return data as never;
  },

  listFindings: async (scanId: string, params?: ListFindingsParams): Promise<FindingListResponse> => {
    const { data, error } = await sdkListFindings({ path: { id: scanId }, query: params as never });
    if (error) throw error;
    return data as never;
  },

  // Finding acknowledgment
  acknowledgeFinding: async (findingId: string, reason: string): Promise<ScanFinding> => {
    const { data, error } = await sdkAcknowledgeFinding({ path: { id: findingId }, body: { reason } as never });
    if (error) throw error;
    return data as never;
  },

  revokeAcknowledgment: async (findingId: string): Promise<ScanFinding> => {
    const { data, error } = await sdkRevokeAcknowledgment({ path: { id: findingId } });
    if (error) throw error;
    return data as never;
  },

  // Policy CRUD
  listPolicies: async (): Promise<ScanPolicy[]> => {
    const { data, error } = await sdkListPolicies();
    if (error) throw error;
    return data as never;
  },

  createPolicy: async (req: CreatePolicyRequest): Promise<ScanPolicy> => {
    const { data, error } = await sdkCreatePolicy({ body: req as never });
    if (error) throw error;
    return data as never;
  },

  getPolicy: async (id: string): Promise<ScanPolicy> => {
    const { data, error } = await sdkGetPolicy({ path: { id } });
    if (error) throw error;
    return data as never;
  },

  updatePolicy: async (id: string, req: UpdatePolicyRequest): Promise<ScanPolicy> => {
    const { data, error } = await sdkUpdatePolicy({ path: { id }, body: req as never });
    if (error) throw error;
    return data as never;
  },

  deletePolicy: async (id: string): Promise<void> => {
    const { error } = await sdkDeletePolicy({ path: { id } });
    if (error) throw error;
  },

  // Repo-scoped security
  getRepoSecurity: async (repoKey: string): Promise<RepoSecurityInfo> => {
    const { data, error } = await sdkGetRepoSecurity({ path: { key: repoKey } });
    if (error) throw error;
    return data as never;
  },

  updateRepoSecurity: async (repoKey: string, req: UpsertScanConfigRequest): Promise<ScanConfig> => {
    const { data, error } = await sdkUpdateRepoSecurity({ path: { key: repoKey }, body: req as never });
    if (error) throw error;
    return data as never;
  },

  listRepoScans: async (repoKey: string, params?: ListScansParams): Promise<ScanListResponse> => {
    const { data, error } = await sdkListRepoScans({ path: { key: repoKey }, query: params as never });
    if (error) throw error;
    return data as never;
  },

  listArtifactScans: async (artifactId: string, params?: ListScansParams): Promise<ScanListResponse> => {
    const { data, error } = await sdkListArtifactScans({ path: { artifact_id: artifactId }, query: params as never });
    if (error) throw error;
    return data as never;
  },
};

export default securityApi;
