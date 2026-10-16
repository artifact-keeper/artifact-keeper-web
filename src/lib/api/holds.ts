import { apiFetch } from '@/lib/api/fetch';
import { quarantineApi, type QuarantineActionResult } from '@/lib/api/quarantine';

/** Counts across the three download-hold control planes. */
export interface HoldsSummary {
  ageGatePending: number;
  quarantineActive: number;
  quarantineRejected: number;
  policyBlocked: number;
}

export type HoldKind = 'active' | 'expired' | 'rejected';

export const HOLD_KINDS: readonly HoldKind[] = ['active', 'expired', 'rejected'];

/** Currently-blocking kinds — matches the backend default when `kind` is omitted. */
export const DEFAULT_HOLD_KINDS: readonly HoldKind[] = ['active', 'rejected'];

export const HOLD_SUMMARY_QUERY_KEY = ['holds-summary'] as const;
export const QUARANTINE_HOLDS_QUERY_KEY = ['quarantine-holds'] as const;
export const POLICY_BLOCKS_QUERY_KEY = ['policy-blocks'] as const;

export interface QuarantineHold {
  artifactId: string;
  name: string;
  version: string | null;
  repositoryKey: string;
  repositoryFormat: string;
  quarantineStatus: string;
  kind: HoldKind;
  quarantineUntil: string | null;
  remainingSeconds: number | null;
  quarantineReason: string | null;
  createdAt: string;
  isBlocked: boolean;
}

export interface QuarantineHoldPage {
  items: QuarantineHold[];
  total: number;
}

export interface PolicyBlock {
  id: string;
  source: 'hosted' | 'proxy' | string;
  artifactId: string | null;
  packageName: string;
  packageVersion: string | null;
  path: string;
  repositoryKey: string;
  repositoryFormat: string;
  uploadedAt: string | null;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  findingsCount: number;
  maxSeverity: string | null;
  policyName: string | null;
  blockReason: string;
}

export interface PolicyBlockPage {
  items: PolicyBlock[];
  total: number;
}

interface HoldsSummaryDto {
  age_gate_pending: number;
  quarantine_active: number;
  quarantine_rejected: number;
  policy_blocked: number;
}

interface QuarantineHoldDto {
  artifact_id: string;
  name: string;
  version: string | null;
  repository_key: string;
  repository_format: string;
  quarantine_status: string;
  kind: string;
  quarantine_until: string | null;
  remaining_seconds: number | null;
  quarantine_reason: string | null;
  created_at: string;
  is_blocked: boolean;
}

interface PolicyBlockDto {
  id: string;
  source: string;
  artifact_id: string | null;
  package_name: string;
  package_version: string | null;
  path: string;
  repository_key: string;
  repository_format: string;
  uploaded_at: string | null;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  findings_count: number;
  max_severity: string | null;
  policy_name: string | null;
  block_reason: string;
}

interface PaginatedDto<T> {
  items: T[];
  pagination: { total: number };
}

function adaptKind(raw: string): HoldKind {
  if (raw === 'expired' || raw === 'rejected') return raw;
  return 'active';
}

function adaptHold(dto: QuarantineHoldDto): QuarantineHold {
  return {
    artifactId: dto.artifact_id,
    name: dto.name,
    version: dto.version,
    repositoryKey: dto.repository_key,
    repositoryFormat: dto.repository_format,
    quarantineStatus: dto.quarantine_status,
    kind: adaptKind(dto.kind),
    quarantineUntil: dto.quarantine_until,
    remainingSeconds: dto.remaining_seconds,
    quarantineReason: dto.quarantine_reason,
    createdAt: dto.created_at,
    isBlocked: dto.is_blocked,
  };
}

