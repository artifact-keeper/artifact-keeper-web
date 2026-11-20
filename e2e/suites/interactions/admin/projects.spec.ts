import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Projects (#988): create a project, add a member, put a repository in it,
 * against the real backend.
 *
 * The project, its member grant and the repository are created through the UI
 * and then read back through the API, so what is asserted is what the backend
 * stored, not what the page displays. Everything is owned by this spec and
 * removed afterwards.
 *
 * Runs as the instance administrator (the `interactions` project's storage
 * state). The member is the seeded `e2e-developer`.
 */

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PROJECT_KEY = `e2eproj${RUN}`;
const PROJECT_NAME = `E2E Project ${RUN}`;
const REPO_KEY = `${PROJECT_KEY}-lib`;
const LOOSE_KEY = `e2eloose${RUN}`;

interface StoredProject {
  id: string;
  key: string;
  name: string;
  quota_bytes: number | null;
}
interface StoredMember {
  principal_type: string;
  principal_id: string;
  actions: string[];
}

async function findProject(request: APIRequestContext): Promise<StoredProject | undefined> {
  const resp = await request.get('/api/v1/projects');
  expect(resp.ok(), `GET projects: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { items: StoredProject[] };
  return body.items.find((p) => p.key === PROJECT_KEY);
}

test.describe('Projects', () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`/api/v1/repositories/${REPO_KEY}`).catch(() => {});
    await request.delete(`/api/v1/repositories/${LOOSE_KEY}`).catch(() => {});
    const project = await findProject(request).catch(() => undefined);
    if (project) await request.delete(`/api/v1/projects/${project.id}`).catch(() => {});
  });

  test('create a project, add a member and put a repository in it', async ({ page, request }) => {
    // A repository that belongs to no project yet; the project will take it in.
    const created = await request.post('/api/v1/repositories', {
      data: { key: REPO_KEY, name: REPO_KEY, format: 'generic', repo_type: 'local' },
    });
    expect(created.ok(), `create ${REPO_KEY}: ${created.status()} ${await created.text()}`).toBeTruthy();

    // --- create the project ---
    await page.goto('/projects');
    await page.getByRole('button', { name: 'New project' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#project-key').fill(PROJECT_KEY);
    await dialog.locator('#project-name').fill(PROJECT_NAME);
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();

    // Creating lands on the new project's page.
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: PROJECT_NAME })).toBeVisible({ timeout: 15000 });

    // Read it back from the backend (not from the page).
    let project: StoredProject | undefined;
    await expect
      .poll(async () => (project = await findProject(request)), { timeout: 15000 })
      .toBeDefined();
    expect(project, 'the backend stored the project').toBeDefined();
    expect(project!.name).toBe(PROJECT_NAME);

    // --- add a member ---
    await page.getByRole('tab', { name: 'Members' }).click();
    await page.getByRole('button', { name: 'Add member' }).first().click();
    const memberDialog = page.getByRole('dialog');
    await memberDialog.locator('#member-principal').click();
    await page.getByRole('option', { name: /e2e-developer/ }).click();
    await memberDialog.getByRole('button', { name: 'Add', exact: true }).click();

    // The default role is Developer: read and write.
    await expect(page.getByRole('row', { name: /e2e-developer/ })).toContainText('Developer', {
      timeout: 15000,
    });
    const membersResp = await request.get(`/api/v1/projects/${project!.id}/members`);
    expect(membersResp.ok()).toBeTruthy();
    const members = ((await membersResp.json()) as { items: StoredMember[] }).items;
    const developer = members.find((m) => m.principal_type === 'user' && m.actions.includes('write'));
    expect(developer, 'the developer grant was stored').toBeDefined();
    expect([...developer!.actions].sort()).toEqual(['read', 'write']);

    // --- put the repository in the project ---
    await page.getByRole('tab', { name: 'Repositories' }).click();
    await page.getByRole('button', { name: 'Add existing' }).click();
    const pickDialog = page.getByRole('dialog');
    await pickDialog.getByLabel('Find a repository').fill(REPO_KEY);
    await pickDialog.getByRole('button', { name: REPO_KEY, exact: true }).click();
    await pickDialog.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.getByRole('link', { name: REPO_KEY })).toBeVisible({ timeout: 15000 });
    const repoResp = await request.get(`/api/v1/repositories/${REPO_KEY}`);
    expect(((await repoResp.json()) as { project_id: string }).project_id).toBe(project!.id);
  });

  test('a repository in a project shows its project, and the list can be filtered to it', async ({
    page,
    request,
  }) => {
    const projectResp = await request.post('/api/v1/projects', {
      data: { key: PROJECT_KEY, name: PROJECT_NAME },
    });
    expect(projectResp.ok(), `create project: ${projectResp.status()}`).toBeTruthy();
    const project = (await projectResp.json()) as StoredProject;
    for (const [key, projectId] of [[REPO_KEY, project.id], [LOOSE_KEY, undefined]] as const) {
      const resp = await request.post('/api/v1/repositories', {
        data: { key, name: key, format: 'generic', repo_type: 'local', project_id: projectId },
      });
      expect(resp.ok(), `create ${key}: ${resp.status()} ${await resp.text()}`).toBeTruthy();
    }

    await page.goto('/repositories');
    const list = page.getByRole('main');
    // A repository row is one button whose name starts with its key (the key
    // is also the display name here, so the bare text appears twice).
    const row = (key: string) => list.getByRole('button', { name: new RegExp(`^${key}\\b`) });
    await expect(row(REPO_KEY)).toBeVisible({ timeout: 15000 });
    // The row names the project it belongs to.
    await expect(list.getByText(PROJECT_NAME).first()).toBeVisible();

    // Filtering to the project hides a repository that is in none.
    await page.getByLabel('Filter by project').click();
    await page.getByRole('option', { name: PROJECT_NAME }).click();
    await expect(row(REPO_KEY)).toBeVisible({ timeout: 15000 });
    await expect(row(LOOSE_KEY)).toHaveCount(0);

    // "No project" shows the opposite.
    await page.getByLabel('Filter by project').click();
    await page.getByRole('option', { name: 'No project' }).click();
    await expect(row(LOOSE_KEY)).toBeVisible({ timeout: 15000 });
    await expect(row(REPO_KEY)).toHaveCount(0);
  });

  test('the project scope from the sidebar is only for this session and says so', async ({
    page,
    request,
  }) => {
    const projectResp = await request.post('/api/v1/projects', {
      data: { key: PROJECT_KEY, name: PROJECT_NAME },
    });
    expect(projectResp.ok()).toBeTruthy();
    const project = (await projectResp.json()) as StoredProject;
    const repo = await request.post('/api/v1/repositories', {
      data: { key: REPO_KEY, name: REPO_KEY, format: 'generic', repo_type: 'local', project_id: project.id },
    });
    expect(repo.ok()).toBeTruthy();

    await page.goto('/repositories');
    await page.getByRole('button', { name: 'Switch project' }).click();
    await page.getByRole('option', { name: new RegExp(PROJECT_NAME) }).click();

    // The list says it is scoped, and offers the way out.
    await expect(page.getByRole('status').filter({ hasText: PROJECT_NAME })).toBeVisible({ timeout: 15000 });
    expect(await page.evaluate(() => sessionStorage.getItem('ak-active-project'))).toBe(project.id);
    expect(await page.evaluate(() => localStorage.getItem('ak-active-project'))).toBeNull();

    await page.getByRole('button', { name: 'Show all' }).click();
    await expect(page.getByRole('button', { name: 'Show all' })).toHaveCount(0);
  });
});
