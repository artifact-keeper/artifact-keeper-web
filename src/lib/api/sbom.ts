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
  SbomResponse as SdkSbomResponse,
  SbomContentResponse as SdkSbomContentResponse,
  ComponentResponse as SdkComponentResponse,
  CveHistoryEntry as SdkCveHistoryEntry,
  CveTimelineEntry as SdkCveTimelineEntry,
  CveTrends as SdkCveTrends,
  LicensePolicyResponse as SdkLicensePolicyResponse,
  LicenseCheckResult as SdkLicenseCheckResult,
  GenerateSbomRequest as SdkGenerateSbomRequest,
  ConvertSbomRequest as SdkConvertSbomRequest,
  UpdateCveStatusRequest as SdkUpdateCveStatusRequest,
  UpsertLicensePolicyRequest as SdkUpsertLicensePolicyRequest,
  CheckLicenseComplianceRequest as SdkCheckLicenseComplianceRequest,
} from '@artifact-keeper/sdk';
import type {
  SbomResponse,
  SbomContentResponse,
  SbomComponent,
  CveHistoryEntry,
  CveTimelineEntry,
  CveTrends,
  LicensePolicy,
  LicenseCheckResult,
  PolicyAction,
  CveStatus,
  GenerateSbomRequest,
  ListSbomsParams,
  ConvertSbomRequest,
  UpdateCveStatusRequest,
  GetCveTrendsParams,
  UpsertLicensePolicyRequest,
  CheckLicenseComplianceRequest,
} from '@/types/sbom';
import { assertData, narrowEnum } from '@/lib/api/fetch';

const POLICY_ACTIONS = new Set<PolicyAction>(['allow', 'warn', 'block']);
const CVE_STATUSES = new Set<CveStatus>([
  'open',
  'fixed',
  'acknowledged',
  'false_positive',
]);

// Adapters: normalize SDK's `?: T | null` to local `: T | null` and
// narrow string-typed enum fields where local types declare unions
// (#206 / #359).

function adaptSbom(sdk: SdkSbomResponse): SbomResponse {
  return {
    id: sdk.id,
    artifact_id: sdk.artifact_id,
    repository_id: sdk.repository_id,
    format: sdk.format,
    format_version: sdk.format_version,
    spec_version: sdk.spec_version ?? null,
    component_count: sdk.component_count,
    dependency_count: sdk.dependency_count,
    license_count: sdk.license_count,
    licenses: sdk.licenses,
    content_hash: sdk.content_hash,
    generator: sdk.generator ?? null,
    generator_version: sdk.generator_version ?? null,
    generated_at: sdk.generated_at,
    created_at: sdk.created_at,
  };
}

function adaptSbomContent(sdk: SdkSbomContentResponse): SbomContentResponse {
  return {
    ...adaptSbom(sdk),
    content: sdk.content,
  };
}

function adaptComponent(sdk: SdkComponentResponse): SbomComponent {
  return {
    id: sdk.id,
    sbom_id: sdk.sbom_id,
    name: sdk.name,
    version: sdk.version ?? null,
    purl: sdk.purl ?? null,
    cpe: sdk.cpe ?? null,
    component_type: sdk.component_type ?? null,
    licenses: sdk.licenses,
    sha256: sdk.sha256 ?? null,
    sha1: sdk.sha1 ?? null,
    md5: sdk.md5 ?? null,
    supplier: sdk.supplier ?? null,
    author: sdk.author ?? null,
  };
}

function adaptCveHistory(sdk: SdkCveHistoryEntry): CveHistoryEntry {
  return {
    id: sdk.id,
    artifact_id: sdk.artifact_id,
    sbom_id: sdk.sbom_id ?? null,
    component_id: sdk.component_id ?? null,
    scan_result_id: sdk.scan_result_id ?? null,
    cve_id: sdk.cve_id,
    affected_component: sdk.affected_component ?? null,
    affected_version: sdk.affected_version ?? null,
    fixed_version: sdk.fixed_version ?? null,
    severity: sdk.severity ?? null,
    cvss_score: sdk.cvss_score ?? null,
    cve_published_at: sdk.cve_published_at ?? null,
    first_detected_at: sdk.first_detected_at,
    last_detected_at: sdk.last_detected_at,
    status: sdk.status,
    acknowledged_by: sdk.acknowledged_by ?? null,
    acknowledged_at: sdk.acknowledged_at ?? null,
    acknowledged_reason: sdk.acknowledged_reason ?? null,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
  };
}

