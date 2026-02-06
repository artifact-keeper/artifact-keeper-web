// Promotion workflow types for staging -> release promotion

export interface PolicyViolation {
  rule: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  details?: Record<string, unknown>;
}

export interface CveSummary {
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  total_count: number;
  open_cves: string[];
}

export interface LicenseSummary {
  licenses_found: string[];
  denied_licenses: string[];
  unknown_licenses: string[];
}

export interface PolicyEvaluationResult {
  passed: boolean;
  action: 'allow' | 'warn' | 'block';
  violations: PolicyViolation[];
  cve_summary?: CveSummary;
  license_summary?: LicenseSummary;
}

export interface PromoteArtifactRequest {
  target_repository: string;
  skip_policy_check?: boolean;
  notes?: string;
}

export interface BulkPromoteRequest {
  target_repository: string;
  artifact_ids: string[];
  skip_policy_check?: boolean;
  notes?: string;
}

export interface PromotionResponse {
  promoted: boolean;
  source: string;
  target: string;
  promotion_id?: string;
  policy_violations: PolicyViolation[];
  message?: string;
}

export interface BulkPromotionResponse {
  total: number;
  promoted: number;
  failed: number;
  results: PromotionResponse[];
}

export interface PromotionHistoryEntry {
  id: string;
  artifact_id: string;
  artifact_path: string;
  source_repo_key: string;
  target_repo_key: string;
  promoted_by?: string;
  promoted_by_username?: string;
  policy_result?: PolicyEvaluationResult;
  notes?: string;
  created_at: string;
}

export interface PromotionHistoryResponse {
  items: PromotionHistoryEntry[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

// Staging artifact extends base Artifact with policy status
export interface StagingArtifact {
  id: string;
  repository_key: string;
  path: string;
  name: string;
  version?: string;
  size_bytes: number;
  checksum_sha256: string;
  content_type: string;
  download_count: number;
  created_at: string;
  // Policy evaluation status
  policy_status?: 'passing' | 'failing' | 'pending' | 'warning';
  policy_result?: PolicyEvaluationResult;
}

// Badge colors for policy status
export const POLICY_STATUS_COLORS = {
  passing: 'bg-green-500/10 text-green-500 border-green-500/20',
  failing: 'bg-red-500/10 text-red-500 border-red-500/20',
  warning: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  pending: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
} as const;

// Severity colors for violations
export const SEVERITY_COLORS = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-blue-500 text-white',
  info: 'bg-gray-500 text-white',
} as const;
