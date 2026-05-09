import '@/lib/sdk-client';
import {
  dtStatus as sdkDtStatus,
  listProjects as sdkListProjects,
  getProjectFindings as sdkGetProjectFindings,
  getProjectComponents as sdkGetProjectComponents,
  getProjectMetrics as sdkGetProjectMetrics,
  getProjectMetricsHistory as sdkGetProjectMetricsHistory,
  getProjectViolations as sdkGetProjectViolations,
  getPortfolioMetrics as sdkGetPortfolioMetrics,
  updateAnalysis as sdkUpdateAnalysis,
  listDependencyTrackPolicies as sdkListDependencyTrackPolicies,
} from '@artifact-keeper/sdk';
import type {
  DtStatusResponse as SdkDtStatusResponse,
  DtProject as SdkDtProject,
  DtFinding as SdkDtFinding,
  DtComponent as SdkDtComponent,
  DtComponentFull as SdkDtComponentFull,
  DtVulnerability as SdkDtVulnerability,
  DtAnalysis as SdkDtAnalysis,
  DtAttribution as SdkDtAttribution,
  DtProjectMetrics as SdkDtProjectMetrics,
  DtPortfolioMetrics as SdkDtPortfolioMetrics,
  DtPolicyViolation as SdkDtPolicyViolation,
  DtPolicyCondition as SdkDtPolicyCondition,
  DtPolicyFull as SdkDtPolicyFull,
  DtPolicyConditionFull as SdkDtPolicyConditionFull,
  DtAnalysisResponse as SdkDtAnalysisResponse,
  DtCwe as SdkDtCwe,
  DtLicense as SdkDtLicense,
  UpdateAnalysisBody as SdkUpdateAnalysisBody,
} from '@artifact-keeper/sdk';
import type {
  DtStatus,
  DtProject,
  DtFinding,
  DtComponent,
  DtComponentFull,
  DtVulnerability,
  DtAnalysis,
  DtAttribution,
  DtProjectMetrics,
  DtPortfolioMetrics,
  DtPolicyViolation,
  DtPolicyCondition,
  DtPolicyFull,
  DtAnalysisResponse,
  UpdateAnalysisRequest,
} from '@/types/dependency-track';
import { assertData } from '@/lib/api/fetch';

// Adapters: SDK types use `?: T | null` (optional+nullable) for fields that
// the local types declare as required-but-nullable (`: T | null`). The
// metrics types declare every counter as `?: number`; local types declare
// them as required `: number`. Coerce undefined → null for nullable strings,
// undefined → 0 for numeric metrics. (#206 / #359)

function adaptStatus(sdk: SdkDtStatusResponse): DtStatus {
  return {
    enabled: sdk.enabled,
    healthy: sdk.healthy,
    url: sdk.url ?? null,
  };
}

function adaptProject(sdk: SdkDtProject): DtProject {
  return {
    uuid: sdk.uuid,
    name: sdk.name,
    version: sdk.version ?? null,
    description: sdk.description ?? null,
    lastBomImport: sdk.lastBomImport ?? null,
    lastBomImportFormat: sdk.lastBomImportFormat ?? null,
  };
}

function adaptComponent(sdk: SdkDtComponent): DtComponent {
  return {
    uuid: sdk.uuid,
    name: sdk.name,
    version: sdk.version ?? null,
    group: sdk.group ?? null,
    purl: sdk.purl ?? null,
  };
}

function adaptCwe(sdk: SdkDtCwe): { cweId: number; name: string } {
  return { cweId: sdk.cweId, name: sdk.name };
}

function adaptVulnerability(sdk: SdkDtVulnerability): DtVulnerability {
  return {
    uuid: sdk.uuid,
    vulnId: sdk.vulnId,
    source: sdk.source,
    severity: sdk.severity,
    title: sdk.title ?? null,
    description: sdk.description ?? null,
    cvssV3BaseScore: sdk.cvssV3BaseScore ?? null,
    cwe: sdk.cwe ? adaptCwe(sdk.cwe) : null,
  };
}

function adaptAnalysis(sdk: SdkDtAnalysis): DtAnalysis {
  return {
    state: sdk.state ?? null,
    justification: sdk.justification ?? null,
    response: sdk.response ?? null,
    details: sdk.details ?? null,
    isSuppressed: sdk.isSuppressed,
  };
}

function adaptAttribution(sdk: SdkDtAttribution): DtAttribution {
  return {
    analyzerIdentity: sdk.analyzerIdentity ?? null,
    attributedOn: sdk.attributedOn ?? null,
  };
}