function adaptBlock(dto: PolicyBlockDto): PolicyBlock {
  return {
    id: dto.id,
    source: dto.source,
    artifactId: dto.artifact_id,
    packageName: dto.package_name,
    packageVersion: dto.package_version,
    path: dto.path,
    repositoryKey: dto.repository_key,
    repositoryFormat: dto.repository_format,
    uploadedAt: dto.uploaded_at,
    criticalCount: dto.critical_count,
    highCount: dto.high_count,
    mediumCount: dto.medium_count,
    lowCount: dto.low_count,
    findingsCount: dto.findings_count,
    maxSeverity: dto.max_severity,
    policyName: dto.policy_name,
    blockReason: dto.block_reason,
  };
}

/** Compact remaining-time label for a quarantine queue row. */
export function formatHoldRemaining(
  hold: Pick<QuarantineHold, 'kind' | 'remainingSeconds'>,
  elapsedSeconds = 0,
): string {
  if (hold.kind === 'rejected') return 'Permanent block';
  if (hold.kind === 'expired') return 'Expired — downloads allowed';
  if (hold.remainingSeconds == null) return 'Until released';
  const remaining = hold.remainingSeconds - elapsedSeconds;
  if (remaining <= 0) return 'Expired — downloads allowed';
  return `${formatDurationSeconds(remaining)} remaining`;
}

export function formatDurationSeconds(total: number): string {
  const abs = Math.max(0, Math.floor(total));
  const days = Math.floor(abs / 86_400);
  const hours = Math.floor((abs % 86_400) / 3_600);
  const minutes = Math.floor((abs % 3_600) / 60);
  const seconds = abs % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/** "active", "active or rejected", "active, expired or rejected". */
export function joinHoldKinds(kinds: readonly HoldKind[]): string {
  if (kinds.length <= 1) return kinds[0] ?? '';
  return `${kinds.slice(0, -1).join(', ')} or ${kinds[kinds.length - 1]}`;
}

export const holdsApi = {
  summary: async (): Promise<HoldsSummary> => {
    const dto = await apiFetch<HoldsSummaryDto>('/api/v1/admin/holds/summary');
    return {
      ageGatePending: dto.age_gate_pending,
      quarantineActive: dto.quarantine_active,
      quarantineRejected: dto.quarantine_rejected,
      policyBlocked: dto.policy_blocked,
    };
  },

  listQuarantine: async (params: {
    kinds?: readonly HoldKind[];
    repositoryKey?: string;
    page?: number;
    perPage?: number;
  } = {}): Promise<QuarantineHoldPage> => {
    const query = new URLSearchParams();
    if (params.kinds?.length) query.set('kind', params.kinds.join(','));
    if (params.repositoryKey) query.set('repository_key', params.repositoryKey);
    if (params.page) query.set('page', String(params.page));
    query.set('per_page', String(params.perPage ?? 100));
    const qs = query.toString();
    const dto = await apiFetch<PaginatedDto<QuarantineHoldDto>>(
      `/api/v1/admin/holds/quarantine${qs ? `?${qs}` : ''}`,
    );
    return { items: dto.items.map(adaptHold), total: dto.pagination.total };
  },

  listPolicyBlocks: async (params: {
    repositoryKey?: string;
    page?: number;
    perPage?: number;
  } = {}): Promise<PolicyBlockPage> => {
    const query = new URLSearchParams();
    if (params.repositoryKey) query.set('repository_key', params.repositoryKey);
    if (params.page) query.set('page', String(params.page));
    query.set('per_page', String(params.perPage ?? 100));
    const qs = query.toString();
    const dto = await apiFetch<PaginatedDto<PolicyBlockDto>>(
      `/api/v1/admin/holds/policy-blocks${qs ? `?${qs}` : ''}`,
    );
    return { items: dto.items.map(adaptBlock), total: dto.pagination.total };
  },

  release: (artifactId: string): Promise<QuarantineActionResult> =>
    quarantineApi.release(artifactId),

  reject: (artifactId: string, reason?: string): Promise<QuarantineActionResult> =>
    quarantineApi.reject(artifactId, reason),
};
