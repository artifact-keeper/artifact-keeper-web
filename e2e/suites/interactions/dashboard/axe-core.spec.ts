import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

/**
 * Automated axe-core accessibility gate for the highest-traffic pages
 * (issue #671). Complements the hand-written dialog spec
 * (repo-dialog-a11y.spec.ts) which covers behaviours scanners miss; this
 * spec catches regressions in the WCAG 2.x A/AA rules axe knows.
 *
 * Scope is deliberately narrow: dashboard, repositories, and search. The
 * assertion fails on critical-impact violations only, so a newly introduced
 * serious-but-not-critical finding surfaces in the attached report without
 * flaking the gate on legacy minor issues.
 */
const CORE_PAGES = [
  { name: 'dashboard', path: '/' },
  { name: 'repositories', path: '/repositories' },
  { name: 'search', path: '/search' },
];

test.describe('Axe accessibility scan', () => {
  for (const { name, path } of CORE_PAGES) {
    test(`${name} page has no critical axe violations`, async ({ page }, testInfo) => {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      // Let the page finish hydrating / initial fetches before scanning.
      await expect(page.locator('main#main-content')).toBeVisible({ timeout: 10000 });

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      await testInfo.attach(`axe-${name}.json`, {
        body: JSON.stringify(results.violations, null, 2),
        contentType: 'application/json',
      });

      const critical = results.violations.filter((v) => v.impact === 'critical');
      expect(
        critical,
        `critical axe violations on ${name}: ${critical
          .map((v) => `${v.id} (${v.nodes.length} nodes)`)
          .join(', ')}`,
      ).toEqual([]);
    });
  }
});
