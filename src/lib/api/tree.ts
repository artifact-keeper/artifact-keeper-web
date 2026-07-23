import '@/lib/sdk-client';
import { z } from 'zod';
import { getTree } from '@artifact-keeper/sdk';
import type { TreeNodeResponse } from '@artifact-keeper/sdk';
import { assertData, narrowEnum } from '@/lib/api/fetch';

// Re-export types from the canonical types/ module
export type { TreeNodeType, TreeNode } from '@/types/tree';
import type {
  TreeNode,
  TreeNodeType,
  TreeNodeMetadata,
  FolderDedupUsage,
} from '@/types/tree';

/**
 * Trust-boundary schema for the per-folder deduplicated storage breakdown
 * (backend epic artifact-keeper#2056 sub-task 4). The generated SDK does NOT
 * model this — v1.6.0 ships only the repo-level `/storage` operation and its
 * `TreeNodeResponse` carries just `size_bytes` — so the folder dedup figures,
 * when a future backend attaches them to the tree response, arrive as untyped
 * passthrough. This zod schema is the validation gate the migration keeps
 * exactly where a generated operation is still genuinely absent: it coerces the
 * numeric fields, drops anything malformed, and yields `undefined` (rather than
 * a partial/garbage object) when the backend omits the breakdown entirely.
 */
const folderDedupSchema = z
  .object({
    logical_bytes: z.number().finite().nullish(),
    physical_bytes: z.number().finite().nullish(),
    unique_bytes: z.number().finite().nullish(),
    shared_bytes: z.number().finite().nullish(),
    dedup_ratio: z.number().finite().nullish(),
  })
  .partial();

/**
 * Extract and validate the per-folder dedup breakdown from an untyped tree
 * node. Returns `undefined` when the node carries no dedup object or every
 * field is absent, so callers can treat "absent" as "not reported" instead of
 * "zero". The breakdown may live either at `node.dedup` or nested under
 * `node.metadata.folder.dedup`, mirroring the two shapes the folder metadata
 * has taken across backend revisions.
 */
function extractFolderDedup(
  passthrough: Record<string, unknown>,
): FolderDedupUsage | undefined {
  const metadata =
    passthrough.metadata && typeof passthrough.metadata === 'object'
      ? (passthrough.metadata as Record<string, unknown>)
      : undefined;
  const folder =
    metadata?.folder && typeof metadata.folder === 'object'
      ? (metadata.folder as Record<string, unknown>)
      : undefined;
  const raw = passthrough.dedup ?? folder?.dedup;
  if (!raw || typeof raw !== 'object') return undefined;

  const parsed = folderDedupSchema.safeParse(raw);
  if (!parsed.success) return undefined;

  // Collapse an all-empty result (backend returned `{}` or only nulls) to
  // `undefined` so the UI shows "not reported" rather than a row of zeros.
  const hasAnyValue = Object.values(parsed.data).some(
    (v) => v !== undefined && v !== null,
  );
  return hasAnyValue ? parsed.data : undefined;
}

export interface GetChildrenParams {
  repository_key?: string;
  path?: string;
  include_metadata?: boolean;
}

const TREE_NODE_TYPES = new Set<TreeNodeType>([
  'root',
  'repository',
  'folder',
  'package',
  'version',
  'artifact',
  'metadata',
]);

// SDK TreeNodeResponse.type is `string`; narrow to local TreeNodeType,
// defaulting unknown values to 'folder' so the UI stays renderable.
function adaptTreeNode(sdk: TreeNodeResponse): TreeNode {
  // SDK type doesn't model `metadata`, but the backend returns it when
  // `include_metadata=true` and tree pages render it. Read via passthrough
  // and trust the shape — the UI defensively handles missing inner fields.
  const passthrough = sdk as unknown as Record<string, unknown>;
  const metadata =
    passthrough.metadata && typeof passthrough.metadata === 'object'
      ? (passthrough.metadata as TreeNodeMetadata)
      : undefined;

  // Per-folder deduplicated storage (artifact-keeper#2056 sub-task 4) is not
  // modelled by the SDK, so it comes through as validated passthrough. Merge it
  // into the folder metadata when present; leave the node untouched otherwise so
  // existing folder rendering is byte-for-byte unchanged against current
  // backends that don't report it.
  const dedup = extractFolderDedup(passthrough);
  const mergedMetadata: TreeNodeMetadata | undefined = dedup
    ? {
        ...metadata,
        folder: { file_count: 0, folder_count: 0, ...metadata?.folder, dedup },
      }
    : metadata;

  return {
    id: sdk.id,
    name: sdk.name,
    type: narrowEnum(sdk.type, TREE_NODE_TYPES, 'folder'),
    path: sdk.path,
    has_children: sdk.has_children,
    children_count: sdk.children_count ?? undefined,
    metadata: mergedMetadata,
  };
}

export const treeApi = {
  getChildren: async (params: GetChildrenParams = {}): Promise<TreeNode[]> => {
    const { data, error } = await getTree({
      query: {
        repository_key: params.repository_key,
        path: params.path,
        include_metadata: params.include_metadata,
      },
    });
    if (error) throw error;
    return assertData(data, 'treeApi.getChildren').nodes.map(adaptTreeNode);
  },

  async getContent(params: {
    repository_key: string;
    path: string;
    max_bytes?: number;
  }): Promise<{ data: ArrayBuffer; contentType: string; totalSize: number }> {
    const searchParams = new URLSearchParams({
      repository_key: params.repository_key,
      path: params.path,
    });
    if (params.max_bytes) {
      searchParams.set("max_bytes", params.max_bytes.toString());
    }

    const res = await fetch(`/api/v1/tree/content?${searchParams}`, {
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch content: ${res.status}`);
    }

    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const totalSize = parseInt(res.headers.get("x-content-size") || "0", 10);
    const data = await res.arrayBuffer();

    return { data, contentType, totalSize };
  },
};

export default treeApi;
