import '@/lib/sdk-client';
import {
  listRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  evaluateRule,
} from '@artifact-keeper/sdk';
import type { PromotionRuleResponse, BulkEvaluationResponse } from '@artifact-keeper/sdk';
import { assertData } from '@/lib/api/fetch';

/**
 * A promotion rule: gating criteria deciding whether artifacts may be promoted
 * (optionally auto-promoted) from a staging `source_repo` to a release
 * `target_repo`.
 */
export interface PromotionRule {
  id: string;
  name: string;
  source_repo_id: string;
  target_repo_id: string;
  is_enabled: boolean;
  auto_promote: boolean;
  require_signature: boolean;
  allowed_licenses: string[];
  max_cve_severity: string | null;
  min_health_score: number | null;
  min_staging_hours: number | null;
  max_artifact_age_days: number | null;
  created_at: string;
  updated_at: string;
}

/** Create body — source/target are required and fixed for the rule's lifetime. */
export interface CreatePromotionRuleRequest {
  name: string;
  source_repo_id: string;
  target_repo_id: string;
  auto_promote?: boolean;
  is_enabled?: boolean;
  require_signature?: boolean;
  allowed_licenses?: string[];
  max_cve_severity?: string | null;
  min_health_score?: number | null;
  min_staging_hours?: number | null;
  max_artifact_age_days?: number | null;
}

/** Update body — `source_repo_id`/`target_repo_id` are NOT updatable (SDK omits them). */
export type UpdatePromotionRuleRequest = Partial<
  Omit<CreatePromotionRuleRequest, 'source_repo_id' | 'target_repo_id'>
>;

/** Summary of a rule evaluation run. */
export interface RuleEvaluation {
  rule_id: string;
  rule_name: string;
  passed: number;
  failed: number;
  total: number;
}

function adapt(sdk: PromotionRuleResponse): PromotionRule {
  return {
    id: sdk.id,
    name: sdk.name,
    source_repo_id: sdk.source_repo_id,
    target_repo_id: sdk.target_repo_id,
    is_enabled: sdk.is_enabled,
    auto_promote: sdk.auto_promote,
    require_signature: sdk.require_signature,
    allowed_licenses: sdk.allowed_licenses ?? [],
    max_cve_severity: sdk.max_cve_severity ?? null,
    min_health_score: sdk.min_health_score ?? null,
    min_staging_hours: sdk.min_staging_hours ?? null,
    max_artifact_age_days: sdk.max_artifact_age_days ?? null,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
  };
}

function adaptEvaluation(sdk: BulkEvaluationResponse): RuleEvaluation {
  return {
    rule_id: sdk.rule_id,
    rule_name: sdk.rule_name,
    passed: sdk.passed,
    failed: sdk.failed,
    total: sdk.total_artifacts,
  };
}

const promotionRulesApi = {
  list: async (): Promise<PromotionRule[]> => {
    const { data, error } = await listRules();
    if (error) throw error;
    return assertData(data, 'promotionRulesApi.list').items.map(adapt);
  },

  get: async (id: string): Promise<PromotionRule> => {
    const { data, error } = await getRule({ path: { id } });
    if (error) throw error;
    return adapt(assertData(data, 'promotionRulesApi.get'));
  },

  create: async (req: CreatePromotionRuleRequest): Promise<PromotionRule> => {
    const { data, error } = await createRule({ body: req });
    if (error) throw error;
    return adapt(assertData(data, 'promotionRulesApi.create'));
  },

  update: async (id: string, req: UpdatePromotionRuleRequest): Promise<PromotionRule> => {
    const { data, error } = await updateRule({ path: { id }, body: req });
    if (error) throw error;
    return adapt(assertData(data, 'promotionRulesApi.update'));
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await deleteRule({ path: { id } });
    if (error) throw error;
  },

  /** Dry-run a rule against the source repo's artifacts; returns pass/fail counts. */
  evaluate: async (id: string): Promise<RuleEvaluation> => {
    const { data, error } = await evaluateRule({ path: { id } });
    if (error) throw error;
    return adaptEvaluation(assertData(data, 'promotionRulesApi.evaluate'));
  },
};

export default promotionRulesApi;
