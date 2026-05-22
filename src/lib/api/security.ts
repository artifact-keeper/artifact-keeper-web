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
  DashboardResponse as SdkDashboardResponse,
  ScoreResponse as SdkScoreResponse,
  ScanResponse as SdkScanResponse,
  ScanListResponse as SdkScanListResponse,
  FindingResponse as SdkFindingResponse,
  FindingListResponse as SdkFindingListResponse,
  PolicyResponse as SdkPolicyResponse,
  ScanConfigResponse as SdkScanConfigResponse,
  RepoSecurityResponse as SdkRepoSecurityResponse,
  TriggerScanRequest as SdkTriggerScanRequest,
  TriggerScanResponse as SdkTriggerScanResponse,
  CreatePolicyRequest as SdkCreatePolicyRequest,
  UpdatePolicyRequest as SdkUpdatePolicyRequest,
  UpsertScanConfigRequest as SdkUpsertScanConfigRequest,
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
import { assertData } from '@/lib/api/fetch';

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

// Adapters: SDK uses `?: T | null` for fields the local types declare as
// `: T | null`. Coerce undefined → null for stable rendering (#206 / #359).

function adaptDashboard(sdk: SdkDashboardResponse): DashboardSummary {
  return {
    repos_with_scanning: sdk.repos_with_scanning,
    total_scans: sdk.total_scans,
    total_findings: sdk.total_findings,
    critical_findings: sdk.critical_findings,
    high_findings: sdk.high_findings,
    policy_violations_blocked: sdk.policy_violations_blocked,
    repos_grade_a: sdk.repos_grade_a,
    repos_grade_f: sdk.repos_grade_f,
  };
}

function adaptScore(sdk: SdkScoreResponse): RepoSecurityScore {
  return {
    id: sdk.id,
    repository_id: sdk.repository_id,
    score: sdk.score,
    grade: sdk.grade,
    total_findings: sdk.critical_count + sdk.high_count + sdk.medium_count + sdk.low_count,
    critical_count: sdk.critical_count,
    high_count: sdk.high_count,
    medium_count: sdk.medium_count,
    low_count: sdk.low_count,
    acknowledged_count: sdk.acknowledged_count,
    last_scan_at: sdk.last_scan_at ?? null,
    calculated_at: sdk.calculated_at,
  };
}

function adaptScan(sdk: SdkScanResponse): ScanResult {
  return {
    id: sdk.id,
    artifact_id: sdk.artifact_id,
    artifact_name: sdk.artifact_name ?? null,
    artifact_version: sdk.artifact_version ?? null,
    repository_id: sdk.repository_id,
    scan_type: sdk.scan_type,
    status: sdk.status,
    findings_count: sdk.findings_count,
    critical_count: sdk.critical_count,
    high_count: sdk.high_count,
    medium_count: sdk.medium_count,
    low_count: sdk.low_count,
    info_count: sdk.info_count,
    scanner_version: sdk.scanner_version ?? null,
    error_message: sdk.error_message ?? null,
    started_at: sdk.started_at ?? null,
    completed_at: sdk.completed_at ?? null,
    created_at: sdk.created_at,
  };
}

function adaptScanList(sdk: SdkScanListResponse): ScanListResponse {
  return { items: sdk.items.map(adaptScan), total: sdk.total };
}

function adaptFinding(sdk: SdkFindingResponse): ScanFinding {
  return {
    id: sdk.id,
    scan_result_id: sdk.scan_result_id,
    artifact_id: sdk.artifact_id,
    severity: sdk.severity,
    title: sdk.title,
    description: sdk.description ?? null,
    cve_id: sdk.cve_id ?? null,
    affected_component: sdk.affected_component ?? null,
    affected_version: sdk.affected_version ?? null,
    fixed_version: sdk.fixed_version ?? null,
    source: sdk.source ?? null,
    source_url: sdk.source_url ?? null,
    is_acknowledged: sdk.is_acknowledged,
    acknowledged_by: sdk.acknowledged_by ?? null,
    acknowledged_reason: sdk.acknowledged_reason ?? null,
    acknowledged_at: sdk.acknowledged_at ?? null,
    created_at: sdk.created_at,
  };
}

