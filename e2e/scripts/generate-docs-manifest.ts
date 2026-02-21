import * as fs from 'fs';
import * as path from 'path';

interface ScreenshotManifestEntry {
  file: string;
  page: string;
  route: string;
  viewport: string;
  role: string;
  description: string;
}

/** Map screenshot filenames to metadata */
const PAGE_METADATA: Record<string, { page: string; route: string; description: string }> = {
  'dashboard': { page: 'Dashboard', route: '/', description: 'Main dashboard with health status and statistics' },
  'repositories': { page: 'Repositories', route: '/repositories', description: 'Repository management with split-panel layout' },
  'packages': { page: 'Packages', route: '/packages', description: 'Package browser with search and filters' },
  'search': { page: 'Search', route: '/search', description: 'Global search across all artifacts' },
  'login': { page: 'Login', route: '/login', description: 'Authentication page with SSO support' },
  'users': { page: 'Users', route: '/users', description: 'User management with RBAC controls' },
  'groups': { page: 'Groups', route: '/groups', description: 'Group management for team access' },
  'settings': { page: 'Settings', route: '/settings', description: 'System configuration and storage settings' },
  'security': { page: 'Security', route: '/security', description: 'Security dashboard with vulnerability overview' },
  'analytics': { page: 'Analytics', route: '/analytics', description: 'Usage analytics and download metrics' },
  'monitoring': { page: 'Monitoring', route: '/monitoring', description: 'System health monitoring' },
  'permissions': { page: 'Permissions', route: '/permissions', description: 'Permission rules management' },
  'quality-gates': { page: 'Quality Gates', route: '/quality-gates', description: 'Artifact quality gate policies' },
  'backups': { page: 'Backups', route: '/backups', description: 'Backup and restore management' },
  'lifecycle': { page: 'Lifecycle', route: '/lifecycle', description: 'Artifact lifecycle policies' },
  'telemetry': { page: 'Telemetry', route: '/telemetry', description: 'Telemetry data and opt-in settings' },
  'system-health': { page: 'System Health', route: '/system-health', description: 'Detailed system health checks' },
};

function parseScreenshotName(filename: string): Partial<ScreenshotManifestEntry> {
  // Format: {page}-{viewport}-{role}.png
  const match = filename.match(/^(.+)-(desktop|mobile)-(\w+)\.png$/);
  if (!match) return {};
  const [, pageName, viewport, role] = match;
  const meta = PAGE_METADATA[pageName] || { page: pageName, route: `/${pageName}`, description: '' };
  return { ...meta, viewport, role, file: filename };
}

function main() {
  const snapshotDirs = [
    'e2e/suites/visual/pages/core-pages.spec.ts-snapshots',
    'e2e/suites/visual/pages/admin-pages.spec.ts-snapshots',
  ];

  const manifest: ScreenshotManifestEntry[] = [];
  const docsExportDir = 'e2e/docs-export';

  for (const dir of snapshotDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));
    for (const file of files) {
      const entry = parseScreenshotName(file);
      if (entry.file && entry.page) {
        manifest.push(entry as ScreenshotManifestEntry);
        // Copy to docs-export
        fs.copyFileSync(path.join(dir, file), path.join(docsExportDir, file));
      }
    }
  }

  fs.writeFileSync(
    path.join(docsExportDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`Generated manifest with ${manifest.length} entries`);
}

main();
