export type TreeNodeType =
  | 'root'           // Root of the tree
  | 'repository'     // Repository container
  | 'folder'         // Virtual folder/directory
  | 'package'        // Package grouping
  | 'version'        // Version container
  | 'artifact'       // Actual artifact file
  | 'metadata';      // Metadata file (pom.xml, package.json, etc.)

export interface TreeNode {
  /** Unique identifier for this node */
  id: string;
  /** Display name */
  name: string;
  /** Type of node */
  type: TreeNodeType;
  /** Full path from root */
  path: string;
  /** Parent node ID (null for root) */
  parent_id?: string;
  /** Whether this node has children */
  has_children: boolean;
  /** Number of children (if known) */
  children_count?: number;
  /** Children nodes (loaded on demand) */
  children?: TreeNode[];
  /** Whether children are currently loading */
  is_loading?: boolean;
  /** Whether this node is expanded in the UI */
  is_expanded?: boolean;
  /** Type-specific metadata */
  metadata?: TreeNodeMetadata;
  /** Icon hint for the UI */
  icon?: string;
  /** Whether this node is selectable */
  is_selectable?: boolean;
  /** Whether this node is currently selected */
  is_selected?: boolean;
}

export interface TreeNodeMetadata {
  /** For repository nodes */
  repository?: TreeRepositoryMetadata;
  /** For package nodes */
  package?: TreePackageMetadata;
  /** For version nodes */
  version?: TreeVersionMetadata;
  /** For artifact nodes */
  artifact?: TreeArtifactMetadata;
  /** For folder nodes */
  folder?: TreeFolderMetadata;
}

export interface TreeRepositoryMetadata {
  repository_id: string;
  key: string;
  format: string;
  repo_type: string;
  is_public: boolean;
  artifact_count: number;
  storage_used_bytes: number;
}

export interface TreePackageMetadata {
  package_id: string;
  package_type: string;
  latest_version?: string;
  version_count: number;
  total_downloads: number;
}

export interface TreeVersionMetadata {
  version: string;
  is_latest: boolean;
  is_prerelease: boolean;
  artifact_count: number;
  total_size_bytes: number;
  created_at: string;
}

export interface TreeArtifactMetadata {
  artifact_id: string;
  size_bytes: number;
  checksum_sha256: string;
  content_type: string;
  download_count: number;
  created_at: string;
  /** Download URL for this artifact */
  download_url?: string;
}

export interface TreeFolderMetadata {
  /** Number of files in this folder (not recursive) */
  file_count: number;
  /** Number of subfolders */
  folder_count: number;
  /** Total size of files in this folder (not recursive) */
  total_size_bytes?: number;
  /**
   * Deduplicated per-folder storage (backend epic artifact-keeper#2056,
   * sub-task 4: `GET /api/v1/repositories/{key}/storage/tree`). Mirrors the
   * repo-level dedup accounting scoped to a single folder/path prefix so
   * operators can see which folders actually consume physical storage after
   * content-addressable deduplication — not just their logical footprint.
   *
   * IMPORTANT: these fields are OPTIONAL and are NOT part of the generated
   * `@artifact-keeper/sdk` (v1.6.0 ships only the repo-level `/storage`
   * operation; the folder-level API and the `repository_path_storage_stats`
   * rows it reads have not been released to the SDK/backend spec yet). The tree
   * API adapter therefore reads them from the response via a zod trust-boundary
   * schema and leaves them `undefined` when the backend omits them. Consumers
   * MUST treat "absent" as "not reported by this backend" rather than "zero",
   * exactly as the per-repository panel treats the #2560 field omission.
   */
  dedup?: FolderDedupUsage;
}

/**
 * Per-folder deduplicated storage breakdown. Field semantics mirror
 * `RepositoryStorageUsage` in `types/storage.ts` but scoped to one folder path.
 * Every figure is optional/nullable because the folder-level backend API is not
 * yet released; the fields travel together (present or all absent).
 */
export interface FolderDedupUsage {
  /** Sum of referenced artifact sizes in this folder, before deduplication. */
  logical_bytes?: number | null;
  /** Bytes physically stored for this folder after deduplication. */
  physical_bytes?: number | null;
  /** Physical bytes referenced only by artifacts under this folder. */
  unique_bytes?: number | null;
  /** Physical bytes this folder shares with artifacts elsewhere. */
  shared_bytes?: number | null;
  /** `logical_bytes / physical_bytes` for this folder. */
  dedup_ratio?: number | null;
}

export interface TreeLoadRequest {
  /** Parent node ID (null for root) */
  parent_id?: string;
  /** Repository to load (for root level) */
  repository_id?: string;
  /** Path within repository */
  path?: string;
  /** Maximum depth to load (default 1) */
  depth?: number;
  /** Whether to include artifact counts */
  include_counts?: boolean;
  /** Whether to include metadata */
  include_metadata?: boolean;
  /** Sort order for children */
  sort_by?: 'name' | 'type' | 'size' | 'date';
  sort_order?: 'asc' | 'desc';
}

export interface TreeLoadResponse {
  /** Parent node (if requested) */
  parent?: TreeNode;
  /** Child nodes */
  children: TreeNode[];
  /** Whether there are more children (for pagination) */
  has_more: boolean;
  /** Cursor for loading more */
  next_cursor?: string;
}

export interface TreeBreadcrumb {
  /** Node ID */
  id: string;
  /** Display name */
  name: string;
  /** Node type */
  type: TreeNodeType;
  /** Full path */
  path: string;
}

export interface TreePath {
  /** Repository key */
  repository_key: string;
  /** Path segments */
  segments: string[];
  /** Breadcrumb trail */
  breadcrumbs: TreeBreadcrumb[];
  /** Current node */
  current: TreeNode;
}

export interface TreeDisplayOptions {
  /** Show hidden files (starting with .) */
  show_hidden: boolean;
  /** Show file sizes */
  show_sizes: boolean;
  /** Show last modified dates */
  show_dates: boolean;
  /** Show download counts */
  show_downloads: boolean;
  /** Group by type (folders first, then files) */
  group_by_type: boolean;
  /** Default sort order */
  default_sort: 'name' | 'type' | 'size' | 'date';
  /** Default sort direction */
  default_sort_order: 'asc' | 'desc';
}