function adaptFindingList(sdk: SdkFindingListResponse): FindingListResponse {
  return { items: sdk.items.map(adaptFinding), total: sdk.total };
}

// SDK PolicyResponse declares optional fields the local ScanPolicy doesn't
// model (max_artifact_age_days, min_staging_hours, require_signature) —
// they're consumed elsewhere by the lifecycle module, not here. The local
// type intentionally omits them; the adapter intentionally drops them.
function adaptPolicy(sdk: SdkPolicyResponse): ScanPolicy {
  return {
    id: sdk.id,
    name: sdk.name,
    repository_id: sdk.repository_id ?? null,
    max_severity: sdk.max_severity,
    block_unscanned: sdk.block_unscanned,
    block_on_fail: sdk.block_on_fail,
    is_enabled: sdk.is_enabled,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
  };
}

function adaptScanConfig(sdk: SdkScanConfigResponse): ScanConfig {
  return {
    id: sdk.id,
    repository_id: sdk.repository_id,
    scan_enabled: sdk.scan_enabled,
    scan_on_upload: sdk.scan_on_upload,
    scan_on_proxy: sdk.scan_on_proxy,
    block_on_policy_violation: sdk.block_on_policy_violation,
    severity_threshold: sdk.severity_threshold,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
  };
}

function adaptRepoSecurity(sdk: SdkRepoSecurityResponse): RepoSecurityInfo {
  return {
    config: sdk.config ? adaptScanConfig(sdk.config) : null,
    score: sdk.score ? adaptScore(sdk.score) : null,
  };
}

function adaptTriggerScanResponse(sdk: SdkTriggerScanResponse): TriggerScanResponse {
  return {
    message: sdk.message,
    artifacts_queued: sdk.artifacts_queued,
  };
}

function adaptTriggerRequest(req: TriggerScanRequest): SdkTriggerScanRequest {
  return {
    artifact_id: req.artifact_id,
    repository_id: req.repository_id,
  };
}

function adaptCreatePolicyRequest(req: CreatePolicyRequest): SdkCreatePolicyRequest {
  return {
    name: req.name,
    repository_id: req.repository_id,
    max_severity: req.max_severity,
    block_unscanned: req.block_unscanned,
    block_on_fail: req.block_on_fail,
  };
}

function adaptUpdatePolicyRequest(req: UpdatePolicyRequest): SdkUpdatePolicyRequest {
  return {
    name: req.name,
    max_severity: req.max_severity,
    block_unscanned: req.block_unscanned,
    block_on_fail: req.block_on_fail,
    is_enabled: req.is_enabled,
  };
}

function adaptUpsertConfigRequest(
  req: UpsertScanConfigRequest,
): SdkUpsertScanConfigRequest {
  return {
    scan_enabled: req.scan_enabled,
    scan_on_upload: req.scan_on_upload,
    scan_on_proxy: req.scan_on_proxy,
    block_on_policy_violation: req.block_on_policy_violation,
    severity_threshold: req.severity_threshold,
  };
}

