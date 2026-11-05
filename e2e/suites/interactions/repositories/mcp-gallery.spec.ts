import { test, expect } from '@playwright/test';
import { McpServerPage } from '../../../fixtures/page-objects';
import { MCP_REPO_KEY, mockMcpRegistry } from '../../../fixtures/mcp/mock-mcp-registry';

/**
 * The Servers gallery of an MCP repository (artifact-keeper#5253). The e2e
 * backend predates the `mcp` format, so the repository and its registry API
 * are stubbed at the network layer; the assertions are on what the browser
 * requests and shows.
 */
test.describe('MCP Servers gallery', () => {
  test('opens on the Servers tab and lists served servers as cards', async ({ page }) => {
    await mockMcpRegistry(page);
    const gallery = new McpServerPage(page);
    await gallery.goto(MCP_REPO_KEY);

    await expect(gallery.serversTab).toHaveAttribute('aria-selected', 'true');
    await expect(gallery.cards).toHaveCount(3);
    const weather = gallery.card('com.acme/weather');
    await expect(weather.getByText('stdio·npm')).toBeVisible();
    await expect(weather.getByText('v1.4.2')).toBeVisible();
    await expect(weather.getByText('hosted')).toBeVisible();
    await expect(weather.getByText('1 secret')).toBeVisible();
    await expect(gallery.card('io.github.acme/issues').getByText('http', { exact: true })).toBeVisible();
    // The name links to the server's package page; Install is a sibling.
    await expect(weather.getByRole('link', { name: 'com.acme/weather' })).toHaveAttribute('href', /^\/packages\//);
    await expect(weather.getByRole('link').getByRole('button')).toHaveCount(0);
  });

  test('searches only from three characters', async ({ page }) => {
    const seen = await mockMcpRegistry(page);
    const gallery = new McpServerPage(page);
    await gallery.goto(MCP_REPO_KEY);
    await expect(gallery.cards).toHaveCount(3);

    await gallery.search.fill('sq');
    await expect(page.getByText('Type at least 3 characters to search.')).toBeVisible();
    expect(seen.every((u) => !u.searchParams.has('search'))).toBe(true);

    await gallery.search.fill('sql');
    await expect(gallery.cards).toHaveCount(1);
    await expect(gallery.card('com.acme/sql')).toBeVisible();
    expect(seen.at(-1)?.searchParams.get('search')).toBe('sql');
    expect(seen.at(-1)?.searchParams.get('version')).toBe('latest');
  });

  test('filters by transport and package type, and clears', async ({ page }) => {
    await mockMcpRegistry(page);
    const gallery = new McpServerPage(page);
    await gallery.goto(MCP_REPO_KEY);
    await expect(gallery.cards).toHaveCount(3);

    await gallery.filter('Package type', 'oci');
    await expect(gallery.cards).toHaveCount(1);
    await expect(gallery.card('com.acme/sql')).toBeVisible();

    await gallery.filter('Transport', 'http');
    await expect(page.getByText('No servers match')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(gallery.cards).toHaveCount(3);
  });

  test('pages with Load more', async ({ page }) => {
    const seen = await mockMcpRegistry(page, { pageSize: 2 });
    const gallery = new McpServerPage(page);
    await gallery.goto(MCP_REPO_KEY);

    await expect(gallery.cards).toHaveCount(2);
    await gallery.loadMore.click();
    await expect(gallery.cards).toHaveCount(3);
    await expect(gallery.loadMore).toHaveCount(0);
    expect(seen.at(-1)?.searchParams.get('cursor')).toBe('2');
  });

  test('tells an administrator about servers with no visible version', async ({ page }) => {
    await mockMcpRegistry(page, { heldNames: ['com.acme/held'] });
    const gallery = new McpServerPage(page);
    await gallery.goto(MCP_REPO_KEY);

    await expect(page.getByText('1 server has no version clients can see.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'com.acme/held' })).toHaveAttribute('href', /^\/packages\//);
  });
});
