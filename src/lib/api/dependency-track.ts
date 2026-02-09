/* eslint-disable @typescript-eslint/no-explicit-any */
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
  DtStatus,
  DtProject,
  DtFinding,
  DtComponentFull,
  DtProjectMetrics,
  DtPortfolioMetrics,
  DtPolicyViolation,
  DtAnalysisResponse,
  DtPolicyFull,
  UpdateAnalysisRequest,
} from '@/types/dependency-track';

const dtApi = {
  getStatus: async (): Promise<DtStatus> => {
    const { data, error } = await sdkDtStatus();
    if (error) throw error;
    return data as any;
  },

  listProjects: async (): Promise<DtProject[]> => {
    const { data, error } = await sdkListProjects();
    if (error) throw error;
    return data as any;
  },

  getProjectFindings: async (projectUuid: string): Promise<DtFinding[]> => {
    const { data, error } = await sdkGetProjectFindings({ path: { project_uuid: projectUuid } });
    if (error) throw error;
    return data as any;
  },

  getProjectComponents: async (projectUuid: string): Promise<DtComponentFull[]> => {
    const { data, error } = await sdkGetProjectComponents({ path: { project_uuid: projectUuid } });
    if (error) throw error;
    return data as any;
  },

  getProjectMetrics: async (projectUuid: string): Promise<DtProjectMetrics> => {
    const { data, error } = await sdkGetProjectMetrics({ path: { project_uuid: projectUuid } });
    if (error) throw error;
    return data as any;
  },

  getProjectMetricsHistory: async (projectUuid: string, days?: number): Promise<DtProjectMetrics[]> => {
    const { data, error } = await sdkGetProjectMetricsHistory({
      path: { project_uuid: projectUuid },
      query: days !== undefined ? { days } as any : undefined,
    });
    if (error) throw error;
    return data as any;
  },

  getPortfolioMetrics: async (): Promise<DtPortfolioMetrics> => {
    const { data, error } = await sdkGetPortfolioMetrics();
    if (error) throw error;
    return data as any;
  },

  getProjectViolations: async (projectUuid: string): Promise<DtPolicyViolation[]> => {
    const { data, error } = await sdkGetProjectViolations({ path: { project_uuid: projectUuid } });
    if (error) throw error;
    return data as any;
  },

  updateAnalysis: async (req: UpdateAnalysisRequest): Promise<DtAnalysisResponse> => {
    const { data, error } = await sdkUpdateAnalysis({ body: req as any });
    if (error) throw error;
    return data as any;
  },

  listPolicies: async (): Promise<DtPolicyFull[]> => {
    const { data, error } = await sdkListDependencyTrackPolicies();
    if (error) throw error;
    return data as any;
  },

  /** Aggregate violations across the top N projects */
  getAllViolations: async (projects: { uuid: string }[], limit = 20): Promise<DtPolicyViolation[]> => {
    const all: DtPolicyViolation[] = [];
    await Promise.all(
      projects.slice(0, limit).map(async (p) => {
        try {
          const violations = await dtApi.getProjectViolations(p.uuid);
          all.push(...violations);
        } catch {
          // skip projects whose violations are unavailable
        }
      })
    );
    return all;
  },
};

export default dtApi;
