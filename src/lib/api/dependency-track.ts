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
    return data as never;
  },

  listProjects: async (): Promise<DtProject[]> => {
    const { data, error } = await sdkListProjects();
    if (error) throw error;
    return data as never;
  },

  getProjectFindings: async (projectUuid: string): Promise<DtFinding[]> => {
    const { data, error } = await sdkGetProjectFindings({ path: { project_uuid: projectUuid } });
    if (error) throw error;
    return data as never;
  },

  getProjectComponents: async (projectUuid: string): Promise<DtComponentFull[]> => {
    const { data, error } = await sdkGetProjectComponents({ path: { project_uuid: projectUuid } });
    if (error) throw error;
    return data as never;
  },

  getProjectMetrics: async (projectUuid: string): Promise<DtProjectMetrics> => {
    const { data, error } = await sdkGetProjectMetrics({ path: { project_uuid: projectUuid } });
    if (error) throw error;
    return data as never;
  },

  getProjectMetricsHistory: async (projectUuid: string, days?: number): Promise<DtProjectMetrics[]> => {
    const { data, error } = await sdkGetProjectMetricsHistory({
      path: { project_uuid: projectUuid },
      query: days !== undefined ? { days } as never : undefined,
    });
    if (error) throw error;
    return data as never;
  },

  getPortfolioMetrics: async (): Promise<DtPortfolioMetrics> => {
    const { data, error } = await sdkGetPortfolioMetrics();
    if (error) throw error;
    return data as never;
  },

  getProjectViolations: async (projectUuid: string): Promise<DtPolicyViolation[]> => {
    const { data, error } = await sdkGetProjectViolations({ path: { project_uuid: projectUuid } });
    if (error) throw error;
    return data as never;
  },

  updateAnalysis: async (req: UpdateAnalysisRequest): Promise<DtAnalysisResponse> => {
    const { data, error } = await sdkUpdateAnalysis({ body: req as never });
    if (error) throw error;
    return data as never;
  },

  listPolicies: async (): Promise<DtPolicyFull[]> => {
    const { data, error } = await sdkListDependencyTrackPolicies();
    if (error) throw error;
    return data as never;
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
