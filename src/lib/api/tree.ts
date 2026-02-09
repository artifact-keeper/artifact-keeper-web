/* eslint-disable @typescript-eslint/no-explicit-any */
import '@/lib/sdk-client';
import { getTree } from '@artifact-keeper/sdk';

// Re-export types from the canonical types/ module
export type { TreeNodeType, TreeNode } from '@/types/tree';
import type { TreeNode } from '@/types/tree';

export interface GetChildrenParams {
  repository_key?: string;
  path?: string;
  include_metadata?: boolean;
}

export const treeApi = {
  getChildren: async (params: GetChildrenParams = {}): Promise<TreeNode[]> => {
    const { data, error } = await getTree({
      query: {
        repository_key: params.repository_key,
        path: params.path,
        include_metadata: params.include_metadata,
      } as any,
    });
    if (error) throw error;
    return (data as any).nodes as TreeNode[];
  },
};

export default treeApi;
