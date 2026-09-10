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
    await api(request, 'POST', '/users', {
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
    // Visibility test repos: one public, one private (default).
    //
    // Both fields are sent on purpose. The backend accepts the pair whenever
    // they AGREE (it rejects only a `visibility` whose anonymous-readability
    // contradicts the boolean), and a backend that predates the visibility
    // column ignores the unknown field entirely rather than rejecting it —
    // `CreateRepositoryRequest` does not use `deny_unknown_fields`. Sending
    // `visibility` alone therefore created a PRIVATE repository against such a
    // backend, silently breaking the five pre-existing anonymous-read
    // assertions in `private-repo-visibility.spec.ts` that depend on
    // `e2e-public-pypi` actually being public. Keeping the boolean makes the
    // seed correct against both.
    { key: 'e2e-public-pypi', name: 'E2E Public PyPI', format: 'pypi', repo_type: 'local', visibility: 'public', is_public: true },
    { key: 'e2e-private-pypi', name: 'E2E Private PyPI', format: 'pypi', repo_type: 'local', visibility: 'private', is_public: false },
    // Readable by every signed-in user, never anonymously. Seeded so the
    // role-visibility and search suites can assert the state that neither of
    // the two above can stand in for.
    { key: 'e2e-internal-pypi', name: 'E2E Internal PyPI', format: 'pypi', repo_type: 'local', visibility: 'internal', is_public: false },
    // OCI counterpart. `/v2/*` is mounted outside the repo-visibility
    // middleware and was allowlisted wholesale by the guest-access guard, so
    // the anonymous-pull assertions need a Docker repo of their own.
    { key: 'e2e-internal-docker', name: 'E2E Internal Docker', format: 'docker', repo_type: 'local', visibility: 'internal', is_public: false },
    // Pub (Dart) repo so the Dart-specific setup-guide snippets (#748) have a
    // real target in the repo detail Setup tab.
    { key: 'e2e-pub-local', name: 'E2E Pub Local', format: 'pub', repo_type: 'local' },
    // Generic repo opted into first-class versioning (#571) so the
    // version-history UI has real revisions to exercise. Harmless on a
    // backend that predates the flag (the field is simply ignored).
    {
      key: 'e2e-generic-versioned',
      name: 'E2E Generic Versioned',
      format: 'generic',
      repo_type: 'local',
      versioning_enabled: true,
    },
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
  await api(request, 'POST', '/quality/gates', {
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
  await api(request, 'POST', '/admin/lifecycle', {
    name: 'e2e-test-cleanup',
    description: 'Cleanup policy for E2E tests',
    policy_type: 'max_age_days',
    config: { days: 30 },
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

/**
 * Record one service health check so the Monitoring page renders its populated
 * layout (alert card + health-log row) instead of the two empty states.
 *
 * The backend's own scheduler runs the first check 15-44s after boot, which
 * races the visual screenshot (~40-50s after boot in CI) and made the
 * `monitoring - desktop` baseline depend on scheduler jitter (#835).
 */
export async function seedHealthCheck(request: APIRequestContext): Promise<void> {
  await api(request, 'POST', '/admin/monitoring/check');
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
  console.log('[seed] Recording a service health check...');
  await seedHealthCheck(request);
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
  await api(request, 'DELETE', '/repositories/e2e-public-pypi').catch(() => {});
  await api(request, 'DELETE', '/repositories/e2e-private-pypi').catch(() => {});
  await api(request, 'DELETE', '/repositories/e2e-generic-versioned').catch(() => {});

  // Users (non-admin)
  for (const [roleName, role] of Object.entries(TEST_ROLES)) {
    if (roleName === 'admin') continue;
    await api(request, 'DELETE', `/users/${role.username}`).catch(() => {});
  }

  console.log('[cleanup] Done.');
}