const securityApi = {
  // Dashboard
  getDashboard: async (): Promise<DashboardSummary> => {
    const { data, error } = await sdkGetDashboard();
    if (error) throw error;
    return adaptDashboard(assertData(data, 'securityApi.getDashboard'));
  },

  // Scores
  getAllScores: async (): Promise<RepoSecurityScore[]> => {
    const { data, error } = await sdkGetAllScores();
    if (error) throw error;
    return assertData(data, 'securityApi.getAllScores').map(adaptScore);
  },

  // Scan operations
  triggerScan: async (
    req: TriggerScanRequest,
  ): Promise<TriggerScanResponse> => {
    const { data, error } = await sdkTriggerScan({
      body: adaptTriggerRequest(req),
    });
    if (error) throw error;
    return adaptTriggerScanResponse(
      assertData(data, 'securityApi.triggerScan'),
    );
  },

  listScans: async (params?: ListScansParams): Promise<ScanListResponse> => {
    const { data, error } = await sdkListScans({ query: params });
    if (error) throw error;
    return adaptScanList(assertData(data, 'securityApi.listScans'));
  },

  getScan: async (id: string): Promise<ScanResult> => {
    const { data, error } = await sdkGetScan({ path: { id } });
    if (error) throw error;
    return adaptScan(assertData(data, 'securityApi.getScan'));
  },

  listFindings: async (
    scanId: string,
    params?: ListFindingsParams,
  ): Promise<FindingListResponse> => {
    const { data, error } = await sdkListFindings({
      path: { id: scanId },
      query: params,
    });
    if (error) throw error;
    return adaptFindingList(assertData(data, 'securityApi.listFindings'));
  },

  // Finding acknowledgment
  acknowledgeFinding: async (
    findingId: string,
    reason: string,
  ): Promise<ScanFinding> => {
    const { data, error } = await sdkAcknowledgeFinding({
      path: { id: findingId },
      body: { reason },
    });
    if (error) throw error;
    return adaptFinding(assertData(data, 'securityApi.acknowledgeFinding'));
  },

  revokeAcknowledgment: async (findingId: string): Promise<ScanFinding> => {
    const { data, error } = await sdkRevokeAcknowledgment({
      path: { id: findingId },
    });
    if (error) throw error;
    return adaptFinding(
      assertData(data, 'securityApi.revokeAcknowledgment'),
    );
  },

  // Policy CRUD
  listPolicies: async (): Promise<ScanPolicy[]> => {
    const { data, error } = await sdkListPolicies();
    if (error) throw error;
    return assertData(data, 'securityApi.listPolicies').map(adaptPolicy);
  },

  createPolicy: async (req: CreatePolicyRequest): Promise<ScanPolicy> => {
    const { data, error } = await sdkCreatePolicy({
      body: adaptCreatePolicyRequest(req),
    });
    if (error) throw error;
    return adaptPolicy(assertData(data, 'securityApi.createPolicy'));
  },

  getPolicy: async (id: string): Promise<ScanPolicy> => {
    const { data, error } = await sdkGetPolicy({ path: { id } });
    if (error) throw error;
    return adaptPolicy(assertData(data, 'securityApi.getPolicy'));
  },

  updatePolicy: async (
    id: string,
    req: UpdatePolicyRequest,
  ): Promise<ScanPolicy> => {
    const { data, error } = await sdkUpdatePolicy({
      path: { id },
      body: adaptUpdatePolicyRequest(req),
    });
    if (error) throw error;
    return adaptPolicy(assertData(data, 'securityApi.updatePolicy'));
  },

  deletePolicy: async (id: string): Promise<void> => {
    const { error } = await sdkDeletePolicy({ path: { id } });
    if (error) throw error;
  },

  // Repo-scoped security
  getRepoSecurity: async (repoKey: string): Promise<RepoSecurityInfo> => {
    const { data, error } = await sdkGetRepoSecurity({
      path: { key: repoKey },
    });
    if (error) throw error;
    return adaptRepoSecurity(
      assertData(data, 'securityApi.getRepoSecurity'),
    );
  },

  updateRepoSecurity: async (
    repoKey: string,
    req: UpsertScanConfigRequest,
  ): Promise<ScanConfig> => {
    const { data, error } = await sdkUpdateRepoSecurity({
      path: { key: repoKey },
      body: adaptUpsertConfigRequest(req),
    });
    if (error) throw error;
    return adaptScanConfig(
      assertData(data, 'securityApi.updateRepoSecurity'),
    );
  },

  listRepoScans: async (
    repoKey: string,
    params?: ListScansParams,
  ): Promise<ScanListResponse> => {
    const { data, error } = await sdkListRepoScans({
      path: { key: repoKey },
      query: params,
    });
    if (error) throw error;
    return adaptScanList(assertData(data, 'securityApi.listRepoScans'));
  },

  listArtifactScans: async (
    artifactId: string,
    params?: ListScansParams,
  ): Promise<ScanListResponse> => {
    const { data, error } = await sdkListArtifactScans({
      path: { artifact_id: artifactId },
      query: params,
    });
    if (error) throw error;
    return adaptScanList(
      assertData(data, 'securityApi.listArtifactScans'),
    );
  },
};

export default securityApi;