function adaptFinding(sdk: SdkDtFinding): DtFinding {
  return {
    component: adaptComponent(sdk.component),
    vulnerability: adaptVulnerability(sdk.vulnerability),
    analysis: sdk.analysis ? adaptAnalysis(sdk.analysis) : null,
    attribution: sdk.attribution ? adaptAttribution(sdk.attribution) : null,
  };
}

function adaptLicense(
  sdk: SdkDtLicense,
): { uuid: string | null; licenseId: string | null; name: string } {
  return {
    uuid: sdk.uuid ?? null,
    licenseId: sdk.licenseId ?? null,
    name: sdk.name,
  };
}

function adaptComponentFull(sdk: SdkDtComponentFull): DtComponentFull {
  return {
    uuid: sdk.uuid,
    name: sdk.name,
    version: sdk.version ?? null,
    group: sdk.group ?? null,
    purl: sdk.purl ?? null,
    cpe: sdk.cpe ?? null,
    resolvedLicense: sdk.resolvedLicense ? adaptLicense(sdk.resolvedLicense) : null,
    isInternal: sdk.isInternal ?? null,
  };
}

function adaptProjectMetrics(sdk: SdkDtProjectMetrics): DtProjectMetrics {
  return {
    critical: sdk.critical ?? 0,
    high: sdk.high ?? 0,
    medium: sdk.medium ?? 0,
    low: sdk.low ?? 0,
    unassigned: sdk.unassigned ?? 0,
    vulnerabilities: sdk.vulnerabilities ?? null,
    findingsTotal: sdk.findingsTotal ?? 0,
    findingsAudited: sdk.findingsAudited ?? 0,
    findingsUnaudited: sdk.findingsUnaudited ?? 0,
    suppressions: sdk.suppressions ?? 0,
    inheritedRiskScore: sdk.inheritedRiskScore ?? 0,
    policyViolationsFail: sdk.policyViolationsFail ?? 0,
    policyViolationsWarn: sdk.policyViolationsWarn ?? 0,
    policyViolationsInfo: sdk.policyViolationsInfo ?? 0,
    policyViolationsTotal: sdk.policyViolationsTotal ?? 0,
    firstOccurrence: sdk.firstOccurrence ?? null,
    lastOccurrence: sdk.lastOccurrence ?? null,
  };
}

function adaptPortfolioMetrics(
  sdk: SdkDtPortfolioMetrics,
): DtPortfolioMetrics {
  return {
    critical: sdk.critical ?? 0,
    high: sdk.high ?? 0,
    medium: sdk.medium ?? 0,
    low: sdk.low ?? 0,
    unassigned: sdk.unassigned ?? 0,
    findingsTotal: sdk.findingsTotal ?? 0,
    findingsAudited: sdk.findingsAudited ?? 0,
    findingsUnaudited: sdk.findingsUnaudited ?? 0,
    inheritedRiskScore: sdk.inheritedRiskScore ?? 0,
    policyViolationsFail: sdk.policyViolationsFail ?? 0,
    policyViolationsWarn: sdk.policyViolationsWarn ?? 0,
    policyViolationsInfo: sdk.policyViolationsInfo ?? 0,
    policyViolationsTotal: sdk.policyViolationsTotal ?? 0,
    projects: sdk.projects ?? 0,
  };
}

function adaptPolicyCondition(sdk: SdkDtPolicyCondition): DtPolicyCondition {
  return {
    uuid: sdk.uuid,
    subject: sdk.subject,
    operator: sdk.operator,
    value: sdk.value,
    policy: {
      uuid: sdk.policy.uuid,
      name: sdk.policy.name,
      violationState: sdk.policy.violationState,
    },
  };
}

function adaptPolicyConditionFull(
  sdk: SdkDtPolicyConditionFull,
): { uuid: string; subject: string; operator: string; value: string } {
  return {
    uuid: sdk.uuid,
    subject: sdk.subject,
    operator: sdk.operator,
    value: sdk.value,
  };
}

function adaptPolicyViolation(sdk: SdkDtPolicyViolation): DtPolicyViolation {
  return {
    uuid: sdk.uuid,
    type: sdk.type,
    component: adaptComponent(sdk.component),
    policyCondition: adaptPolicyCondition(sdk.policyCondition),
  };
}

function adaptPolicyFull(sdk: SdkDtPolicyFull): DtPolicyFull {
  return {
    uuid: sdk.uuid,
    name: sdk.name,
    violationState: sdk.violationState,
    includeChildren: sdk.includeChildren ?? null,
    policyConditions: sdk.policyConditions.map(adaptPolicyConditionFull),
    projects: sdk.projects.map(adaptProject),
    tags: sdk.tags,
  };
}

