import '@/lib/sdk-client';
import { getTree } from '@artifact-keeper/sdk';
import type { TreeNodeResponse } from '@artifact-keeper/sdk';
import { assertData, narrowEnum } from '@/lib/api/fetch';

// Re-export types from the canonical types/ module
export type { TreeNodeType, TreeNode } from '@/types/tree';
import type { TreeNode, TreeNodeType, TreeNodeMetadata } from '@/types/tree';

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
  return {
    id: sdk.id,
    name: sdk.name,
    type: narrowEnum(sdk.type, TREE_NODE_TYPES, 'folder'),
    path: sdk.path,
    has_children: sdk.has_children,
    children_count: sdk.children_count ?? undefined,
    metadata,
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
