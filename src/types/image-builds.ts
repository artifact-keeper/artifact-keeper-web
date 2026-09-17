/**
 * Image builder + inspector (backend `handlers/image_builds.rs`). Hand-typed
 * because the generated SDK predates these endpoints; snake_case is the wire.
 */

export interface ImagePlatform {
  os: string;
  architecture: string;
  variant?: string | null;
}

export interface ImageConfig {
  env: Record<string, string>;
  entrypoint: string[];
  cmd: string[];
  user: string;
  working_dir: string;
  exposed_ports: string[];
  labels: Record<string, string>;
}

export interface ImageHistoryEntry {
  created_by: string;
  created?: string | null;
  comment?: string | null;
  empty_layer: boolean;
  layer_digest?: string | null;
  size_bytes?: number | null;
}

export interface ImageLayer {
  digest: string;
  media_type: string;
  size_bytes: number;
}

export interface ImageProvenance {
  attestation_digest: string;
  predicate_type?: string | null;
  build_type?: string | null;
  builder_id?: string | null;
  /** The real Dockerfile, present for BuildKit `mode=max` provenance. */
  dockerfile?: string | null;
  dockerfile_name?: string | null;
}

export interface ImageInspect {
  reference: string;
  digest: string;
  index_digest?: string | null;
  platforms: ImagePlatform[];
  size_bytes: number;
  config: ImageConfig;
  history: ImageHistoryEntry[];
  layers: ImageLayer[];
  provenance?: ImageProvenance | null;
  source: string;
}

export interface ImageBuildSpec {
  base_image: string;
  apt: string[];
  conda: string[];
  conda_channels: string[];
  pip: string[];
  env: Record<string, string>;
  labels: Record<string, string>;
  user?: string | null;
  workdir?: string | null;
  run: string[];
}

export type ImageBuildStatus = "queued" | "running" | "succeeded" | "failed";

export interface ImageBuild {
  id: string;
  repository_key: string;
  image: string;
  tag: string;
  reference: string;
  status: ImageBuildStatus | string;
  digest?: string | null;
  error?: string | null;
  spec: ImageBuildSpec;
  containerfile: string;
  requested_by: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  log_bytes: number;
}

export interface ImageBuildSettings {
  enabled: boolean;
  repository_buildable: boolean;
  base_allowlist: string[];
  allow_run: boolean;
  timeout_secs: number;
  max_concurrent: number;
  push_registry?: string | null;
}

export interface RenderImageBuildResponse {
  containerfile: string;
  warnings: string[];
}