function adaptCveTimelineEntry(sdk: SdkCveTimelineEntry): CveTimelineEntry {
  return {
    cve_id: sdk.cve_id,
    severity: sdk.severity,
    affected_component: sdk.affected_component,
    cve_published_at: sdk.cve_published_at ?? null,
    first_detected_at: sdk.first_detected_at,
    status: sdk.status,
    days_exposed: sdk.days_exposed,
  };
}

function adaptCveTrends(sdk: SdkCveTrends): CveTrends {
  return {
    total_cves: sdk.total_cves,
    open_cves: sdk.open_cves,
    fixed_cves: sdk.fixed_cves,
    acknowledged_cves: sdk.acknowledged_cves,
    critical_count: sdk.critical_count,
    high_count: sdk.high_count,
    medium_count: sdk.medium_count,
    low_count: sdk.low_count,
    avg_days_to_fix: sdk.avg_days_to_fix ?? null,
    timeline: sdk.timeline.map(adaptCveTimelineEntry),
  };
}

function adaptLicensePolicy(sdk: SdkLicensePolicyResponse): LicensePolicy {
  return {
    id: sdk.id,
    repository_id: sdk.repository_id ?? null,
    name: sdk.name,
    description: sdk.description ?? null,
    allowed_licenses: sdk.allowed_licenses,
    denied_licenses: sdk.denied_licenses,
    allow_unknown: sdk.allow_unknown,
    action: sdk.action,
    is_enabled: sdk.is_enabled,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at ?? null,
  };
}

// SDK shape mismatch: LicenseCheckResult on the SDK is
// { compliant, violations: string[], warnings: string[] } — no `action`
// and no per-violation `reason`. The local type pre-#359 declared
// `action: PolicyAction` and `violations: { license, reason }[]`, and
// the `as never` cast made the divergence invisible at the type
// system. The adapter below does the best it can:
//   - synthesize action: "block" if violations exist, "allow" otherwise
//   - convert each string violation to { license: <s>, reason: "" }
// No app code currently calls this method (`grep checkCompliance src/app`
// returns nothing), so the synthesis is best-effort. If a real consumer
// surfaces, revisit the local type to match the SDK.
function adaptLicenseCheckResult(sdk: SdkLicenseCheckResult): LicenseCheckResult {
  const action: PolicyAction = sdk.compliant ? 'allow' : 'block';
  return {
    compliant: sdk.compliant,
    action,
    violations: sdk.violations.map((license) => ({ license, reason: '' })),
    warnings: sdk.warnings,
  };
}

function adaptGenerateRequest(req: GenerateSbomRequest): SdkGenerateSbomRequest {
  return {
    artifact_id: req.artifact_id,
    format: req.format,
    force_regenerate: req.force_regenerate,
  };
}

function adaptConvertRequest(req: ConvertSbomRequest): SdkConvertSbomRequest {
  return { target_format: req.target_format };
}

function adaptUpdateCveStatusRequest(
  req: UpdateCveStatusRequest,
): SdkUpdateCveStatusRequest {
  return {
    status: req.status,
    reason: req.reason,
  };
}

function adaptUpsertPolicyRequest(
  req: UpsertLicensePolicyRequest,
): SdkUpsertLicensePolicyRequest {
  return {
    repository_id: req.repository_id,
    name: req.name,
    description: req.description,
    allowed_licenses: req.allowed_licenses,
    denied_licenses: req.denied_licenses,
    allow_unknown: req.allow_unknown,
    action: req.action,
    is_enabled: req.is_enabled,
  };
}

function adaptCheckRequest(
  req: CheckLicenseComplianceRequest,
): SdkCheckLicenseComplianceRequest {
  return {
    licenses: req.licenses,
    repository_id: req.repository_id,
  };
}

// Narrowed read of CveHistoryEntry.status when the consumer needs the union.
// Exported alongside narrowEnum for callers that want a typed status.
export function narrowCveStatus(value: string): CveStatus {
  return narrowEnum(
    value,
    CVE_STATUSES,
    'open',
    `sbomApi: unknown CVE status "${value}" — falling back to "open".`,
  );
}

// Narrowed read of LicensePolicy.action.
export function narrowPolicyAction(value: string): PolicyAction {
  return narrowEnum(
    value,
    POLICY_ACTIONS,
    'warn',
    `sbomApi: unknown policy action "${value}" — falling back to "warn".`,
  );
}

