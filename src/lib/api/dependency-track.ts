import apiClient from '@/lib/api-client';
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

const BASE = '/api/v1/dependency-track';

const dtApi = {
  getStatus: async (): Promise<DtStatus> => {
    const { data } = await apiClient.get(`${BASE}/status`);
    return data;
  },

  listProjects: async (): Promise<DtProject[]> => {
    const { data } = await apiClient.get(`${BASE}/projects`);
    return data;
  },

  getProjectFindings: async (projectUuid: string): Promise<DtFinding[]> => {
    const { data } = await apiClient.get(`${BASE}/projects/${projectUuid}/findings`);
    return data;
  },

  getProjectComponents: async (projectUuid: string): Promise<DtComponentFull[]> => {
    const { data } = await apiClient.get(`${BASE}/projects/${projectUuid}/components`);
    return data;
  },

  getProjectMetrics: async (projectUuid: string): Promise<DtProjectMetrics> => {
    const { data } = await apiClient.get(`${BASE}/projects/${projectUuid}/metrics`);
    return data;
  },

  getProjectMetricsHistory: async (projectUuid: string, days?: number): Promise<DtProjectMetrics[]> => {
    const { data } = await apiClient.get(`${BASE}/projects/${projectUuid}/metrics/history`, {
      params: days !== undefined ? { days } : undefined,
    });
    return data;
  },

  getPortfolioMetrics: async (): Promise<DtPortfolioMetrics> => {
    const { data } = await apiClient.get(`${BASE}/metrics/portfolio`);
    return data;
  },

  getProjectViolations: async (projectUuid: string): Promise<DtPolicyViolation[]> => {
    const { data } = await apiClient.get(`${BASE}/projects/${projectUuid}/violations`);
    return data;
  },

  updateAnalysis: async (req: UpdateAnalysisRequest): Promise<DtAnalysisResponse> => {
    const { data } = await apiClient.put(`${BASE}/analysis`, req);
    return data;
  },

  listPolicies: async (): Promise<DtPolicyFull[]> => {
    const { data } = await apiClient.get(`${BASE}/policies`);
    return data;
  },
};

export default dtApi;
