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
