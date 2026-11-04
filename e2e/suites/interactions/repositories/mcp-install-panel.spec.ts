import { test, expect } from '@playwright/test';
import { McpServerPage } from '../../../fixtures/page-objects';
import { MCP_REPO_KEY, captureClipboard, mockMcpRegistry } from '../../../fixtures/mcp/mock-mcp-registry';

/**
 * Install / Connect sheet of an MCP server (artifact-keeper#5253): the copied
 * snippet carries the served Artifact Keeper coordinates and a placeholder
 * for every secret, never the value typed into the panel.
 */
test.describe('MCP Install panel', () => {
  test('copies a Claude Code command with a secret placeholder, not the typed secret', async ({ page }) => {
    await mockMcpRegistry(page);
    const copied = await captureClipboard(page);
    const gallery = new McpServerPage(page);
    await gallery.goto(MCP_REPO_KEY);

    await gallery.openInstall('com.acme/weather');
    await expect(gallery.sheet.getByText('Install com.acme/weather v1.4.2')).toBeVisible();

    const secret = gallery.sheet.getByLabel(/^ACME_API_KEY/);
    await expect(secret).toHaveAttribute('type', 'password');
    await expect(secret).toHaveAttribute('autocomplete', 'off');
    await secret.fill('sk-live-do-not-leak');
    await gallery.sheet.getByLabel(/^ACME_REGION/).fill('eu-west-1');

    const cli = gallery.snippet('Claude Code configuration (Command line)');
    await expect(cli).toContainText('claude mcp add weather');
    await expect(cli).toContainText('ACME_API_KEY="${ACME_API_KEY}"');
    await expect(cli).toContainText('ACME_REGION=eu-west-1');
    await expect(cli).toContainText('--registry http://localhost:8080/npm/e2e-npm-local/');
    await expect(cli).toContainText('@acme/weather-mcp@1.4.2');
    await expect(gallery.sheet.getByText(/secret, emitted as \$\{ACME_API_KEY\}/)).toBeVisible();

    await gallery.copy('Claude Code configuration (Command line)');
    await expect(page.getByText('Copied', { exact: true })).toBeVisible();
    const last = (await copied()).at(-1) ?? '';
    expect(last).toContain('${ACME_API_KEY}');
    expect(last).not.toContain('sk-live-do-not-leak');
    await expect(gallery.sheet.locator('pre', { hasText: 'sk-live-do-not-leak' })).toHaveCount(0);
  });

  test('VS Code uses an input prompt and offers the registry gallery URL', async ({ page }) => {
    await mockMcpRegistry(page);
    const gallery = new McpServerPage(page);
    await gallery.goto(MCP_REPO_KEY);

    await gallery.openInstall('com.acme/weather');
    await gallery.clientTab('VS Code');
    const file = gallery.snippet('VS Code configuration');
    await expect(file).toContainText('"servers"');
    await expect(file).toContainText('${input:acme-api-key}');
    await expect(file).toContainText('"password": true');
    const origin = new URL(page.url()).origin;
    await expect(gallery.snippet('VS Code gallery setting')).toHaveText(
      `"chat.mcp.gallery.serviceUrl": "${origin}/mcp/${MCP_REPO_KEY}"`,
    );
  });

  test('an OCI server runs the pinned digest', async ({ page }) => {
    await mockMcpRegistry(page);
    const copied = await captureClipboard(page);
    const gallery = new McpServerPage(page);
    await gallery.goto(MCP_REPO_KEY);

    await gallery.openInstall('com.acme/sql');
    const cli = gallery.snippet('Claude Code configuration (Command line)');
    await expect(cli).toContainText('docker run -i --rm -e DATABASE_URL');
    await expect(cli).toContainText('@sha256:5f2b1a8c');
    await gallery.copy('Claude Code configuration (Project config)');
    expect((await copied()).at(-1)).toContain('"DATABASE_URL": "${DATABASE_URL}"');
  });

  test('a remote server keeps its Authorization token a placeholder', async ({ page }) => {
    await mockMcpRegistry(page);
    const gallery = new McpServerPage(page);
    await gallery.goto(MCP_REPO_KEY);

    await gallery.openInstall('io.github.acme/issues');
    const token = gallery.sheet.getByLabel(/^token/);
    await expect(token).toHaveAttribute('type', 'password');
    await token.fill('ghp_secret_value');
    await gallery.sheet.getByRole('button', { name: 'Show token' }).click();
    await expect(token).toHaveAttribute('type', 'text');

    const cli = gallery.snippet('Claude Code configuration (Command line)');
    await expect(cli).toContainText('claude mcp add --transport http issues https://mcp.acme.dev/issues');
    await expect(cli).toContainText('Authorization: Bearer ${TOKEN}');
    await expect(cli).not.toContainText('ghp_secret_value');
  });
});