function adaptAnalysisResponse(sdk: SdkDtAnalysisResponse): DtAnalysisResponse {
  return {
    analysisState: sdk.analysisState,
    analysisJustification: sdk.analysisJustification ?? null,
    analysisDetails: sdk.analysisDetails ?? null,
    isSuppressed: sdk.isSuppressed,
  };
}

function adaptUpdateAnalysisRequest(
  req: UpdateAnalysisRequest,
): SdkUpdateAnalysisBody {
  return {
    project_uuid: req.project_uuid,
    component_uuid: req.component_uuid,
    vulnerability_uuid: req.vulnerability_uuid,
    state: req.state,
    justification: req.justification,
    details: req.details,
    suppressed: req.suppressed,
  };
}

const dtApi = {
  getStatus: async (): Promise<DtStatus> => {
    const { data, error } = await sdkDtStatus();
    if (error) throw error;
    return adaptStatus(assertData(data, 'dtApi.getStatus'));
  },

  listProjects: async (): Promise<DtProject[]> => {
    const { data, error } = await sdkListProjects();
    if (error) throw error;
    return assertData(data, 'dtApi.listProjects').map(adaptProject);
  },

  getProjectFindings: async (projectUuid: string): Promise<DtFinding[]> => {
    const { data, error } = await sdkGetProjectFindings({
      path: { project_uuid: projectUuid },
    });
    if (error) throw error;
    return assertData(data, 'dtApi.getProjectFindings').map(adaptFinding);
  },

  getProjectComponents: async (
    projectUuid: string,
  ): Promise<DtComponentFull[]> => {
    const { data, error } = await sdkGetProjectComponents({
      path: { project_uuid: projectUuid },
    });
    if (error) throw error;
    return assertData(data, 'dtApi.getProjectComponents').map(
      adaptComponentFull,
    );
  },

  getProjectMetrics: async (projectUuid: string): Promise<DtProjectMetrics> => {
    const { data, error } = await sdkGetProjectMetrics({
      path: { project_uuid: projectUuid },
    });
    if (error) throw error;
    return adaptProjectMetrics(assertData(data, 'dtApi.getProjectMetrics'));
  },

  getProjectMetricsHistory: async (
    projectUuid: string,
    days?: number,
  ): Promise<DtProjectMetrics[]> => {
    const { data, error } = await sdkGetProjectMetricsHistory({
      path: { project_uuid: projectUuid },
      query: days === undefined ? undefined : { days },
    });
    if (error) throw error;
    return assertData(data, 'dtApi.getProjectMetricsHistory').map(
      adaptProjectMetrics,
    );
  },

  getPortfolioMetrics: async (): Promise<DtPortfolioMetrics> => {
    const { data, error } = await sdkGetPortfolioMetrics();
    if (error) throw error;
    return adaptPortfolioMetrics(assertData(data, 'dtApi.getPortfolioMetrics'));
  },

  getProjectViolations: async (
    projectUuid: string,
  ): Promise<DtPolicyViolation[]> => {
    const { data, error } = await sdkGetProjectViolations({
      path: { project_uuid: projectUuid },
    });
    if (error) throw error;
    return assertData(data, 'dtApi.getProjectViolations').map(
      adaptPolicyViolation,
    );
  },

  updateAnalysis: async (
    req: UpdateAnalysisRequest,
  ): Promise<DtAnalysisResponse> => {
    const { data, error } = await sdkUpdateAnalysis({
      body: adaptUpdateAnalysisRequest(req),
    });
    if (error) throw error;
    return adaptAnalysisResponse(assertData(data, 'dtApi.updateAnalysis'));
  },

  listPolicies: async (): Promise<DtPolicyFull[]> => {
    const { data, error } = await sdkListDependencyTrackPolicies();
    if (error) throw error;
    return assertData(data, 'dtApi.listPolicies').map(adaptPolicyFull);
  },

  /** Aggregate violations across the top N projects */
  getAllViolations: async (
    projects: { uuid: string }[],
    limit = 20,
  ): Promise<DtPolicyViolation[]> => {
    const all: DtPolicyViolation[] = [];
    await Promise.all(
      projects.slice(0, limit).map(async (p) => {
        try {
          const violations = await dtApi.getProjectViolations(p.uuid);
          all.push(...violations);
        } catch {
          // skip projects whose violations are unavailable
        }
      }),
    );
    return all;
  },
};

export default dtApi;
