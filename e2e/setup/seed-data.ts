import { type APIRequestContext } from '@playwright/test';
import { TEST_ROLES } from './auth-states';

const API_BASE = '/api/v1';

/** Helper to make API requests as admin */
async function api(request: APIRequestContext, method: string, path: string, data?: unknown) {
  const url = `${API_BASE}${path}`;
  const options: Parameters<typeof request.fetch>[1] = { method };
  if (data) options.data = data;
  const resp = await request.fetch(url, options);
  if (!resp.ok()) {
    const body = await resp.text().catch(() => '');
    // 409 = already exists, which is fine for idempotent seeding
    if (resp.status() !== 409) {
      console.warn(`Seed API ${method} ${path} failed (${resp.status()}): ${body}`);
    }
  }
  return resp;
}

/** Create test users (non-admin roles) via the admin API */
export async function seedUsers(request: APIRequestContext): Promise<void> {
  for (const [roleName, role] of Object.entries(TEST_ROLES)) {
    if (roleName === 'admin') continue; // admin already exists
    await api(request, 'POST', '/admin/users', {
      username: role.username,
      password: role.password,
      email: role.email,
      display_name: role.displayName,
      is_admin: role.isAdmin,
    });
  }
}

/** Create test repositories */
export async function seedRepositories(request: APIRequestContext): Promise<void> {
  const repos = [
    { key: 'e2e-maven-local', name: 'E2E Maven Local', format: 'maven', repo_type: 'local' },
    { key: 'e2e-npm-remote', name: 'E2E NPM Remote', format: 'npm', repo_type: 'remote', upstream_url: 'https://registry.npmjs.org' },
    { key: 'e2e-docker-virtual', name: 'E2E Docker Virtual', format: 'docker', repo_type: 'virtual' },
  ];
  for (const repo of repos) {
    await api(request, 'POST', '/repositories', repo);
  }
}

/** Create test groups and assign members */
export async function seedGroups(request: APIRequestContext): Promise<void> {
  const groups = [
    { name: 'e2e-dev-team', description: 'Development team for E2E tests' },
    { name: 'e2e-security-team', description: 'Security team for E2E tests' },
  ];
  for (const group of groups) {
    await api(request, 'POST', '/groups', group);
  }
}

/** Create a test webhook */
export async function seedWebhook(request: APIRequestContext): Promise<void> {
  await api(request, 'POST', '/webhooks', {
    name: 'e2e-test-webhook',
    url: 'https://httpbin.org/post',
    events: ['artifact_uploaded', 'repository_created'],
  });
}

/** Create a test quality gate */
export async function seedQualityGate(request: APIRequestContext): Promise<void> {
  await api(request, 'POST', '/quality-gates', {
    name: 'e2e-test-gate',
    description: 'Quality gate for E2E tests',
    max_critical_issues: 0,
    max_high_issues: 5,
    required_checks: ['security'],
    action: 'warn',
  });
}

/** Create a test lifecycle policy */
export async function seedLifecyclePolicy(request: APIRequestContext): Promise<void> {
  await api(request, 'POST', '/lifecycle/policies', {
    name: 'e2e-test-cleanup',
    description: 'Cleanup policy for E2E tests',
    policy_type: 'max_age_days',
    config: { max_age_days: 30 },
    priority: 10,
  });
}

/** Create a test service account */
export async function seedServiceAccount(request: APIRequestContext): Promise<void> {
  await api(request, 'POST', '/service-accounts', {
    name: 'e2e-ci-bot',
    description: 'Service account for E2E tests',
  });
}

/** Run all seed functions */
export async function seedAll(request: APIRequestContext): Promise<void> {
  console.log('[seed] Creating test users...');
  await seedUsers(request);
  console.log('[seed] Creating test repositories...');
  await seedRepositories(request);
  console.log('[seed] Creating test groups...');
  await seedGroups(request);
  console.log('[seed] Creating test webhook...');
  await seedWebhook(request);
  console.log('[seed] Creating test quality gate...');
  await seedQualityGate(request);
  console.log('[seed] Creating test lifecycle policy...');
  await seedLifecyclePolicy(request);
  console.log('[seed] Creating test service account...');
  await seedServiceAccount(request);
  console.log('[seed] Done.');
}

/** Clean up seeded data (best-effort, called in teardown) */
export async function cleanupAll(request: APIRequestContext): Promise<void> {
  // Delete in reverse dependency order
  // Service accounts, webhooks, quality gates, lifecycle policies, groups, repos, users
  // Use list + delete pattern; ignore 404s
  console.log('[cleanup] Cleaning up seeded test data...');

  // These are best-effort; failures are logged but don't block
  await api(request, 'DELETE', '/webhooks/e2e-test-webhook').catch(() => {});
  await api(request, 'DELETE', '/repositories/e2e-maven-local').catch(() => {});
  await api(request, 'DELETE', '/repositories/e2e-npm-remote').catch(() => {});
  await api(request, 'DELETE', '/repositories/e2e-docker-virtual').catch(() => {});

  // Users (non-admin)
  for (const [roleName, role] of Object.entries(TEST_ROLES)) {
    if (roleName === 'admin') continue;
    await api(request, 'DELETE', `/admin/users/${role.username}`).catch(() => {});
  }

  console.log('[cleanup] Done.');
}
