export interface StorageSnapshot {
  snapshot_date: string;
  total_repositories: number;
  total_artifacts: number;
  total_storage_bytes: number;
  total_downloads: number;
  total_users: number;
}

export interface RepositorySnapshot {
  repository_id: string;
  repository_name: string | null;
  repository_key: string | null;
  snapshot_date: string;
  artifact_count: number;
  storage_bytes: number;
  download_count: number;
}

export interface RepositoryStorageBreakdown {
  repository_id: string;
  repository_key: string;
  repository_name: string;
  format: string;
  artifact_count: number;
  storage_bytes: number;
  download_count: number;
  last_upload_at: string | null;
}

export interface StaleArtifact {
  artifact_id: string;
  repository_key: string;
  name: string;
  path: string;
  size_bytes: number;
  created_at: string;
  last_downloaded_at: string | null;
  days_since_download: number;
  download_count: number;
}

export interface GrowthSummary {
  period_start: string;
  period_end: string;
  storage_bytes_start: number;
  storage_bytes_end: number;
  storage_growth_bytes: number;
  storage_growth_percent: number;
  artifacts_start: number;
  artifacts_end: number;
  artifacts_added: number;
  downloads_in_period: number;
}

export interface DownloadTrend {
  date: string;
  download_count: number;
}

export interface DateRangeQuery {
  from?: string;
  to?: string;
}

export interface StaleQuery {
  days?: number;
  limit?: number;
}
