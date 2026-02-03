export type BuildStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

export interface Build {
  id: string;
  name: string;
  number: number;
  status: BuildStatus;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  agent?: string;
  created_at: string;
  updated_at: string;
  artifact_count?: number;
  modules?: BuildModule[];
  vcs_url?: string;
  vcs_revision?: string;
  vcs_branch?: string;
  vcs_message?: string;
  metadata?: Record<string, unknown>;
}

export interface BuildModule {
  id: string;
  build_id: string;
  module_name: string;
  name: string;
  path: string;
  checksum_sha256: string;
  size_bytes: number;
  created_at: string;
}

export interface BuildArtifact {
  name: string;
  path: string;
  checksum_sha256: string;
  size_bytes: number;
}

export interface BuildArtifactDiff {
  name: string;
  path: string;
  old_checksum: string;
  new_checksum: string;
  old_size_bytes: number;
  new_size_bytes: number;
}

export interface BuildDiff {
  build_a: string;
  build_b: string;
  added: BuildArtifact[];
  removed: BuildArtifact[];
  modified: BuildArtifactDiff[];
}
