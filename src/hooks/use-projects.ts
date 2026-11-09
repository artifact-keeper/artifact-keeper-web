import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { projectsApi, type Project, type ProjectMember } from "@/lib/api/projects";
import { QUERY_KEYS } from "@/lib/query-keys";

export function projectListKey() {
  return [...QUERY_KEYS.PROJECTS, "list"] as const;
}

export function projectMembersKey(projectId: string) {
  return [...QUERY_KEYS.PROJECTS, projectId, "members"] as const;
}

/** Projects the caller can see. */
export function useProjects(options?: {
  enabled?: boolean;
}): UseQueryResult<Project[], Error> {
  return useQuery({
    queryKey: projectListKey(),
    queryFn: () => projectsApi.list(),
    enabled: options?.enabled,
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
