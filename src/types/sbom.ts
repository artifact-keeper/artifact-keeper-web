// SBOM format types
export type SbomFormat = 'cyclonedx' | 'spdx';

// CVE status for tracking
export type CveStatus = 'open' | 'fixed' | 'acknowledged' | 'false_positive';

// Policy action for license violations
export type PolicyAction = 'allow' | 'warn' | 'block';

// SBOM document response (without content)
export interface SbomResponse {
  id: string;
  artifact_id: string;
  repository_id: string;
  format: string;
  format_version: string;
  spec_version: string | null;
  component_count: number;
  dependency_count: number;
  license_count: number;
  licenses: string[];
  content_hash: string;
  generator: string | null;
  generator_version: string | null;
  generated_at: string;
  created_at: string;
}

// SBOM document with full content
export interface SbomContentResponse extends SbomResponse {
  content: object;
}

// SBOM component extracted from an SBOM document
export interface SbomComponent {
  id: string;
  sbom_id: string;
  name: string;
  version: string | null;
  purl: string | null;
  cpe: string | null;
  component_type: string | null;
  licenses: string[];
  sha256: string | null;
  sha1: string | null;
  md5: string | null;
  supplier: string | null;
  author: string | null;
}

// CVE history entry for tracking vulnerability timeline
export interface CveHistoryEntry {
  id: string;
  artifact_id: string;
  sbom_id: string | null;
  component_id: string | null;
  scan_result_id: string | null;
  cve_id: string;
  affected_component: string | null;
  affected_version: string | null;
  fixed_version: string | null;
  severity: string | null;
  cvss_score: number | null;
  cve_published_at: string | null;
  first_detected_at: string;
  last_detected_at: string;
  status: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  acknowledged_reason: string | null;
  created_at: string;
  updated_at: string;
}

// CVE timeline entry for trending
export interface CveTimelineEntry {
  cve_id: string;
  severity: string;
  affected_component: string;
  cve_published_at: string | null;
  first_detected_at: string;
  status: CveStatus;
  days_exposed: number;
}

// CVE trends summary
export interface CveTrends {
  total_cves: number;
  open_cves: number;
  fixed_cves: number;
  acknowledged_cves: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  avg_days_to_fix: number | null;
  timeline: CveTimelineEntry[];
}

// License policy for a repository or globally
export interface LicensePolicy {
  id: string;
  repository_id: string | null;
  name: string;
  description: string | null;
  allowed_licenses: string[];
  denied_licenses: string[];
  allow_unknown: boolean;
  action: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string | null;
}

// License check result
export interface LicenseCheckResult {
  compliant: boolean;
  action: PolicyAction;
  violations: LicenseViolation[];
  warnings: string[];
}

export interface LicenseViolation {
  license: string;
  reason: string;
}

// Request types
export interface GenerateSbomRequest {
  artifact_id: string;
  format?: SbomFormat;
  force_regenerate?: boolean;
}

export interface ListSbomsParams {
  artifact_id?: string;
  repository_id?: string;
  format?: SbomFormat;
}

export interface ConvertSbomRequest {
  target_format: SbomFormat;
}

export interface UpdateCveStatusRequest {
  status: CveStatus;
  reason?: string;
}

export interface GetCveTrendsParams {
  repository_id?: string;
  days?: number;
}

export interface UpsertLicensePolicyRequest {
  repository_id?: string | null;
  name: string;
  description?: string;
  allowed_licenses: string[];
  denied_licenses: string[];
  allow_unknown?: boolean;
  action?: PolicyAction;
  is_enabled?: boolean;
}

export interface CheckLicenseComplianceRequest {
  licenses: string[];
  repository_id?: string;
}
