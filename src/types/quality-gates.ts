// Quality gate and health score types

export interface QualityGate {
  id: string;
  repository_id?: string | null;
  name: string;
  description?: string | null;
  min_health_score?: number | null;
  min_security_score?: number | null;
  min_quality_score?: number | null;
  min_metadata_score?: number | null;
  max_critical_issues?: number | null;
  max_high_issues?: number | null;
  max_medium_issues?: number | null;
  required_checks: string[];
  enforce_on_promotion: boolean;
  enforce_on_download: boolean;
  action: string; // 'allow' | 'warn' | 'block'
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateQualityGateRequest {
  repository_id?: string | null;
  name: string;
  description?: string | null;
  min_health_score?: number | null;
  min_security_score?: number | null;
  min_quality_score?: number | null;
  min_metadata_score?: number | null;
  max_critical_issues?: number | null;
  max_high_issues?: number | null;
  max_medium_issues?: number | null;
  required_checks?: string[];
  enforce_on_promotion?: boolean;
  enforce_on_download?: boolean;
  action?: string;
}

export interface UpdateQualityGateRequest {
  name?: string;
  description?: string | null;
  min_health_score?: number | null;
  min_security_score?: number | null;
  min_quality_score?: number | null;
  min_metadata_score?: number | null;
  max_critical_issues?: number | null;
  max_high_issues?: number | null;
  max_medium_issues?: number | null;
  required_checks?: string[];
  enforce_on_promotion?: boolean;
  enforce_on_download?: boolean;
  action?: string;
  is_enabled?: boolean;
}

export interface ArtifactHealth {
  artifact_id: string;
  health_score: number;
  health_grade: string;
  security_score?: number | null;
  license_score?: number | null;
  quality_score?: number | null;
  metadata_score?: number | null;
  total_issues: number;
  critical_issues: number;
  checks_passed: number;
  checks_total: number;
  last_checked_at?: string | null;
}

export interface RepoHealth {
  repository_id: string;
  repository_key: string;
  health_score: number;
  health_grade: string;
  avg_security_score?: number | null;
  avg_license_score?: number | null;
  avg_quality_score?: number | null;
  avg_metadata_score?: number | null;
  artifacts_evaluated: number;
  artifacts_passing: number;
  artifacts_failing: number;
  last_evaluated_at?: string | null;
}

export interface HealthDashboard {
  total_repositories: number;
  total_artifacts_evaluated: number;
  avg_health_score: number;
  repos_grade_a: number;
  repos_grade_b: number;
  repos_grade_c: number;
  repos_grade_d: number;
  repos_grade_f: number;
  repositories: RepoHealth[];
}

// Action badge colors
export const ACTION_COLORS: Record<string, string> = {
  allow:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  warn:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  block:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
};

export const GRADE_COLORS: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  B: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  C: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  D: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  F: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export const CHECK_TYPES = [
  "security",
  "license",
  "quality",
  "metadata",
] as const;

export const CHECK_TYPE_LABELS: Record<string, string> = {
  security: "Security",
  license: "License",
  quality: "Quality",
  metadata: "Metadata",
};
