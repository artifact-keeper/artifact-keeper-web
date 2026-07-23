import '@/lib/sdk-client';
import {
  getCheck,
  listCheckIssues,
  triggerChecks,
  suppressIssue,
  unsuppressIssue,
} from '@artifact-keeper/sdk';
import type { CheckResponse, IssueResponse } from '@artifact-keeper/sdk';
import { apiFetch, assertData } from '@/lib/api/fetch';

/** A quality-check result for an artifact (e.g. metadata, naming, policy). */
export interface QualityCheck {
  id: string;
  artifact_id: string;
  repository_id: string;
  check_type: string;
  passed: boolean | null;
  score: number | null;
  issues_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  error_message: string | null;
  completed_at: string | null;
  created_at: string;
}

/** A single issue found by a quality check. */
export interface QualityIssue {
  id: string;
  check_result_id: string;
  category: string;
  severity: string;
  title: string;
  description: string | null;
  location: string | null;
  is_suppressed: boolean;
  suppressed_reason: string | null;
  created_at: string;
}

export interface ListChecksParams {
  repository_id?: string;
  artifact_id?: string;
}

/** Paginated envelope returned by GET /api/v1/admin/quality-checks (#2419). */
interface QualityCheckListResponse {
  items: CheckResponse[];
  total: number;
  page: number;
  per_page: number;
}

// The web models a subset of CheckResponse/IssueResponse — add fields here
// (e.g. started_at, checker_version, details, suppressed_by) when the UI
// surfaces them. Nothing currently rendered is dropped.
function adaptCheck(sdk: CheckResponse): QualityCheck {
  return {
    id: sdk.id,
    artifact_id: sdk.artifact_id,
    repository_id: sdk.repository_id,
    check_type: sdk.check_type,
    passed: sdk.passed ?? null,
    score: sdk.score ?? null,
    issues_count: sdk.issues_count,
    critical_count: sdk.critical_count,
    high_count: sdk.high_count,
    medium_count: sdk.medium_count,
    low_count: sdk.low_count,
    info_count: sdk.info_count,
    error_message: sdk.error_message ?? null,
    completed_at: sdk.completed_at ?? null,
    created_at: sdk.created_at,
  };
}

function adaptIssue(sdk: IssueResponse): QualityIssue {
  return {
    id: sdk.id,
    check_result_id: sdk.check_result_id,
    category: sdk.category,
    severity: sdk.severity,
    title: sdk.title,
    description: sdk.description ?? null,
    location: sdk.location ?? null,
    is_suppressed: sdk.is_suppressed,
    suppressed_reason: sdk.suppressed_reason ?? null,
    created_at: sdk.created_at,
  };
}

const qualityChecksApi = {
  list: async (params: ListChecksParams = {}): Promise<QualityCheck[]> => {
    // The admin quality-checks view needs a list-all (or filter-by-repo) view.
    // The artifact-scoped GET /api/v1/quality/checks 400s without `artifact_id`
    // (its #2334 contract), so this goes through the dedicated admin list-all
    // endpoint GET /api/v1/admin/quality-checks (#2419), which accepts optional
    // `repository_id`/`artifact_id`/`status` and returns a paginated
    // `{ items, total, page, per_page }` envelope. The SDK doesn't model this
    // endpoint yet, so the call uses the shared `apiFetch` trust boundary (the
    // same pattern repositories.ts uses for endpoints the SDK doesn't model);
    // collapse back to a generated SDK call once the SDK is regenerated.
    const qs = new URLSearchParams();
    if (params.repository_id) qs.set('repository_id', params.repository_id);
    if (params.artifact_id) qs.set('artifact_id', params.artifact_id);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const data = await apiFetch<QualityCheckListResponse>(
      `/api/v1/admin/quality-checks${suffix}`,
    );
    return assertData(data, 'qualityChecksApi.list').items.map(adaptCheck);
  },

  get: async (id: string): Promise<QualityCheck> => {
    const { data, error } = await getCheck({ path: { id } });
    if (error) throw error;
    return adaptCheck(assertData(data, 'qualityChecksApi.get'));
  },

  listIssues: async (checkId: string): Promise<QualityIssue[]> => {
    const { data, error } = await listCheckIssues({ path: { id: checkId } });
    if (error) throw error;
    return assertData(data, 'qualityChecksApi.listIssues').map(adaptIssue);
  },

  /** Queue quality checks for a repository (or a single artifact). */
  trigger: async (params: ListChecksParams = {}): Promise<{ queued: number; message: string }> => {
    const { data, error } = await triggerChecks({ body: params });
    if (error) throw error;
    const res = assertData(data, 'qualityChecksApi.trigger');
    return { queued: res.artifacts_queued, message: res.message };
  },

  suppressIssue: async (issueId: string, reason: string): Promise<void> => {
    const { error } = await suppressIssue({ path: { id: issueId }, body: { reason } });
    if (error) throw error;
  },

  unsuppressIssue: async (issueId: string): Promise<void> => {
    const { error } = await unsuppressIssue({ path: { id: issueId } });
    if (error) throw error;
  },
};

export default qualityChecksApi;
