import '@/lib/sdk-client';
import {
  generateSbom as sdkGenerateSbom,
  listSboms as sdkListSboms,
  getSbom as sdkGetSbom,
  getSbomByArtifact as sdkGetSbomByArtifact,
  getSbomComponents as sdkGetSbomComponents,
  convertSbom as sdkConvertSbom,
  deleteSbom as sdkDeleteSbom,
  getCveHistory as sdkGetCveHistory,
  updateCveStatus as sdkUpdateCveStatus,
  getCveTrends as sdkGetCveTrends,
  listLicensePolicies as sdkListLicensePolicies,
  getLicensePolicy as sdkGetLicensePolicy,
  upsertLicensePolicy as sdkUpsertLicensePolicy,
  deleteLicensePolicy as sdkDeleteLicensePolicy,
  checkLicenseCompliance as sdkCheckLicenseCompliance,
} from '@artifact-keeper/sdk';
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
    const { data, error } = await sdkGenerateSbom({ body: req as never });
    if (error) throw error;
    return data as never;
  },

  list: async (params?: ListSbomsParams): Promise<SbomResponse[]> => {
    const { data, error } = await sdkListSboms({ query: params as never });
    if (error) throw error;
    return data as never;
  },

  get: async (id: string): Promise<SbomContentResponse> => {
    const { data, error } = await sdkGetSbom({ path: { id } });
    if (error) throw error;
    return data as never;
  },

  getByArtifact: async (artifactId: string, format?: string): Promise<SbomContentResponse> => {
    const { data, error } = await sdkGetSbomByArtifact({
      path: { artifact_id: artifactId },
      query: format ? { format } as never : undefined,
    });
    if (error) throw error;
    return data as never;
  },

  getComponents: async (sbomId: string): Promise<SbomComponent[]> => {
    const { data, error } = await sdkGetSbomComponents({ path: { id: sbomId } });
    if (error) throw error;
    return data as never;
  },

  convert: async (sbomId: string, req: ConvertSbomRequest): Promise<SbomResponse> => {
    const { data, error } = await sdkConvertSbom({ path: { id: sbomId }, body: req as never });
    if (error) throw error;
    return data as never;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteSbom({ path: { id } });
    if (error) throw error;
  },

  // CVE history operations
  getCveHistory: async (artifactId: string): Promise<CveHistoryEntry[]> => {
    const { data, error } = await sdkGetCveHistory({ path: { artifact_id: artifactId } });
    if (error) throw error;
    return data as never;
  },

  updateCveStatus: async (cveId: string, req: UpdateCveStatusRequest): Promise<CveHistoryEntry> => {
    const { data, error } = await sdkUpdateCveStatus({ path: { id: cveId }, body: req as never });
    if (error) throw error;
    return data as never;
  },

  getCveTrends: async (params?: GetCveTrendsParams): Promise<CveTrends> => {
    const { data, error } = await sdkGetCveTrends({ query: params as never });
    if (error) throw error;
    return data as never;
  },

  // License policy operations
  listPolicies: async (): Promise<LicensePolicy[]> => {
    const { data, error } = await sdkListLicensePolicies();
    if (error) throw error;
    return data as never;
  },

  getPolicy: async (id: string): Promise<LicensePolicy> => {
    const { data, error } = await sdkGetLicensePolicy({ path: { id } });
    if (error) throw error;
    return data as never;
  },

  upsertPolicy: async (req: UpsertLicensePolicyRequest): Promise<LicensePolicy> => {
    const { data, error } = await sdkUpsertLicensePolicy({ body: req as never });
    if (error) throw error;
    return data as never;
  },

  deletePolicy: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteLicensePolicy({ path: { id } });
    if (error) throw error;
  },

  checkCompliance: async (req: CheckLicenseComplianceRequest): Promise<LicenseCheckResult> => {
    const { data, error } = await sdkCheckLicenseCompliance({ body: req as never });
    if (error) throw error;
    return data as never;
  },
};

export default sbomApi;
