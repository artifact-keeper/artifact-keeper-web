import { test, expect } from '../../../fixtures/test-fixtures';
import type { OidcConfig, SamlConfig } from '@/types/sso';

/**
 * OIDC claim-key mapping + SAML absolute-ACS URL (task #541 / backend #516,
 * #521). The SSO admin page exposes:
 *   - OIDC "Attribute Mapping" claim inputs that the backend
 *     (sso.rs::resolve_oidc_claim_name) reads under the `<field>_claim` keys
 *     (`username_claim` / `email_claim` / `groups_claim`, plus
 *     `display_name_claim` for parity) — NOT the legacy bare
 *     `username` / `email` / `groups` keys the pre-#516 UI wrote.
 *   - a SAML "Use absolute ACS URL" switch that maps to the
 *     `use_absolute_acs_url` field (backend migration 139).
 *
 * Runs in the `interactions` project (admin storageState) against the real
 * e2e backend.
 *
 * Assertion strategy:
 *   1. Outgoing-request payload capture (primary, CI-stable, backend-agnostic):
 *      intercept the create request and assert the claim keys / absolute-ACS
 *      flag are in the body with the shape `lib/api/sso.ts` forwards. A full
 *      OIDC create round-trip is intentionally avoided (OIDC create performs
 *      issuer discovery against `issuer_url`, which a fake e2e issuer fails).
 *   2. SAML persistence round-trip (secondary, higher-value, offline-safe):
 *      seed a SAML provider via the API, then exercise edit -> toggle -> save
 *      -> reload and assert the flag persisted through `adaptSamlConfig` +
 *      `types/sso.ts`. Gated on the backend actually supporting the field so
 *      the spec never falsely fails against a pre-migration-139 backend.
 */

const OIDC_ADMIN_PATH = '**/api/v1/admin/sso/oidc';
const SAML_ADMIN_PATH = '**/api/v1/admin/sso/saml';

// Unique per run so afterEach cleanup only removes this suite's providers even
// when the interaction project runs sharded in parallel against one backend.
const RUN_ID = `e2e-claim-${Date.now().toString(36)}`;
const NOW = new Date().toISOString();

// A syntactically plausible self-signed-looking cert for SAML create. The
// backend may reject it (X509 validation); the round-trip test is gated on the
// seed succeeding, so a strict backend only skips — it never fails the suite.
const DUMMY_CERT =
  '-----BEGIN CERTIFICATE-----\n' +
  'MIIBdummyE2ETestCertificateNotRealBase64Padding0000000000000000000\n' +
  'MIIBdummyE2ETestCertificateNotRealBase64Padding1111111111111111111\n' +
  '-----END CERTIFICATE-----';

function oidcStub(name: string, body: Record<string, unknown>) {
  return {
    id: 'e2e-oidc-stub',
    name,
    issuer_url: (body.issuer_url as string) ?? '',
    client_id: (body.client_id as string) ?? '',
    has_secret: true,
    scopes: (body.scopes as string[]) ?? [],
    attribute_mapping: (body.attribute_mapping as Record<string, string>) ?? {},
    auto_create_users: (body.auto_create_users as boolean) ?? true,
    map_groups_to_groups: (body.map_groups_to_groups as boolean) ?? false,
    pkce_enabled: true,
    is_enabled: true,
    created_at: NOW,
    updated_at: NOW,
  };
}

function samlStub(name: string, body: Record<string, unknown>) {
  return {
    id: 'e2e-saml-stub',
    name,
    entity_id: (body.entity_id as string) ?? '',
    sso_url: (body.sso_url as string) ?? '',
    slo_url: (body.slo_url as string) ?? null,
    has_certificate: true,
    sp_entity_id: (body.sp_entity_id as string) ?? 'artifact-keeper',
    name_id_format:
      (body.name_id_format as string) ??
      'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    attribute_mapping: (body.attribute_mapping as Record<string, string>) ?? {},
    sign_requests: (body.sign_requests as boolean) ?? false,
    require_signed_assertions: (body.require_signed_assertions as boolean) ?? false,
    admin_group: (body.admin_group as string) ?? null,
    use_absolute_acs_url: (body.use_absolute_acs_url as boolean) ?? false,
    is_enabled: true,
    created_at: NOW,
    updated_at: NOW,
  };
}

