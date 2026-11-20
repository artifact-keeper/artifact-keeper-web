import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { projectsApi, type Project, type ProjectMember } from "@/lib/api/projects";
import { QUERY_KEYS } from "@/lib/query-keys";

/** Projects change rarely; do not rebuild the list on every mount or focus. */
const PROJECT_LIST_STALE_MS = 5 * 60 * 1000;

export function projectListKey() {
  return [...QUERY_KEYS.PROJECTS, "list"] as const;
}

export function projectMembersKey(projectId: string) {
  return [...QUERY_KEYS.PROJECTS, projectId, "members"] as const;
}

/**
 * Projects the caller can see. For anyone but a global admin this is rebuilt
 * from their repositories (see `projectsApi.list`), which is several requests,
 * so it is cached for a few minutes and not refetched on every focus.
 */
export function useProjects(options?: {
  enabled?: boolean;
  /** `false` skips the global-admin-only endpoint, which would be a certain 403. */
  isGlobalAdmin?: boolean;
}): UseQueryResult<Project[], Error> {
  return useQuery({
    queryKey: projectListKey(),
    queryFn: () => projectsApi.list({ isGlobalAdmin: options?.isGlobalAdmin }),
    enabled: options?.enabled,
    staleTime: PROJECT_LIST_STALE_MS,
    refetchOnWindowFocus: false,
  });
}

export function useProjectMembers(
  projectId: string | undefined,
): UseQueryResult<ProjectMember[], Error> {
  return useQuery({
    queryKey: projectMembersKey(projectId ?? ""),
    queryFn: () => projectsApi.listMembers(projectId!),
    enabled: !!projectId,
  });
}
