/**
 * Who may create and manage repositories, mirroring the backend (artifact-keeper
 * `POST /repositories`): a global admin may create anywhere, a project admin only
 * inside a project they administer, and a plain project member (read/write)
 * not at all.
 *
 * `administeredProjectIds` is the set of projects the caller can read. The
 * backend only lets a project admin read a project record, so for anyone who
 * is not a global admin that set is exactly the projects they administer.
 *
 * Known gap: a user holding a system-level `admin` permission grant may also
 * create repositories, but the API gives the web no way to see that grant, so
 * such a user is treated as unable to here.
 */
export function canCreateRepository(
  isGlobalAdmin: boolean,
  administeredProjectIds: ReadonlySet<string>,
): boolean {
  return isGlobalAdmin || administeredProjectIds.size > 0;
}

/** Edit and delete: global admins, and project admins for repositories in their project. */
export function canManageRepository(
  isGlobalAdmin: boolean,
  repoProjectId: string | undefined,
  administeredProjectIds: ReadonlySet<string>,
): boolean {
  return isGlobalAdmin || (!!repoProjectId && administeredProjectIds.has(repoProjectId));
}
