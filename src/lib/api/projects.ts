import { ApiError, apiFetch } from '@/lib/api/fetch';
import { repositoriesApi } from '@/lib/api/repositories';

// Projects (backend 1.11, artifact-keeper#2472) are not in the SDK 1.7.0 this
// build pins, so these calls go through `apiFetch` with local wire types.
interface WireProject {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  quota_bytes?: number | null;
  created_at: string;
  updated_at: string;
}

interface WireMember {
  principal_type: string;
  principal_id: string;
  actions: string[];
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export type ProjectPrincipalType = 'user' | 'service_account' | 'group';
export type ProjectAction = 'read' | 'write' | 'delete' | 'admin';

export interface Project {
  id: string;
  key: string;
  name: string;
  description?: string;
  /** Aggregate storage cap in bytes across the project's repositories. Undefined = unlimited. */
  quota_bytes?: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  principal_type: ProjectPrincipalType;
  principal_id: string;
  actions: ProjectAction[];
}

export interface CreateProjectInput {
  key: string;
  name: string;
  description?: string;
  quota_bytes?: number;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  /** Global admin only; a project admin sending this gets a 403. */
  quota_bytes?: number;
}

const PRINCIPAL_TYPES = new Set<string>(['user', 'service_account', 'group']);
const ACTIONS = new Set<string>(['read', 'write', 'delete', 'admin']);

/** Project keys are URL-safe and become the `<key>-` prefix of repository keys. */
export const PROJECT_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Named permission presets over the backend's raw action list. The backend
 * stores plain actions on a membership; the preset name is purely a UI label
 * derived from them (see `roleForActions`).
 */
export const PROJECT_ROLES = [
  { value: 'viewer', label: 'Viewer', actions: ['read'] },
  { value: 'developer', label: 'Developer', actions: ['read', 'write'] },
  { value: 'maintainer', label: 'Maintainer', actions: ['read', 'write', 'delete'] },
  { value: 'admin', label: 'Project Admin', actions: ['read', 'write', 'delete', 'admin'] },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  actions: readonly ProjectAction[];
}>;

export type ProjectRole = (typeof PROJECT_ROLES)[number]['value'];

export function actionsForRole(role: ProjectRole): ProjectAction[] {
  const found = PROJECT_ROLES.find((r) => r.value === role);
  return found ? [...found.actions] : ['read'];
}

/** Label for an action set: the matching preset, or "Custom" for anything else. */
export function roleLabelForActions(actions: readonly string[]): string {
  const set = new Set(actions);
  const found = PROJECT_ROLES.find(
    (r) => r.actions.length === set.size && r.actions.every((a) => set.has(a)),
  );
  return found?.label ?? 'Custom';
}

function adaptProject(sdk: WireProject): Project {
  return {
    id: sdk.id,
    key: sdk.key,
    name: sdk.name,
    description: sdk.description ?? undefined,
    quota_bytes: sdk.quota_bytes != null && sdk.quota_bytes > 0 ? sdk.quota_bytes : undefined,
    created_at: sdk.created_at,
    updated_at: sdk.updated_at,
  };
}

function adaptMember(sdk: WireMember): ProjectMember {
  return {
    principal_type: PRINCIPAL_TYPES.has(sdk.principal_type)
      ? (sdk.principal_type as ProjectPrincipalType)
      : 'user',
    principal_id: sdk.principal_id,
    actions: sdk.actions.filter((a): a is ProjectAction => ACTIONS.has(a)),
  };
}

export const projectsApi = {
  /**
   * `GET /projects` is global-admin only (artifact-keeper 1.11). A project
   * admin who is not a global admin gets a 403, so fall back to the projects
   * their visible repositories belong to, reading each one (which a project
   * admin may do). Projects where the caller is only a plain member are not
   * readable and are skipped: the backend gives them no way to see the
   * project record.
   */
  list: async (): Promise<Project[]> => {
    try {
      const data = await apiFetch<{ items: WireProject[] }>('/api/v1/projects');
      return data.items.map(adaptProject);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 403) throw error;
    }
    const repos = await repositoriesApi.list({ per_page: 1000 });
    const ids = [
      ...new Set(repos.items.map((r) => r.project_id).filter((id): id is string => !!id)),
    ];
    const settled = await Promise.allSettled(ids.map((id) => projectsApi.get(id)));
    return settled
      .filter((r): r is PromiseFulfilledResult<Project> => r.status === 'fulfilled')
      .map((r) => r.value)
      .sort((a, b) => a.key.localeCompare(b.key));
  },

  get: async (id: string): Promise<Project> => {
    return adaptProject(await apiFetch<WireProject>(`/api/v1/projects/${encodeURIComponent(id)}`));
  },

  create: async (input: CreateProjectInput): Promise<Project> => {
    const data = await apiFetch<WireProject>('/api/v1/projects', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    });
    return adaptProject(data);
  },

  update: async (id: string, input: UpdateProjectInput): Promise<Project> => {
    const data = await apiFetch<WireProject>(`/api/v1/projects/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    });
    return adaptProject(data);
  },

  delete: async (id: string): Promise<void> => {
    await apiFetch<void>(`/api/v1/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  listMembers: async (id: string): Promise<ProjectMember[]> => {
    const data = await apiFetch<{ items: WireMember[] }>(
      `/api/v1/projects/${encodeURIComponent(id)}/members`,
    );
    return data.items.map(adaptMember);
  },

  /** Upsert: re-adding an existing principal replaces its actions. */
  addMember: async (id: string, member: ProjectMember): Promise<ProjectMember> => {
    const data = await apiFetch<WireMember>(`/api/v1/projects/${encodeURIComponent(id)}/members`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(member),
    });
    return adaptMember(data);
  },

  removeMember: async (
    id: string,
    member: Pick<ProjectMember, 'principal_type' | 'principal_id'>,
  ): Promise<void> => {
    await apiFetch<void>(`/api/v1/projects/${encodeURIComponent(id)}/members`, {
      method: 'DELETE',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        principal_type: member.principal_type,
        principal_id: member.principal_id,
      }),
    });
  },
};
