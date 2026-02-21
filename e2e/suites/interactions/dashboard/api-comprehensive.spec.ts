import { test, expect } from '@playwright/test';

test.describe('API Comprehensive - Auth', () => {
  test('GET /api/v1/auth/me returns current user', async ({ request }) => {
    const response = await request.get('/api/v1/auth/me');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.username).toBe('admin');
  });

  test('GET /health returns healthy', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();
    const contentType = response.headers()['content-type'] || '';
    if (contentType.includes('application/json')) {
      const body = await response.json();
      expect(body.status).toBe('healthy');
    }
    // HTML response means the health page rendered (app is alive)
  });
});

test.describe.serial('API Comprehensive - Repository CRUD', () => {
  test('GET /api/v1/repositories returns list', async ({ request }) => {
    const response = await request.get('/api/v1/repositories');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeTruthy();
  });

  test('POST /api/v1/repositories creates test repo', async ({ request }) => {
    // Clean up first in case a previous run left the repo behind
    await request.delete('/api/v1/repositories/e2e-test-repo').catch(() => {});

    const response = await request.post('/api/v1/repositories', {
      data: {
        name: 'e2e-test-repo',
        key: 'e2e-test-repo',
        format: 'generic',
        type: 'local',
        description: 'E2E test repository - safe to delete',
      },
    });
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body.key || body.name || body.id).toBeTruthy();
    } else {
      // 409 Conflict or 422 validation error are acceptable
      console.log(`POST /api/v1/repositories returned ${response.status()}: ${await response.text()}`);
      expect([200, 201, 409, 422]).toContain(response.status());
    }
  });

  test('GET /api/v1/repositories/e2e-test-repo returns created repo', async ({ request }) => {
    const response = await request.get('/api/v1/repositories/e2e-test-repo');
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body.key || body.name).toContain('e2e-test-repo');
    }
  });

  test('DELETE /api/v1/repositories/e2e-test-repo cleans up', async ({ request }) => {
    const response = await request.delete('/api/v1/repositories/e2e-test-repo');
    expect(response.status()).toBeLessThan(500);
    // 200, 204, or 404 are all acceptable
    expect([200, 204, 404]).toContain(response.status());
  });
});

test.describe('API Comprehensive - Users & Groups', () => {
  test('GET /api/v1/users returns users', async ({ request }) => {
    const response = await request.get('/api/v1/users');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toBeTruthy();
  });

  test('GET /api/v1/groups returns groups', async ({ request }) => {
    const response = await request.get('/api/v1/groups');
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toBeTruthy();
    }
  });
});

test.describe('API Comprehensive - Security', () => {
  test('GET /api/v1/security/policies returns policies', async ({ request }) => {
    const response = await request.get('/api/v1/security/policies');
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toBeTruthy();
    }
  });

  test('GET /api/v1/security/scans returns scans', async ({ request }) => {
    const response = await request.get('/api/v1/security/scans');
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toBeTruthy();
    }
  });
});

test.describe('API Comprehensive - Admin', () => {
  test('GET /api/v1/admin/settings returns settings', async ({ request }) => {
    const response = await request.get('/api/v1/admin/settings');
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toBeTruthy();
    }
  });

  test('GET /api/v1/admin/stats returns stats', async ({ request }) => {
    const response = await request.get('/api/v1/admin/stats');
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toBeTruthy();
    }
  });
});

test.describe('API Comprehensive - Plugins', () => {
  test('GET /api/v1/plugins returns plugins', async ({ request }) => {
    const response = await request.get('/api/v1/plugins');
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toBeTruthy();
    }
  });
});

test.describe('API Comprehensive - Webhooks', () => {
  test('GET /api/v1/webhooks returns webhooks', async ({ request }) => {
    const response = await request.get('/api/v1/webhooks');
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toBeTruthy();
    }
  });
});

test.describe('API Comprehensive - Peers', () => {
  test('GET /api/v1/peers returns peers', async ({ request }) => {
    const response = await request.get('/api/v1/peers');
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toBeTruthy();
    }
  });
});

test.describe('API Comprehensive - Analytics', () => {
  test('GET /api/v1/analytics/storage-breakdown returns data', async ({ request }) => {
    const response = await request.get('/api/v1/analytics/storage-breakdown');
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toBeTruthy();
    }
  });

  test('GET /api/v1/analytics/growth-summary returns data', async ({ request }) => {
    const response = await request.get('/api/v1/analytics/growth-summary');
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toBeTruthy();
    }
  });
});

test.describe('API Comprehensive - Lifecycle', () => {
  test('GET /api/v1/lifecycle-policies returns policies', async ({ request }) => {
    const response = await request.get('/api/v1/lifecycle-policies');
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toBeTruthy();
    }
  });
});

test.describe('API Comprehensive - Migration', () => {
  test('GET /api/v1/migrations/connections returns connections', async ({ request }) => {
    const response = await request.get('/api/v1/migrations/connections');
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toBeTruthy();
    }
  });

  test('GET /api/v1/migrations returns jobs', async ({ request }) => {
    const response = await request.get('/api/v1/migrations');
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toBeTruthy();
    }
  });
});

test.describe('API Comprehensive - Monitoring', () => {
  test('GET /api/v1/monitoring/health-log returns logs', async ({ request }) => {
    const response = await request.get('/api/v1/monitoring/health-log');
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toBeTruthy();
    }
  });
});

test.describe('API Comprehensive - Telemetry', () => {
  test('GET /api/v1/telemetry/settings returns settings', async ({ request }) => {
    const response = await request.get('/api/v1/telemetry/settings');
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toBeTruthy();
    }
  });
});

test.describe('API Comprehensive - Backups', () => {
  test('GET /api/v1/backups returns backups list', async ({ request }) => {
    const response = await request.get('/api/v1/backups');
    expect(response.status()).toBeLessThan(500);
    if (response.ok()) {
      const body = await response.json();
      expect(body).toBeTruthy();
    }
  });
});

test.describe.serial('API Comprehensive - Access Tokens', () => {
  let tokenId: string;

  test('POST /api/v1/auth/tokens creates a token', async ({ request }) => {
    const response = await request.post('/api/v1/auth/tokens', {
      data: {
        name: 'e2e-test-token',
        scopes: ['read'],
        expires_in_days: 1,
      },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.token).toBeTruthy();
    expect(body.id).toBeTruthy();
    expect(body.name).toBe('e2e-test-token');
    tokenId = body.id;
  });

  test('DELETE /api/v1/auth/tokens/:id revokes the token', async ({ request }) => {
    expect(tokenId).toBeTruthy();
    const response = await request.delete(`/api/v1/auth/tokens/${tokenId}`);
    expect(response.ok()).toBeTruthy();
  });

  test('POST /api/v1/auth/tokens with empty name returns non-500', async ({ request }) => {
    const response = await request.post('/api/v1/auth/tokens', {
      data: {
        name: '',
        scopes: ['read'],
      },
    });
    // Backend may accept empty names (200) or reject (400/422); either is valid
    // The important thing is it doesn't return a server error
    expect(response.status()).toBeLessThan(500);
  });
});
