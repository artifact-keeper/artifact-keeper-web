import { apiFetch } from '@/lib/api/fetch';
import type {
  QualityGate,
  CreateQualityGateRequest,
  UpdateQualityGateRequest,
  ArtifactHealth,
  RepoHealth,
  HealthDashboard,
} from '@/types/quality-gates';

const qualityGatesApi = {
  // Quality gate CRUD
  listGates: async (): Promise<QualityGate[]> => {
    return apiFetch<QualityGate[]>('/api/v1/quality/gates');
  },

  getGate: async (id: string): Promise<QualityGate> => {
    return apiFetch<QualityGate>(`/api/v1/quality/gates/${id}`);
  },

  createGate: async (req: CreateQualityGateRequest): Promise<QualityGate> => {
    return apiFetch<QualityGate>('/api/v1/quality/gates', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },

  updateGate: async (id: string, req: UpdateQualityGateRequest): Promise<QualityGate> => {
    return apiFetch<QualityGate>(`/api/v1/quality/gates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(req),
    });
  },

  deleteGate: async (id: string): Promise<void> => {
    return apiFetch<void>(`/api/v1/quality/gates/${id}`, {
      method: 'DELETE',
    });
  },

  // Health endpoints
  getArtifactHealth: async (artifactId: string): Promise<ArtifactHealth> => {
    return apiFetch<ArtifactHealth>(`/api/v1/quality/health/artifacts/${artifactId}`);
  },

  getRepoHealth: async (repoKey: string): Promise<RepoHealth> => {
    return apiFetch<RepoHealth>(`/api/v1/quality/health/repositories/${repoKey}`);
  },

  getHealthDashboard: async (): Promise<HealthDashboard> => {
    return apiFetch<HealthDashboard>('/api/v1/quality/health/dashboard');
  },
};

export default qualityGatesApi;
