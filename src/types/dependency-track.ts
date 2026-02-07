export interface DtStatus {
  enabled: boolean;
  healthy: boolean;
  url: string | null;
}

export interface DtProject {
  uuid: string;
  name: string;
  version: string | null;
  description: string | null;
  lastBomImport: number | null;
  lastBomImportFormat: string | null;
}

export interface DtComponent {
  uuid: string;
  name: string;
  version: string | null;
  group: string | null;
  purl: string | null;
}

export interface DtVulnerability {
  uuid: string;
  vulnId: string;
  source: string;
  severity: string;
  title: string | null;
  description: string | null;
  cvssV3BaseScore: number | null;
  cwe: { cweId: number; name: string } | null;
}

export interface DtAnalysis {
  state: string | null;
  justification: string | null;
  response: string | null;
  details: string | null;
  isSuppressed: boolean;
}

export interface DtAttribution {
  analyzerIdentity: string | null;
  attributedOn: number | null;
}

export interface DtFinding {
  component: DtComponent;
  vulnerability: DtVulnerability;
  analysis: DtAnalysis | null;
  attribution: DtAttribution | null;
}

export interface DtProjectMetrics {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unassigned: number;
  vulnerabilities: number | null;
  findingsTotal: number;
  findingsAudited: number;
  findingsUnaudited: number;
  suppressions: number;
  inheritedRiskScore: number;
  policyViolationsFail: number;
  policyViolationsWarn: number;
  policyViolationsInfo: number;
  policyViolationsTotal: number;
  firstOccurrence: number | null;
  lastOccurrence: number | null;
}

export interface DtPortfolioMetrics {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unassigned: number;
  findingsTotal: number;
  findingsAudited: number;
  findingsUnaudited: number;
  inheritedRiskScore: number;
  policyViolationsFail: number;
  policyViolationsWarn: number;
  policyViolationsInfo: number;
  policyViolationsTotal: number;
  projects: number;
}

export interface DtComponentFull {
  uuid: string;
  name: string;
  version: string | null;
  group: string | null;
  purl: string | null;
  cpe: string | null;
  resolvedLicense: { uuid: string | null; licenseId: string | null; name: string } | null;
  isInternal: boolean | null;
}

export interface DtPolicyCondition {
  uuid: string;
  subject: string;
  operator: string;
  value: string;
  policy: { uuid: string; name: string; violationState: string };
}

export interface DtPolicyViolation {
  uuid: string;
  type: string;
  component: DtComponent;
  policyCondition: DtPolicyCondition;
}

export interface DtPolicyFull {
  uuid: string;
  name: string;
  violationState: string;
  includeChildren: boolean | null;
  policyConditions: { uuid: string; subject: string; operator: string; value: string }[];
  projects: DtProject[];
  tags: unknown[];
}

export interface DtAnalysisResponse {
  analysisState: string;
  analysisJustification: string | null;
  analysisDetails: string | null;
  isSuppressed: boolean;
}

export interface UpdateAnalysisRequest {
  project_uuid: string;
  component_uuid: string;
  vulnerability_uuid: string;
  state: string;
  justification?: string;
  details?: string;
  suppressed?: boolean;
}
