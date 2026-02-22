import { type APIRequestContext } from '@playwright/test';

const API_BASE = '/api/v1';

async function api(request: APIRequestContext, method: string, path: string, data?: unknown) {
  const url = `${API_BASE}${path}`;
  const options: Parameters<typeof request.fetch>[1] = { method };
  if (data) options.data = data;
  const resp = await request.fetch(url, options);
  if (!resp.ok() && resp.status() !== 409) {
    console.warn(`[tutorial-seed] ${method} ${path} failed (${resp.status()})`);
  }
  return resp;
}

/** Seed repositories that look like a real company setup. */
export async function seedTutorialRepos(request: APIRequestContext): Promise<void> {
  const repos = [
    {
      key: 'maven-releases',
      name: 'Maven Releases',
      format: 'maven',
      repo_type: 'local',
      description: 'Production Maven artifacts for release builds',
    },
    {
      key: 'maven-snapshots',
      name: 'Maven Snapshots',
      format: 'maven',
      repo_type: 'local',
      description: 'Maven snapshot builds from CI pipelines',
    },
    {
      key: 'npm-local',
      name: 'NPM Local',
      format: 'npm',
      repo_type: 'local',
      description: 'Internal NPM packages published by teams',
    },
    {
      key: 'npmjs-proxy',
      name: 'npmjs.org Proxy',
      format: 'npm',
      repo_type: 'remote',
      upstream_url: 'https://registry.npmjs.org',
      description: 'Caching proxy for the public NPM registry',
    },
    {
      key: 'npm-virtual',
      name: 'NPM Virtual',
      format: 'npm',
      repo_type: 'virtual',
      description: 'Aggregates npm-local and npmjs-proxy for a single endpoint',
    },
    {
      key: 'docker-hub-proxy',
      name: 'Docker Hub Proxy',
      format: 'docker',
      repo_type: 'remote',
      upstream_url: 'https://registry-1.docker.io',
      description: 'Caching proxy for Docker Hub images',
    },
    {
      key: 'docker-local',
      name: 'Docker Local',
      format: 'docker',
      repo_type: 'local',
      description: 'Internal Docker images built from CI',
    },
    {
      key: 'pypi-proxy',
      name: 'PyPI Proxy',
      format: 'pypi',
      repo_type: 'remote',
      upstream_url: 'https://pypi.org',
      description: 'Caching proxy for the Python Package Index',
    },
  ];

  for (const repo of repos) {
    await api(request, 'POST', '/repositories', repo);
  }
}

/** Seed a tutorial-specific quality gate. */
export async function seedTutorialQualityGate(request: APIRequestContext): Promise<void> {
  await api(request, 'POST', '/quality-gates', {
    name: 'production-release-gate',
    description: 'Blocks promotion to production if critical vulnerabilities are found',
    max_critical_issues: 0,
    max_high_issues: 3,
    required_checks: ['security'],
    action: 'block',
  });
}

/** Seed a tutorial user and group. */
export async function seedTutorialUsers(request: APIRequestContext): Promise<void> {
  await api(request, 'POST', '/users', {
    username: 'jane.smith',
    password: 'Tutorial1!',
    email: 'jane.smith@example.com',
    display_name: 'Jane Smith',
    is_admin: false,
  });

  await api(request, 'POST', '/groups', {
    name: 'platform-engineering',
    description: 'Platform engineering team with publish access to all repos',
  });
}

/** Run all tutorial seed functions. */
export async function seedTutorialData(request: APIRequestContext): Promise<void> {
  console.log('[tutorial-seed] Creating tutorial repositories...');
  await seedTutorialRepos(request);
  console.log('[tutorial-seed] Creating tutorial quality gate...');
  await seedTutorialQualityGate(request);
  console.log('[tutorial-seed] Creating tutorial users...');
  await seedTutorialUsers(request);
  console.log('[tutorial-seed] Done.');
}
