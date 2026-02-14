import { getActiveInstanceBaseUrl } from '@/lib/sdk-client';
import type {
  QualityGate,
  CreateQualityGateRequest,
  UpdateQualityGateRequest,
  ArtifactHealth,
  RepoHealth,
  HealthDashboard,
} from '@/types/quality-gates';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getActiveInstanceBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`API error ${response.status}: ${body}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

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