const sbomApi = {
  // SBOM operations
  generate: async (req: GenerateSbomRequest): Promise<SbomResponse> => {
    const { data, error } = await sdkGenerateSbom({
      body: adaptGenerateRequest(req),
    });
    if (error) throw error;
    return adaptSbom(assertData(data, 'sbomApi.generate'));
  },

  list: async (params?: ListSbomsParams): Promise<SbomResponse[]> => {
    const { data, error } = await sdkListSboms({ query: params });
    if (error) throw error;
    return assertData(data, 'sbomApi.list').map(adaptSbom);
  },

  get: async (id: string): Promise<SbomContentResponse> => {
    const { data, error } = await sdkGetSbom({ path: { id } });
    if (error) throw error;
    return adaptSbomContent(assertData(data, 'sbomApi.get'));
  },

  getByArtifact: async (
    artifactId: string,
  ): Promise<SbomContentResponse> => {
    // SDK declares no `query` for this endpoint; the pre-#359 `format`
    // parameter was bypassed via `as never` and sent over the wire as
    // an unsupported query — silently ignored by the backend. No app
    // consumer was passing format, so dropped (no-op behavior change).
    const { data, error } = await sdkGetSbomByArtifact({
      path: { artifact_id: artifactId },
    });
    if (error) throw error;
    return adaptSbomContent(assertData(data, 'sbomApi.getByArtifact'));
  },

  getComponents: async (sbomId: string): Promise<SbomComponent[]> => {
    const { data, error } = await sdkGetSbomComponents({ path: { id: sbomId } });
    if (error) throw error;
    return assertData(data, 'sbomApi.getComponents').map(adaptComponent);
  },

  convert: async (
    sbomId: string,
    req: ConvertSbomRequest,
  ): Promise<SbomResponse> => {
    const { data, error } = await sdkConvertSbom({
      path: { id: sbomId },
      body: adaptConvertRequest(req),
    });
    if (error) throw error;
    return adaptSbom(assertData(data, 'sbomApi.convert'));
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteSbom({ path: { id } });
    if (error) throw error;
  },

  // CVE history operations
  getCveHistory: async (artifactId: string): Promise<CveHistoryEntry[]> => {
    const { data, error } = await sdkGetCveHistory({
      path: { artifact_id: artifactId },
    });
    if (error) throw error;
    return assertData(data, 'sbomApi.getCveHistory').map(adaptCveHistory);
  },

  updateCveStatus: async (
    cveId: string,
    req: UpdateCveStatusRequest,
  ): Promise<CveHistoryEntry> => {
    const { data, error } = await sdkUpdateCveStatus({
      path: { id: cveId },
      body: adaptUpdateCveStatusRequest(req),
    });
    if (error) throw error;
    return adaptCveHistory(assertData(data, 'sbomApi.updateCveStatus'));
  },

  getCveTrends: async (params?: GetCveTrendsParams): Promise<CveTrends> => {
    const { data, error } = await sdkGetCveTrends({ query: params });
    if (error) throw error;
    return adaptCveTrends(assertData(data, 'sbomApi.getCveTrends'));
  },

  // License policy operations
  listPolicies: async (): Promise<LicensePolicy[]> => {
    const { data, error } = await sdkListLicensePolicies();
    if (error) throw error;
    return assertData(data, 'sbomApi.listPolicies').map(adaptLicensePolicy);
  },

  getPolicy: async (id: string): Promise<LicensePolicy> => {
    const { data, error } = await sdkGetLicensePolicy({ path: { id } });
    if (error) throw error;
    return adaptLicensePolicy(assertData(data, 'sbomApi.getPolicy'));
  },

  upsertPolicy: async (
    req: UpsertLicensePolicyRequest,
  ): Promise<LicensePolicy> => {
    const { data, error } = await sdkUpsertLicensePolicy({
      body: adaptUpsertPolicyRequest(req),
    });
    if (error) throw error;
    return adaptLicensePolicy(assertData(data, 'sbomApi.upsertPolicy'));
  },

  deletePolicy: async (id: string): Promise<void> => {
    const { error } = await sdkDeleteLicensePolicy({ path: { id } });
    if (error) throw error;
  },

  checkCompliance: async (
    req: CheckLicenseComplianceRequest,
  ): Promise<LicenseCheckResult> => {
    const { data, error } = await sdkCheckLicenseCompliance({
      body: adaptCheckRequest(req),
    });
    if (error) throw error;
    return adaptLicenseCheckResult(
      assertData(data, 'sbomApi.checkCompliance'),
    );
  },
};

export default sbomApi;
