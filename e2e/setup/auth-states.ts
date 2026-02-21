import path from 'path';

export interface TestRole {
  username: string;
  password: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  /** File path for Playwright storageState */
  storageStatePath: string;
  /** Pages this role should be able to access */
  accessibleRoutes: string[];
  /** Pages this role should be denied */
  deniedRoutes: string[];
}

const AUTH_DIR = path.join(__dirname, '..', '.auth');

export const TEST_ROLES: Record<string, TestRole> = {
  admin: {
    username: 'admin',
    password: 'admin',
    email: 'admin@test.local',
    displayName: 'Admin User',
    isAdmin: true,
    storageStatePath: path.join(AUTH_DIR, 'admin.json'),
    accessibleRoutes: ['/', '/repositories', '/packages', '/users', '/settings', '/security', '/analytics', '/monitoring'],
    deniedRoutes: [],
  },
  developer: {
    username: 'e2e-developer',
    password: 'Developer1!',
    email: 'developer@test.local',
    displayName: 'Dev User',
    isAdmin: false,
    storageStatePath: path.join(AUTH_DIR, 'developer.json'),
    accessibleRoutes: ['/', '/repositories', '/packages', '/staging', '/plugins', '/webhooks', '/access-tokens', '/profile'],
    deniedRoutes: ['/users', '/groups', '/settings', '/analytics', '/monitoring', '/backups'],
  },
  viewer: {
    username: 'e2e-viewer',
    password: 'Viewer1!',
    email: 'viewer@test.local',
    displayName: 'View User',
    isAdmin: false,
    storageStatePath: path.join(AUTH_DIR, 'viewer.json'),
    accessibleRoutes: ['/', '/repositories', '/packages', '/profile'],
    deniedRoutes: ['/users', '/groups', '/settings', '/staging', '/analytics', '/monitoring'],
  },
  'security-auditor': {
    username: 'e2e-security',
    password: 'Security1!',
    email: 'security@test.local',
    displayName: 'Security Auditor',
    isAdmin: false,
    storageStatePath: path.join(AUTH_DIR, 'security-auditor.json'),
    accessibleRoutes: ['/', '/security', '/quality-gates', '/license-policies', '/profile'],
    deniedRoutes: ['/users', '/groups', '/settings', '/analytics', '/monitoring'],
  },
  restricted: {
    username: 'e2e-restricted',
    password: 'Restricted1!',
    email: 'restricted@test.local',
    displayName: 'Restricted User',
    isAdmin: false,
    storageStatePath: path.join(AUTH_DIR, 'restricted.json'),
    accessibleRoutes: ['/', '/profile'],
    deniedRoutes: ['/repositories', '/packages', '/users', '/settings', '/security', '/analytics'],
  },
};

export const ALL_ROLES = Object.keys(TEST_ROLES);
export const NON_ADMIN_ROLES = ALL_ROLES.filter((r) => r !== 'admin');