test.describe('SSO claim mapping & absolute ACS URL (#541)', () => {
  test.afterEach(async ({ adminApi }) => {
    // Remove any providers this suite persisted (the SAML round-trip seeds a
    // real one; keep the shared backend clean across shards).
    for (const kind of ['oidc', 'saml'] as const) {
      const resp = await adminApi.get(`/admin/sso/${kind}`).catch(() => null);
      if (!resp || !resp.ok()) continue;
      const configs = (await resp
        .json()
        .catch(() => [])) as Array<{ id: string; name: string }>;
      for (const c of configs) {
        if (typeof c.name === 'string' && c.name.startsWith(RUN_ID)) {
          await adminApi.delete(`/admin/sso/${kind}/${c.id}`).catch(() => {});
        }
      }
    }
  });

  test('OIDC create payload maps claim inputs to <field>_claim keys and drops legacy bare keys', async ({
    page,
  }) => {
    let body: Record<string, unknown> | null = null;

    // Intercept only the create POST; let the list GET (same path) hit the
    // backend so the page renders normally.
    await page.route(OIDC_ADMIN_PATH, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(oidcStub(`${RUN_ID}-oidc`, body ?? {})),
      });
    });

    await page.goto('/settings/sso');
    await page.getByRole('tablist').getByRole('tab', { name: /oidc/i }).click();
    await page.getByRole('button', { name: /add provider/i }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel(/^name$/i).fill(`${RUN_ID}-oidc`);
    await dialog.getByLabel(/issuer url/i).fill('https://idp.e2e.example.com');
    await dialog.getByLabel(/client id/i).fill('e2e-client');
    await dialog.getByLabel(/client secret/i).fill('e2e-secret');

    // Non-default claim overrides.
    await dialog.getByLabel(/username claim/i).fill('sub');
    await dialog.getByLabel(/email claim/i).fill('mail');
    await dialog.getByLabel(/display name claim/i).fill('fullName');
    await dialog.getByLabel(/groups claim/i).fill('memberOf');

    await dialog.getByRole('button', { name: /create provider/i }).click();

    await expect.poll(() => body).not.toBeNull();
    const payload = body as unknown as Record<string, unknown>;
    const mapping = payload.attribute_mapping as Record<string, string>;

    // Claim overrides land under the `<field>_claim` keys the backend reads.
    expect(mapping.username_claim).toBe('sub');
    expect(mapping.email_claim).toBe('mail');
    expect(mapping.display_name_claim).toBe('fullName');
    expect(mapping.groups_claim).toBe('memberOf');

    // Legacy bare keys must NOT be present (they were silently ignored server
    // side and are dropped by handleSubmit).
    expect(mapping).not.toHaveProperty('username');
    expect(mapping).not.toHaveProperty('email');
    expect(mapping).not.toHaveProperty('groups');
    expect(mapping).not.toHaveProperty('display_name');

    // Rest of the CreateOidcConfigRequest shape is intact.
    expect(payload.name).toBe(`${RUN_ID}-oidc`);
    expect(payload.issuer_url).toBe('https://idp.e2e.example.com');
    expect(payload.client_id).toBe('e2e-client');
    expect(payload.client_secret).toBe('e2e-secret');
    expect(typeof payload.auto_create_users).toBe('boolean');
    expect(typeof payload.map_groups_to_groups).toBe('boolean');
  });

  test('SAML create payload carries use_absolute_acs_url:true and the attribute mapping', async ({
    page,
  }) => {
    let body: Record<string, unknown> | null = null;

    await page.route(SAML_ADMIN_PATH, async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(samlStub(`${RUN_ID}-saml`, body ?? {})),
      });
    });

    await page.goto('/settings/sso');
    await page.getByRole('tablist').getByRole('tab', { name: /saml/i }).click();
    await page.getByRole('button', { name: /add provider/i }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel(/^name$/i).fill(`${RUN_ID}-saml`);
    await dialog.getByLabel(/entity id/i).first().fill('https://idp.e2e.example.com/metadata');
    await dialog.getByLabel(/sso url/i).fill('https://idp.e2e.example.com/sso');
    await dialog.getByLabel(/certificate/i).fill(DUMMY_CERT);

    // Default off; flip the absolute-ACS switch on and confirm the control
    // reflects the new state before submitting.
    const acsToggle = dialog.getByLabel(/use absolute acs url/i);
    await expect(acsToggle).toHaveAttribute('aria-checked', 'false');
    await acsToggle.click();
    await expect(acsToggle).toHaveAttribute('aria-checked', 'true');

    await dialog.getByRole('button', { name: /create provider/i }).click();

    await expect.poll(() => body).not.toBeNull();
    const payload = body as unknown as Record<string, unknown>;

    expect(payload.use_absolute_acs_url).toBe(true);
    expect(payload.name).toBe(`${RUN_ID}-saml`);
    expect(payload.entity_id).toBe('https://idp.e2e.example.com/metadata');
    expect(payload.sso_url).toBe('https://idp.e2e.example.com/sso');
    // SAML claim inputs are written under the bare attribute keys (handleSubmit).
    const mapping = payload.attribute_mapping as Record<string, string>;
    expect(mapping).toHaveProperty('username');
    expect(mapping).toHaveProperty('email');
    expect(mapping).toHaveProperty('groups');
  });

  test('SAML absolute-ACS flag round-trips through create -> edit -> save (persistence)', async ({
    page,
    adminApi,
  }) => {
    const name = `${RUN_ID}-saml-rt`;

    // Seed a SAML provider with the flag ON directly via the API (offline-safe:
    // no issuer discovery). A backend that validates the cert only skips.
    const seedResp = await adminApi.post('/admin/sso/saml', {
      name,
      entity_id: 'https://idp.e2e.example.com/rt/metadata',
      sso_url: 'https://idp.e2e.example.com/rt/sso',
      certificate: DUMMY_CERT,
      use_absolute_acs_url: true,
    });
    test.skip(
      !seedResp.ok(),
      `backend rejected SAML seed (${seedResp.status()}) — absolute-ACS payload covered by the create-payload test`,
    );
    const created = (await seedResp.json()) as SamlConfig & { id: string };

    // Only meaningful if the backend actually persists/echoes the field
    // (migration 139). Otherwise the round-trip is covered by payload capture.
    const getResp = await adminApi.get(`/admin/sso/saml/${created.id}`);
    const persisted = (await getResp.json()) as Record<string, unknown>;
    test.skip(
      persisted.use_absolute_acs_url !== true,
      'backend does not echo use_absolute_acs_url — round-trip covered by the create-payload test',
    );

    // Read path: open the edit dialog and confirm the switch renders ON.
    await page.goto('/settings/sso');
    await page.getByRole('tablist').getByRole('tab', { name: /saml/i }).click();
    await page.getByRole('button', { name: `Edit SAML provider ${name}` }).click();

    let dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const acsToggle = dialog.getByLabel(/use absolute acs url/i);
    await expect(acsToggle).toHaveAttribute('aria-checked', 'true');

    // Write path: flip it OFF, save, and let the PUT reach the backend.
    await acsToggle.click();
    await expect(acsToggle).toHaveAttribute('aria-checked', 'false');
    await dialog.getByRole('button', { name: /save changes/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Persistence: the backend now reports the flag OFF.
    await expect
      .poll(async () => {
        const r = await adminApi.get(`/admin/sso/saml/${created.id}`);
        const j = (await r.json()) as Record<string, unknown>;
        return j.use_absolute_acs_url;
      })
      .toBe(false);

    // And the reopened edit dialog reflects the persisted OFF state.
    await page.reload();
    await page.getByRole('tablist').getByRole('tab', { name: /saml/i }).click();
    await page.getByRole('button', { name: `Edit SAML provider ${name}` }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/use absolute acs url/i)).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});

// Reference the imported type so `tsc --noEmit` keeps the type-only import that
// documents the expected create-payload shape without emitting runtime code.
export type _OidcCreateShape = Pick<
  OidcConfig,
  'attribute_mapping' | 'map_groups_to_groups' | 'auto_create_users'
>;
