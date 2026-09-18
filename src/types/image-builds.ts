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

export type PackageManager = "apt" | "dnf" | "microdnf" | "yum" | "apk" | "pip" | "conda";

export const SYSTEM_PACKAGE_MANAGERS: ReadonlySet<PackageManager> = new Set<PackageManager>([
  "apt",
  "dnf",
  "microdnf",
  "yum",
  "apk",
]);

/** One install step; groups render in order. */
export interface PackageGroup {
  manager: PackageManager;
  packages: string[];
  /** conda only. */
  channels?: string[];
}

export interface ImageBuildSpec {
  base_image: string;
  /** Install steps, in order. */
  packages: PackageGroup[];
  /** Build pip groups in a separate stage and copy only the installed packages. */
  multistage: boolean;
  /** A whole Dockerfile instead of the structured fields (admin-enabled). */
  dockerfile?: string | null;
  env: Record<string, string>;
  labels: Record<string, string>;
  user?: string | null;
  workdir?: string | null;
  run: string[];
  /** Legacy shorthand fields older builds recorded; folded into groups by the server. */
  apt?: string[];
  conda?: string[];
  conda_channels?: string[];
  pip?: string[];
}

/** What the registry knows about a base image stored here; `found: false` otherwise. */
export interface BaseImageInfo {
  found: boolean;
  reference?: string;
  digest?: string;
  os?: string;
  architecture?: string;
  /** The user the base runs as. */
  user?: string;
  /** apt | dnf | microdnf | yum | apk, from the image's own build history and labels. */
  system_manager?: PackageManager;
  has_pip: boolean;
  has_conda: boolean;
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
  /** Whole-Dockerfile specs are accepted on this instance. */
  allow_dockerfile?: boolean;
  /** Package managers a spec may install with. */
  supported_package_managers?: PackageManager[];
  /** Building is restricted to administrators on this instance (the default). */
  admin_only?: boolean;
  /** Server-side verdict for the caller: write access on the repo, plus admin when admin_only. */
  caller_may_build?: boolean;
  /** The pip index every generated `pip install` uses, when the instance pins one. */
  pip_index_url?: string | null;
  timeout_secs: number;
  max_concurrent: number;
  push_registry?: string | null;
}

export interface RenderImageBuildResponse {
  containerfile: string;
  warnings: string[];
}
