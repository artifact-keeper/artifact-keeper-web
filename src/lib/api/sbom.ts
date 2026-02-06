import apiClient from '@/lib/api-client';
import type {
  SbomResponse,
  SbomContentResponse,
  SbomComponent,
  CveHistoryEntry,
  CveTrends,
  LicensePolicy,
  LicenseCheckResult,
  GenerateSbomRequest,
  ListSbomsParams,
  ConvertSbomRequest,
  UpdateCveStatusRequest,
  GetCveTrendsParams,
  UpsertLicensePolicyRequest,
  CheckLicenseComplianceRequest,
} from '@/types/sbom';

const sbomApi = {
  // SBOM operations
  generate: async (req: GenerateSbomRequest): Promise<SbomResponse> => {
    const { data } = await apiClient.post('/api/v1/sbom', req);
    return data;
  },

  list: async (params?: ListSbomsParams): Promise<SbomResponse[]> => {
    const { data } = await apiClient.get('/api/v1/sbom', { params });
    return data;
  },

  get: async (id: string): Promise<SbomContentResponse> => {
    const { data } = await apiClient.get(`/api/v1/sbom/${id}`);
    return data;
  },

  getByArtifact: async (artifactId: string, format?: string): Promise<SbomContentResponse> => {
    const { data } = await apiClient.get(`/api/v1/sbom/by-artifact/${artifactId}`, {
      params: format ? { format } : undefined,
    });
    return data;
  },

  getComponents: async (sbomId: string): Promise<SbomComponent[]> => {
    const { data } = await apiClient.get(`/api/v1/sbom/${sbomId}/components`);
    return data;
  },

  convert: async (sbomId: string, req: ConvertSbomRequest): Promise<SbomResponse> => {
    const { data } = await apiClient.post(`/api/v1/sbom/${sbomId}/convert`, req);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/sbom/${id}`);
  },

  // CVE history operations
  getCveHistory: async (artifactId: string): Promise<CveHistoryEntry[]> => {
    const { data } = await apiClient.get(`/api/v1/sbom/cve/history/${artifactId}`);
    return data;
  },

  updateCveStatus: async (cveId: string, req: UpdateCveStatusRequest): Promise<CveHistoryEntry> => {
    const { data } = await apiClient.post(`/api/v1/sbom/cve/status/${cveId}`, req);
    return data;
  },

  getCveTrends: async (params?: GetCveTrendsParams): Promise<CveTrends> => {
    const { data } = await apiClient.get('/api/v1/sbom/cve/trends', { params });
    return data;
  },

  // License policy operations
  listPolicies: async (): Promise<LicensePolicy[]> => {
    const { data } = await apiClient.get('/api/v1/sbom/license-policies');
    return data;
  },

  getPolicy: async (id: string): Promise<LicensePolicy> => {
    const { data } = await apiClient.get(`/api/v1/sbom/license-policies/${id}`);
    return data;
  },

  upsertPolicy: async (req: UpsertLicensePolicyRequest): Promise<LicensePolicy> => {
    const { data } = await apiClient.post('/api/v1/sbom/license-policies', req);
    return data;
  },

  deletePolicy: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/sbom/license-policies/${id}`);
  },

  checkCompliance: async (req: CheckLicenseComplianceRequest): Promise<LicenseCheckResult> => {
    const { data } = await apiClient.post('/api/v1/sbom/check-compliance', req);
    return data;
  },
};

export default sbomApi;
