# 综合 Playwright E2E 测试套件 - 实施计划

> **给 Claude：** 必需子技能：使用 superpowers:executing-plans 逐任务实施此计划。

**目标：** 在交互、RBAC 角色与视觉回归方面实现 100% 的 Playwright E2E 覆盖率，并带文档截图导出流水线。

**架构：** 三个独立测试套件（interactions、roles、visual）共享一个通用基础设施层（数据预置、认证状态、页面对象）。测试针对真实的 docker-compose 后端技术栈运行。截图通过 manifest 驱动的流水线导出到 Astro 文档站点。

**技术栈：** Playwright 1.58+、TypeScript、Next.js 15 App Router、用于 E2E 技术栈的 docker-compose、GitHub Actions CI

**设计文档：** `docs/plans/2026-02-21-comprehensive-playwright-testing-design.md`

---

## 阶段 1：基础设施

### 任务 1：创建目录结构

**文件：**

- 创建：`e2e/setup/`（目录）
- 创建：`e2e/fixtures/page-objects/`（目录）
- 创建：`e2e/suites/interactions/{auth,dashboard,repositories,packages,staging,admin,security,operations,integrations}/`（目录）
- 创建：`e2e/suites/roles/`（目录）
- 创建：`e2e/suites/visual/{pages,components,states}/`（目录）
- 创建：`e2e/screenshots/{pages,components,states}/`（目录）
- 创建：`e2e/docs-export/`（目录）

**步骤 1：创建所有目录**

```bash
cd /Users/khan/ak/artifact-keeper-web
mkdir -p e2e/setup
mkdir -p e2e/fixtures/page-objects
mkdir -p e2e/suites/interactions/{auth,dashboard,repositories,packages,staging,admin,security,operations,integrations}
mkdir -p e2e/suites/roles
mkdir -p e2e/suites/visual/{pages,components,states}
mkdir -p e2e/screenshots/{pages,components,states}
mkdir -p e2e/docs-export
```

**步骤 2：添加 .gitkeep 文件使空目录被跟踪**

```bash
find e2e/screenshots -type d -empty -exec touch {}/.gitkeep \;
touch e2e/docs-export/.gitkeep
```

**步骤 3：提交**

```bash
git add e2e/setup e2e/fixtures e2e/suites e2e/screenshots e2e/docs-export
git commit -m "chore: scaffold E2E test suite directory structure"
```

---

### 任务 2：创建认证状态配置

**文件：**

- 创建：`e2e/setup/auth-states.ts`

**步骤 1：编写 auth-states 模块**

该模块定义每个测试角色及其预期权限。全局 setup 使用它来创建用户并存储认证状态文件。

```typescript
// e2e/setup/auth-states.ts
import path from "path";

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

const AUTH_DIR = path.join(__dirname, "..", ".auth");

export const TEST_ROLES: Record<string, TestRole> = {
  admin: {
    username: "admin",
    password: "admin",
    email: "admin@test.local",
    displayName: "Admin User",
    isAdmin: true,
    storageStatePath: path.join(AUTH_DIR, "admin.json"),
    accessibleRoutes: [
      "/",
      "/repositories",
      "/packages",
      "/users",
      "/settings",
      "/security",
      "/analytics",
      "/monitoring",
    ],
    deniedRoutes: [],
  },
  developer: {
    username: "e2e-developer",
    password: "Developer1!",
    email: "developer@test.local",
    displayName: "Dev User",
    isAdmin: false,
    storageStatePath: path.join(AUTH_DIR, "developer.json"),
    accessibleRoutes: [
      "/",
      "/repositories",
      "/packages",
      "/staging",
      "/plugins",
      "/webhooks",
      "/access-tokens",
      "/profile",
    ],
    deniedRoutes: [
      "/users",
      "/groups",
      "/settings",
      "/analytics",
      "/monitoring",
      "/backups",
    ],
  },
  viewer: {
    username: "e2e-viewer",
    password: "Viewer1!",
    email: "viewer@test.local",
    displayName: "View User",
    isAdmin: false,
    storageStatePath: path.join(AUTH_DIR, "viewer.json"),
    accessibleRoutes: ["/", "/repositories", "/packages", "/profile"],
    deniedRoutes: [
      "/users",
      "/groups",
      "/settings",
      "/staging",
      "/analytics",
      "/monitoring",
    ],
  },
  "security-auditor": {
    username: "e2e-security",
    password: "Security1!",
    email: "security@test.local",
    displayName: "Security Auditor",
    isAdmin: false,
    storageStatePath: path.join(AUTH_DIR, "security-auditor.json"),
    accessibleRoutes: [
      "/",
      "/security",
      "/quality-gates",
      "/license-policies",
      "/profile",
    ],
    deniedRoutes: [
      "/users",
      "/groups",
      "/settings",
      "/analytics",
      "/monitoring",
    ],
  },
  restricted: {
    username: "e2e-restricted",
    password: "Restricted1!",
    email: "restricted@test.local",
    displayName: "Restricted User",
    isAdmin: false,
    storageStatePath: path.join(AUTH_DIR, "restricted.json"),
    accessibleRoutes: ["/", "/profile"],
    deniedRoutes: [
      "/repositories",
      "/packages",
      "/users",
      "/settings",
      "/security",
      "/analytics",
    ],
  },
};

export const ALL_ROLES = Object.keys(TEST_ROLES);
export const NON_ADMIN_ROLES = ALL_ROLES.filter((r) => r !== "admin");
```

**步骤 2：提交**

```bash
git add e2e/setup/auth-states.ts
git commit -m "feat(e2e): add auth-states config with 5 test roles"
```

---

### 任务 3：创建 seed-data 模块

**文件：**

- 创建：`e2e/setup/seed-data.ts`

该模块通过后端 API 创建可预测的测试数据。它在任何测试套件开始之前的全局 setup 期间运行。

**步骤 1：编写 seed-data 模块**

```typescript
// e2e/setup/seed-data.ts
import { type APIRequestContext } from "@playwright/test";
import { TEST_ROLES } from "./auth-states";

const API_BASE = "/api/v1";

/** Helper to make API requests as admin */
async function api(
  request: APIRequestContext,
  method: string,
  path: string,
  data?: unknown,
) {
  const url = `${API_BASE}${path}`;
  const options: Parameters<typeof request.fetch>[1] = { method };
  if (data) options.data = data;
  const resp = await request.fetch(url, options);
  if (!resp.ok()) {
    const body = await resp.text().catch(() => "");
    // 409 = already exists, which is fine for idempotent seeding
    if (resp.status() !== 409) {
      console.warn(
        `Seed API ${method} ${path} failed (${resp.status()}): ${body}`,
      );
    }
  }
  return resp;
}

/** Create test users (non-admin roles) via the admin API */
export async function seedUsers(request: APIRequestContext): Promise<void> {
  for (const [roleName, role] of Object.entries(TEST_ROLES)) {
    if (roleName === "admin") continue; // admin already exists
    await api(request, "POST", "/admin/users", {
      username: role.username,
      password: role.password,
      email: role.email,
      display_name: role.displayName,
      is_admin: role.isAdmin,
    });
  }
}

/** Create test repositories */
export async function seedRepositories(
  request: APIRequestContext,
): Promise<void> {
  const repos = [
    {
      key: "e2e-maven-local",
      name: "E2E Maven Local",
      format: "maven",
      repo_type: "local",
    },
    {
      key: "e2e-npm-remote",
      name: "E2E NPM Remote",
      format: "npm",
      repo_type: "remote",
      upstream_url: "https://registry.npmjs.org",
    },
    {
      key: "e2e-docker-virtual",
      name: "E2E Docker Virtual",
      format: "docker",
      repo_type: "virtual",
    },
  ];
  for (const repo of repos) {
    await api(request, "POST", "/repositories", repo);
  }
}

/** Create test groups and assign members */
export async function seedGroups(request: APIRequestContext): Promise<void> {
  const groups = [
    { name: "e2e-dev-team", description: "Development team for E2E tests" },
    { name: "e2e-security-team", description: "Security team for E2E tests" },
  ];
  for (const group of groups) {
    await api(request, "POST", "/groups", group);
  }
}

/** Create a test webhook */
export async function seedWebhook(request: APIRequestContext): Promise<void> {
  await api(request, "POST", "/webhooks", {
    name: "e2e-test-webhook",
    url: "https://httpbin.org/post",
    events: ["artifact_uploaded", "repository_created"],
  });
}

/** Create a test quality gate */
export async function seedQualityGate(
  request: APIRequestContext,
): Promise<void> {
  await api(request, "POST", "/quality-gates", {
    name: "e2e-test-gate",
    description: "Quality gate for E2E tests",
    max_critical_issues: 0,
    max_high_issues: 5,
    required_checks: ["security"],
    action: "warn",
  });
}

/** Create a test lifecycle policy */
export async function seedLifecyclePolicy(
  request: APIRequestContext,
): Promise<void> {
  await api(request, "POST", "/lifecycle/policies", {
    name: "e2e-test-cleanup",
    description: "Cleanup policy for E2E tests",
    policy_type: "max_age_days",
    config: { max_age_days: 30 },
    priority: 10,
  });
}

/** Create a test service account */
export async function seedServiceAccount(
  request: APIRequestContext,
): Promise<void> {
  await api(request, "POST", "/service-accounts", {
    name: "e2e-ci-bot",
    description: "Service account for E2E tests",
  });
}

/** Run all seed functions */
export async function seedAll(request: APIRequestContext): Promise<void> {
  console.log("[seed] Creating test users...");
  await seedUsers(request);
  console.log("[seed] Creating test repositories...");
  await seedRepositories(request);
  console.log("[seed] Creating test groups...");
  await seedGroups(request);
  console.log("[seed] Creating test webhook...");
  await seedWebhook(request);
  console.log("[seed] Creating test quality gate...");
  await seedQualityGate(request);
  console.log("[seed] Creating test lifecycle policy...");
  await seedLifecyclePolicy(request);
  console.log("[seed] Creating test service account...");
  await seedServiceAccount(request);
  console.log("[seed] Done.");
}

/** Clean up seeded data (best-effort, called in teardown) */
export async function cleanupAll(request: APIRequestContext): Promise<void> {
  // Delete in reverse dependency order
  // Service accounts, webhooks, quality gates, lifecycle policies, groups, repos, users
  // Use list + delete pattern; ignore 404s
  console.log("[cleanup] Cleaning up seeded test data...");

  // These are best-effort; failures are logged but don't block
  await api(request, "DELETE", "/webhooks/e2e-test-webhook").catch(() => {});
  await api(request, "DELETE", "/repositories/e2e-maven-local").catch(() => {});
  await api(request, "DELETE", "/repositories/e2e-npm-remote").catch(() => {});
  await api(request, "DELETE", "/repositories/e2e-docker-virtual").catch(
    () => {},
  );

  // Users (non-admin)
  for (const [roleName, role] of Object.entries(TEST_ROLES)) {
    if (roleName === "admin") continue;
    await api(request, "DELETE", `/admin/users/${role.username}`).catch(
      () => {},
    );
  }

  console.log("[cleanup] Done.");
}
```

**步骤 2：提交**

```bash
git add e2e/setup/seed-data.ts
git commit -m "feat(e2e): add API-driven data seeding for E2E tests"
```

---

### 任务 4：为多角色认证重写 global-setup

**文件：**

- 修改：`e2e/setup/global-setup.ts`（新文件，替换 `e2e/global-setup.ts`）

新的全局 setup：

1. 以管理员身份登录
2. 通过 API 预置所有测试数据
3. 以每个非管理员角色登录并保存其认证状态

**步骤 1：编写新的 global-setup**

```typescript
// e2e/setup/global-setup.ts
import { test as setup, expect } from "@playwright/test";
import { TEST_ROLES } from "./auth-states";
import { seedAll } from "./seed-data";

/** Login as a user and save their storageState */
async function loginAndSaveState(
  page: import("@playwright/test").Page,
  username: string,
  password: string,
  storageStatePath: string,
) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);

  const loginPromise = page.waitForResponse(
    (resp) =>
      resp.url().includes("/auth/login") && resp.request().method() === "POST",
    { timeout: 15000 },
  );

  await page.getByRole("button", { name: "Sign In" }).click();
  await loginPromise.catch(() => null);

  // Wait for redirect to dashboard or change-password
  await expect(page).toHaveURL(/\/$|\/dashboard|\/change-password/, {
    timeout: 15000,
  });

  // Handle first-login password change if needed
  if (page.url().includes("change-password")) {
    await page
      .getByLabel(/new password/i)
      .first()
      .fill(password);
    await page.getByLabel(/confirm/i).fill(password);
    await page.getByRole("button", { name: /change|update|save/i }).click();
    await expect(page).toHaveURL(/\/$/);
  }

  await page.context().storageState({ path: storageStatePath });
}

setup("authenticate and seed data", async ({ page }) => {
  // 1. Login as admin first
  const admin = TEST_ROLES.admin;
  await loginAndSaveState(
    page,
    admin.username,
    admin.password,
    admin.storageStatePath,
  );

  // 2. Seed test data using admin's authenticated session
  await seedAll(page.request);

  // 3. Login as each non-admin role and save their auth state
  for (const [roleName, role] of Object.entries(TEST_ROLES)) {
    if (roleName === "admin") continue;
    // Clear cookies/state before logging in as next user
    await page.context().clearCookies();
    console.log(`[setup] Authenticating as ${roleName}...`);
    await loginAndSaveState(
      page,
      role.username,
      role.password,
      role.storageStatePath,
    );
  }

  console.log("[setup] All roles authenticated and states saved.");
});
```

**步骤 2：提交**

```bash
git add e2e/setup/global-setup.ts
git commit -m "feat(e2e): multi-role global setup with data seeding"
```

---

### 任务 5：移动并扩展 test-fixtures

**文件：**

- 创建：`e2e/fixtures/test-fixtures.ts`（从 `e2e/helpers/test-fixtures.ts` 复制 + 扩展）

**步骤 1：将现有 fixtures 复制到新位置**

```bash
cp e2e/helpers/test-fixtures.ts e2e/fixtures/test-fixtures.ts
```

**步骤 2：将共享组件辅助函数添加到新文件**

将以下辅助类追加到 `e2e/fixtures/test-fixtures.ts`：

```typescript
// --- Shared Component Helpers ---

/** Helper for interacting with dialogs across the app */
export class DialogHelper {
  constructor(private page: Page) {}

  async open(buttonName: RegExp): Promise<Locator> {
    await this.page.getByRole("button", { name: buttonName }).click();
    const dialog = this.page.getByRole("dialog");
    await base.expect(dialog).toBeVisible({ timeout: 10000 });
    return dialog;
  }

  async submit(
    dialog: Locator,
    buttonName: RegExp = /create|save|submit|confirm/i,
  ): Promise<void> {
    await dialog.getByRole("button", { name: buttonName }).click();
    await this.page.waitForTimeout(1000);
  }

  async cancel(dialog: Locator): Promise<void> {
    await dialog.getByRole("button", { name: /cancel|close/i }).click();
    await base.expect(dialog).not.toBeVisible({ timeout: 5000 });
  }

  async fillField(
    dialog: Locator,
    label: RegExp,
    value: string,
  ): Promise<void> {
    await dialog.getByLabel(label).fill(value);
  }
}

/** Helper for interacting with data tables */
export class DataTableHelper {
  readonly table: Locator;

  constructor(
    private page: Page,
    tableLocator?: Locator,
  ) {
    this.table = tableLocator ?? page.getByRole("table").first();
  }

  async getRowCount(): Promise<number> {
    const rows = this.table.getByRole("row");
    // Subtract 1 for header row
    return Math.max(0, (await rows.count()) - 1);
  }

  async hasRow(text: string | RegExp): Promise<boolean> {
    const row = this.table.getByRole("row").filter({ hasText: text });
    return row.isVisible({ timeout: 5000 }).catch(() => false);
  }

  async clickRowAction(
    rowText: string | RegExp,
    buttonName: RegExp,
  ): Promise<void> {
    const row = this.table.getByRole("row").filter({ hasText: rowText });
    await row.getByRole("button", { name: buttonName }).click();
  }
}

/** Helper for tab interactions */
export class TabHelper {
  constructor(private page: Page) {}

  async switchTo(tabName: string | RegExp): Promise<void> {
    await this.page
      .getByRole("tablist")
      .getByRole("tab", { name: tabName })
      .click();
    await this.page.waitForTimeout(500);
  }

  async isActive(tabName: string | RegExp): Promise<boolean> {
    const tab = this.page
      .getByRole("tablist")
      .getByRole("tab", { name: tabName });
    const selected = await tab.getAttribute("aria-selected");
    return selected === "true";
  }
}

/** Helper for toast/notification assertions */
export class ToastHelper {
  constructor(private page: Page) {}

  async expectSuccess(text?: string | RegExp): Promise<void> {
    const toast = this.page
      .locator('[data-sonner-toast][data-type="success"]')
      .or(
        this.page
          .getByRole("status")
          .filter({
            hasText: text ?? /success|created|saved|updated|deleted/i,
          }),
      );
    await base.expect(toast.first()).toBeVisible({ timeout: 10000 });
  }

  async expectError(text?: string | RegExp): Promise<void> {
    const toast = this.page
      .locator('[data-sonner-toast][data-type="error"]')
      .or(
        this.page
          .getByRole("alert")
          .filter({ hasText: text ?? /error|failed/i }),
      );
    await base.expect(toast.first()).toBeVisible({ timeout: 10000 });
  }
}
```

**步骤 3：提交**

```bash
git add e2e/fixtures/test-fixtures.ts
git commit -m "feat(e2e): add shared component helpers (Dialog, DataTable, Tab, Toast)"
```

---

### 任务 6：创建核心页面对象

**文件：**

- 创建：`e2e/fixtures/page-objects/LoginPage.ts`
- 创建：`e2e/fixtures/page-objects/DashboardPage.ts`
- 创建：`e2e/fixtures/page-objects/RepositoriesPage.ts`
- 创建：`e2e/fixtures/page-objects/PackagesPage.ts`
- 创建：`e2e/fixtures/page-objects/UsersPage.ts`
- 创建：`e2e/fixtures/page-objects/GroupsPage.ts`
- 创建：`e2e/fixtures/page-objects/index.ts`

这是第一批 POM。其余 POM 将在后续任务迁移每个 spec 文件时创建。每个 POM 遵循相同的模式：只读定位器、动作方法、无断言。

**步骤 1：编写 LoginPage**

```typescript
// e2e/fixtures/page-objects/LoginPage.ts
import { type Page, type Locator } from "@playwright/test";

export class LoginPage {
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly ldapTabs: Locator;
  readonly ssoButtons: Locator;

  constructor(private page: Page) {
    this.usernameInput = page.getByLabel(/username/i);
    this.passwordInput = page.getByLabel(/password/i);
    this.submitButton = page.getByRole("button", { name: /sign in|log in/i });
    this.errorMessage = page.getByRole("alert");
    this.ldapTabs = page.getByRole("tablist");
    this.ssoButtons = page
      .locator("button")
      .filter({ hasText: /sso|oauth|saml|oidc/i });
  }

  async goto() {
    await this.page.goto("/login");
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
```

**步骤 2：编写 DashboardPage**

```typescript
// e2e/fixtures/page-objects/DashboardPage.ts
import { type Page, type Locator } from "@playwright/test";

export class DashboardPage {
  readonly healthCards: Locator;
  readonly statCards: Locator;
  readonly recentReposTable: Locator;
  readonly cveChart: Locator;
  readonly heading: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole("heading", { level: 1 });
    this.healthCards = page
      .locator('[data-testid="health-card"]')
      .or(page.getByText(/healthy|unhealthy|degraded/i).first());
    this.statCards = page
      .locator('[data-testid="stat-card"]')
      .or(page.getByText(/repositories|artifacts|users|storage/i).first());
    this.recentReposTable = page.getByRole("table").first();
    this.cveChart = page
      .locator('[data-testid="cve-chart"]')
      .or(page.getByText(/vulnerabilit|cve/i).first());
  }

  async goto() {
    await this.page.goto("/");
  }
}
```

**步骤 3：编写 RepositoriesPage**

```typescript
// e2e/fixtures/page-objects/RepositoriesPage.ts
import { type Page, type Locator } from "@playwright/test";

export class RepositoriesPage {
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly createButton: Locator;
  readonly repoList: Locator;
  readonly detailPanel: Locator;
  readonly formatFilter: Locator;
  readonly typeFilter: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole("heading", { name: /repositor/i }).first();
    this.searchInput = page.getByPlaceholder(/search/i);
    this.createButton = page.getByRole("button", { name: /create/i });
    this.repoList = page
      .locator('[data-testid="repo-list"]')
      .or(page.getByRole("listbox").or(page.getByRole("list")));
    this.detailPanel = page.locator('[data-testid="repo-detail-panel"]');
    this.formatFilter = page.getByRole("combobox", { name: /format/i });
    this.typeFilter = page.getByRole("combobox", { name: /type/i });
  }

  async goto() {
    await this.page.goto("/repositories");
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }

  async selectRepo(name: string) {
    await this.repoList.getByText(name).click();
  }
}
```

**步骤 4：编写 PackagesPage**

```typescript
// e2e/fixtures/page-objects/PackagesPage.ts
import { type Page, type Locator } from "@playwright/test";

export class PackagesPage {
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly packageList: Locator;
  readonly gridViewButton: Locator;
  readonly listViewButton: Locator;
  readonly formatFilter: Locator;
  readonly repoFilter: Locator;
  readonly sortSelect: Locator;
  readonly pagination: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole("heading", { name: /package/i }).first();
    this.searchInput = page.getByPlaceholder(/search/i);
    this.packageList = page
      .locator('[data-testid="package-list"]')
      .or(page.getByRole("list").first());
    this.gridViewButton = page.getByRole("button", { name: /grid/i });
    this.listViewButton = page.getByRole("button", { name: /list/i });
    this.formatFilter = page.getByRole("combobox", { name: /format/i });
    this.repoFilter = page.getByRole("combobox", { name: /repository/i });
    this.sortSelect = page.getByRole("combobox", { name: /sort/i });
    this.pagination = page
      .locator('[data-testid="pagination"]')
      .or(page.getByRole("navigation", { name: /pagination/i }));
  }

  async goto() {
    await this.page.goto("/packages");
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }
}
```

**步骤 5：编写 UsersPage**

```typescript
// e2e/fixtures/page-objects/UsersPage.ts
import { type Page, type Locator } from "@playwright/test";

export class UsersPage {
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly usersTable: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole("heading", { name: /user/i }).first();
    this.createButton = page.getByRole("button", { name: /create user/i });
    this.usersTable = page.getByRole("table");
  }

  async goto() {
    await this.page.goto("/users");
  }

  async openCreateDialog() {
    await this.createButton.click();
    return this.page.getByRole("dialog");
  }
}
```

**步骤 6：编写 GroupsPage**

```typescript
// e2e/fixtures/page-objects/GroupsPage.ts
import { type Page, type Locator } from "@playwright/test";

export class GroupsPage {
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly groupsTable: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole("heading", { name: /group/i }).first();
    this.createButton = page.getByRole("button", { name: /create group/i });
    this.groupsTable = page.getByRole("table");
  }

  async goto() {
    await this.page.goto("/groups");
  }
}
```

**步骤 7：编写桶导出**

```typescript
// e2e/fixtures/page-objects/index.ts
export { LoginPage } from "./LoginPage";
export { DashboardPage } from "./DashboardPage";
export { RepositoriesPage } from "./RepositoriesPage";
export { PackagesPage } from "./PackagesPage";
export { UsersPage } from "./UsersPage";
export { GroupsPage } from "./GroupsPage";
```

**步骤 8：提交**

```bash
git add e2e/fixtures/page-objects/
git commit -m "feat(e2e): add core page object models (Login, Dashboard, Repos, Packages, Users, Groups)"
```

---

### 任务 7：更新 Playwright 配置以实现多项目设置

**文件：**

- 修改：`playwright.config.ts`

**步骤 1：编写更新后的配置**

替换 `playwright.config.ts` 的全部内容：

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ||
      "https://artifactkeeper.possum-fujita.ts.net",
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // --- Setup ---
    {
      name: "setup",
      testDir: "./e2e/setup",
      testMatch: /global-setup\.ts/,
    },

    // --- Legacy tests (existing specs, run during migration) ---
    {
      name: "legacy",
      testDir: "./e2e",
      testMatch: /^[^/]+\.spec\.ts$/, // only top-level spec files
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
    },

    // --- Interaction tests ---
    {
      name: "interactions",
      testDir: "./e2e/suites/interactions",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
    },

    // --- RBAC role tests ---
    {
      name: "roles-admin",
      testDir: "./e2e/suites/roles",
      testMatch: /admin\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "roles-developer",
      testDir: "./e2e/suites/roles",
      testMatch: /regular-user\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/developer.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "roles-viewer",
      testDir: "./e2e/suites/roles",
      testMatch: /viewer\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/viewer.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "roles-security",
      testDir: "./e2e/suites/roles",
      testMatch: /security-auditor\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/security-auditor.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "roles-restricted",
      testDir: "./e2e/suites/roles",
      testMatch: /restricted\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/restricted.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "roles-unauthenticated",
      testDir: "./e2e/suites/roles",
      testMatch: /unauthenticated\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        // No storageState - unauthenticated
      },
      dependencies: ["setup"],
    },

    // --- Visual regression ---
    {
      name: "visual",
      testDir: "./e2e/suites/visual",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
    },
  ],
});
```

**步骤 2：验证配置加载**

运行：`cd /Users/khan/ak/artifact-keeper-web && npx playwright test --list --project=setup`
预期：无错误地列出 setup 测试。

**步骤 3：提交**

```bash
git add playwright.config.ts
git commit -m "feat(e2e): update Playwright config with multi-project setup (interactions, roles, visual)"
```

---

### 任务 8：添加视觉回归 CSS 掩码

**文件：**

- 创建：`e2e/visual-mask.css`

该 CSS 在截图中隐藏动态内容（时间戳、随机 ID、版本号）以防虚假差异。

**步骤 1：编写 CSS 掩码**

```css
/* e2e/visual-mask.css */
/* Hide dynamic content that changes between runs */

/* Timestamps and dates */
[data-testid*="timestamp"],
[data-testid*="date"],
time {
  visibility: hidden !important;
}

/* Random IDs and tokens */
[data-testid*="id"],
[data-testid*="token-value"] {
  visibility: hidden !important;
}

/* Animated elements */
[data-testid*="spinner"],
.animate-spin,
.animate-pulse {
  animation: none !important;
  opacity: 0 !important;
}

/* Version numbers in footer/header */
[data-testid="app-version"] {
  visibility: hidden !important;
}
```

**步骤 2：提交**

```bash
git add e2e/visual-mask.css
git commit -m "feat(e2e): add CSS mask for visual regression stability"
```

---

## 阶段 2：迁移现有 Spec

### 任务 9：迁移认证 spec

**文件：**

- 移动：`e2e/auth.spec.ts` -> `e2e/suites/interactions/auth/login.spec.ts`
- 创建：`e2e/suites/interactions/auth/logout.spec.ts`

**步骤 1：将 auth.spec.ts 复制到新位置**

```bash
cp e2e/auth.spec.ts e2e/suites/interactions/auth/login.spec.ts
```

**步骤 2：更新导入以使用新的 fixture 路径**

在 `e2e/suites/interactions/auth/login.spec.ts` 中，更新导入：

```typescript
import { test, expect } from "../../../fixtures/test-fixtures";
```

**步骤 3：运行迁移后的测试**

运行：`npx playwright test --project=interactions suites/interactions/auth/login.spec.ts --reporter=list`
预期：测试通过（与之前行为相同）。

**步骤 4：创建登出 spec**

```typescript
// e2e/suites/interactions/auth/logout.spec.ts
import { test, expect } from "../../../fixtures/test-fixtures";

test.describe("Logout", () => {
  test("logout clears session and redirects to login", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Find and click logout (usually in user menu dropdown)
    const userMenu = page
      .getByRole("button", { name: /account|user|profile|admin/i })
      .first();
    await userMenu.click();
    await page.getByRole("menuitem", { name: /log out|sign out/i }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});
```

**步骤 5：提交**

```bash
git add e2e/suites/interactions/auth/
git commit -m "feat(e2e): migrate auth specs to interactions/auth/"
```

---

### 任务 10：迁移仪表盘 spec

**文件：**

- 移动：`e2e/dashboard.spec.ts` -> `e2e/suites/interactions/dashboard/dashboard.spec.ts`

**步骤 1：复制并更新导入**

```bash
cp e2e/dashboard.spec.ts e2e/suites/interactions/dashboard/dashboard.spec.ts
```

更新复制文件中的导入路径，使其引用 `../../../fixtures/test-fixtures`。

**步骤 2：运行**

运行：`npx playwright test --project=interactions suites/interactions/dashboard/ --reporter=list`
预期：通过

**步骤 3：提交**

```bash
git add e2e/suites/interactions/dashboard/
git commit -m "feat(e2e): migrate dashboard spec to interactions/dashboard/"
```

---

### 任务 11：迁移仓库 spec

**文件：**

- 移动：`e2e/repositories.spec.ts` -> `e2e/suites/interactions/repositories/repo-list.spec.ts`
- 移动：`e2e/repository-detail.spec.ts` -> `e2e/suites/interactions/repositories/repo-detail.spec.ts`

**步骤 1：复制并更新导入**

```bash
cp e2e/repositories.spec.ts e2e/suites/interactions/repositories/repo-list.spec.ts
cp e2e/repository-detail.spec.ts e2e/suites/interactions/repositories/repo-detail.spec.ts
```

更新两个文件中的导入路径。

**步骤 2：运行**

运行：`npx playwright test --project=interactions suites/interactions/repositories/ --reporter=list`
预期：通过

**步骤 3：提交**

```bash
git add e2e/suites/interactions/repositories/
git commit -m "feat(e2e): migrate repository specs to interactions/repositories/"
```

---

### 任务 12：迁移包 spec

**文件：**

- 移动：`e2e/package-browser.spec.ts` -> `e2e/suites/interactions/packages/package-browse.spec.ts`
- 移动：`e2e/package-detail.spec.ts` -> `e2e/suites/interactions/packages/package-detail.spec.ts`
- 移动：`e2e/packages.spec.ts` -> `e2e/suites/interactions/packages/packages.spec.ts`

**步骤 1：复制并更新导入**

```bash
cp e2e/package-browser.spec.ts e2e/suites/interactions/packages/package-browse.spec.ts
cp e2e/package-detail.spec.ts e2e/suites/interactions/packages/package-detail.spec.ts
cp e2e/packages.spec.ts e2e/suites/interactions/packages/packages.spec.ts
```

**步骤 2：运行**

运行：`npx playwright test --project=interactions suites/interactions/packages/ --reporter=list`
预期：通过

**步骤 3：提交**

```bash
git add e2e/suites/interactions/packages/
git commit -m "feat(e2e): migrate package specs to interactions/packages/"
```

---

### 任务 13：迁移暂存 spec

**文件：**

- 移动：`e2e/staging.spec.ts` -> `e2e/suites/interactions/staging/staging-list.spec.ts`
- 移动：`e2e/staging-rejection.spec.ts` -> `e2e/suites/interactions/staging/staging-rejection.spec.ts`

**步骤 1：复制并更新导入**

```bash
cp e2e/staging.spec.ts e2e/suites/interactions/staging/staging-list.spec.ts
cp e2e/staging-rejection.spec.ts e2e/suites/interactions/staging/staging-rejection.spec.ts
```

**步骤 2：运行并提交**

运行：`npx playwright test --project=interactions suites/interactions/staging/ --reporter=list`

```bash
git add e2e/suites/interactions/staging/
git commit -m "feat(e2e): migrate staging specs to interactions/staging/"
```

---

### 任务 14：迁移管理 spec（users、groups、permissions、settings、SSO、backups、migration）

**文件：**

- 移动：`e2e/users-mgmt.spec.ts` -> `e2e/suites/interactions/admin/users.spec.ts`
- 移动：`e2e/groups-mgmt.spec.ts` -> `e2e/suites/interactions/admin/groups.spec.ts`
- 移动：`e2e/permissions-mgmt.spec.ts` -> `e2e/suites/interactions/admin/permissions.spec.ts`
- 移动：`e2e/admin.spec.ts` -> `e2e/suites/interactions/admin/settings.spec.ts`
- 移动：`e2e/sso.spec.ts` -> `e2e/suites/interactions/admin/sso.spec.ts`
- 移动：`e2e/backups-page.spec.ts` -> `e2e/suites/interactions/admin/backups.spec.ts`
- 移动：`e2e/migration-page.spec.ts` -> `e2e/suites/interactions/admin/migration.spec.ts`
- 移动：`e2e/service-accounts.spec.ts` -> `e2e/suites/interactions/admin/service-accounts.spec.ts`

**步骤 1：复制所有管理 spec**

```bash
cp e2e/users-mgmt.spec.ts e2e/suites/interactions/admin/users.spec.ts
cp e2e/groups-mgmt.spec.ts e2e/suites/interactions/admin/groups.spec.ts
cp e2e/permissions-mgmt.spec.ts e2e/suites/interactions/admin/permissions.spec.ts
cp e2e/admin.spec.ts e2e/suites/interactions/admin/settings.spec.ts
cp e2e/sso.spec.ts e2e/suites/interactions/admin/sso.spec.ts
cp e2e/backups-page.spec.ts e2e/suites/interactions/admin/backups.spec.ts
cp e2e/migration-page.spec.ts e2e/suites/interactions/admin/migration.spec.ts
cp e2e/service-accounts.spec.ts e2e/suites/interactions/admin/service-accounts.spec.ts
```

**步骤 2：将所有导入更新为使用新的 fixture 路径**

在每个文件中，将导入改为：`import { test, expect } from '../../../fixtures/test-fixtures';`
（如果直接使用 `@playwright/test`，请更新为使用扩展的 fixtures。）

**步骤 3：运行并提交**

运行：`npx playwright test --project=interactions suites/interactions/admin/ --reporter=list`

```bash
git add e2e/suites/interactions/admin/
git commit -m "feat(e2e): migrate admin specs to interactions/admin/"
```

---

### 任务 15：迁移安全 spec

**文件：**

- 移动：`e2e/security-full.spec.ts` -> `e2e/suites/interactions/security/security-dashboard.spec.ts`
- 移动：`e2e/quality-gates.spec.ts` -> `e2e/suites/interactions/security/quality-gates.spec.ts`
- 移动：`e2e/license-policies-page.spec.ts` -> `e2e/suites/interactions/security/license-policies.spec.ts`
- 移动：`e2e/health-dashboard.spec.ts` -> `e2e/suites/interactions/security/health-dashboard.spec.ts`

**步骤 1：复制并更新导入**

```bash
cp e2e/security-full.spec.ts e2e/suites/interactions/security/security-dashboard.spec.ts
cp e2e/quality-gates.spec.ts e2e/suites/interactions/security/quality-gates.spec.ts
cp e2e/license-policies-page.spec.ts e2e/suites/interactions/security/license-policies.spec.ts
cp e2e/health-dashboard.spec.ts e2e/suites/interactions/security/health-dashboard.spec.ts
```

**步骤 2：运行并提交**

运行：`npx playwright test --project=interactions suites/interactions/security/ --reporter=list`

```bash
git add e2e/suites/interactions/security/
git commit -m "feat(e2e): migrate security specs to interactions/security/"
```

---

### 任务 16：迁移运维 spec

**文件：**

- 移动：`e2e/analytics-page.spec.ts` -> `e2e/suites/interactions/operations/analytics.spec.ts`
- 移动：`e2e/monitoring-page.spec.ts` -> `e2e/suites/interactions/operations/monitoring.spec.ts`
- 移动：`e2e/telemetry-page.spec.ts` -> `e2e/suites/interactions/operations/telemetry.spec.ts`
- 移动：`e2e/lifecycle-page.spec.ts` -> `e2e/suites/interactions/operations/lifecycle.spec.ts`
- 移动：`e2e/approvals.spec.ts` -> `e2e/suites/interactions/operations/approvals.spec.ts`

**步骤 1：复制并更新导入**

```bash
cp e2e/analytics-page.spec.ts e2e/suites/interactions/operations/analytics.spec.ts
cp e2e/monitoring-page.spec.ts e2e/suites/interactions/operations/monitoring.spec.ts
cp e2e/telemetry-page.spec.ts e2e/suites/interactions/operations/telemetry.spec.ts
cp e2e/lifecycle-page.spec.ts e2e/suites/interactions/operations/lifecycle.spec.ts
cp e2e/approvals.spec.ts e2e/suites/interactions/operations/approvals.spec.ts
```

**步骤 2：运行并提交**

运行：`npx playwright test --project=interactions suites/interactions/operations/ --reporter=list`

```bash
git add e2e/suites/interactions/operations/
git commit -m "feat(e2e): migrate operations specs to interactions/operations/"
```

---

### 任务 17：迁移集成 spec

**文件：**

- 移动：`e2e/peers.spec.ts` -> `e2e/suites/interactions/integrations/peers.spec.ts`
- 移动：`e2e/replication.spec.ts` -> `e2e/suites/interactions/integrations/replication.spec.ts`
- 移动：`e2e/plugins.spec.ts` -> `e2e/suites/interactions/integrations/plugins.spec.ts`
- 移动：`e2e/webhooks.spec.ts` -> `e2e/suites/interactions/integrations/webhooks.spec.ts`
- 移动：`e2e/access-tokens.spec.ts` -> `e2e/suites/interactions/integrations/access-tokens.spec.ts`
- 移动：`e2e/profile.spec.ts` + `e2e/profile-crud.spec.ts` -> `e2e/suites/interactions/integrations/profile.spec.ts`

**步骤 1：复制并更新导入**

```bash
cp e2e/peers.spec.ts e2e/suites/interactions/integrations/peers.spec.ts
cp e2e/replication.spec.ts e2e/suites/interactions/integrations/replication.spec.ts
cp e2e/plugins.spec.ts e2e/suites/interactions/integrations/plugins.spec.ts
cp e2e/webhooks.spec.ts e2e/suites/interactions/integrations/webhooks.spec.ts
cp e2e/access-tokens.spec.ts e2e/suites/interactions/integrations/access-tokens.spec.ts
cp e2e/profile.spec.ts e2e/suites/interactions/integrations/profile.spec.ts
cp e2e/profile-crud.spec.ts e2e/suites/interactions/integrations/profile-crud.spec.ts
```

**步骤 2：运行并提交**

运行：`npx playwright test --project=interactions suites/interactions/integrations/ --reporter=list`

```bash
git add e2e/suites/interactions/integrations/
git commit -m "feat(e2e): migrate integrations specs to interactions/integrations/"
```

---

### 任务 18：迁移其余 spec（search、builds、setup、API 测试）

**文件：**

- 移动：`e2e/search.spec.ts` -> `e2e/suites/interactions/dashboard/search.spec.ts`
- 移动：`e2e/builds.spec.ts` -> `e2e/suites/interactions/dashboard/builds.spec.ts`
- 移动：`e2e/setup.spec.ts` -> `e2e/suites/interactions/dashboard/setup.spec.ts`
- 移动：`e2e/api-comprehensive.spec.ts` -> `e2e/suites/interactions/dashboard/api-comprehensive.spec.ts`
- 移动：`e2e/api-integration.spec.ts` -> `e2e/suites/interactions/dashboard/api-integration.spec.ts`

**步骤 1：复制并更新导入**

```bash
cp e2e/search.spec.ts e2e/suites/interactions/dashboard/search.spec.ts
cp e2e/builds.spec.ts e2e/suites/interactions/dashboard/builds.spec.ts
cp e2e/setup.spec.ts e2e/suites/interactions/dashboard/setup.spec.ts
cp e2e/api-comprehensive.spec.ts e2e/suites/interactions/dashboard/api-comprehensive.spec.ts
cp e2e/api-integration.spec.ts e2e/suites/interactions/dashboard/api-integration.spec.ts
```

**步骤 2：运行完整 interactions 套件**

运行：`npx playwright test --project=interactions --reporter=list`
预期：所有迁移的测试通过。

**步骤 3：提交**

```bash
git add e2e/suites/interactions/dashboard/
git commit -m "feat(e2e): migrate remaining specs (search, builds, setup, API)"
```

---

### 任务 19：验证完整迁移并移除遗留 spec

**步骤 1：同时运行 legacy 与 interactions 项目**

运行：`npx playwright test --project=legacy --project=interactions --reporter=list`

比较测试数量。两个项目应具有相同的测试总数。

**步骤 2：从根 e2e/ 移除旧 spec 文件**

一旦所有测试在新位置通过，删除旧的扁平 spec 文件：

```bash
# List all files that were migrated
ls e2e/*.spec.ts
# Remove them (keep global-setup.ts and helpers/ for now)
rm e2e/access-tokens.spec.ts e2e/admin.spec.ts e2e/analytics-page.spec.ts \
   e2e/api-comprehensive.spec.ts e2e/api-integration.spec.ts e2e/approvals.spec.ts \
   e2e/auth.spec.ts e2e/backups-page.spec.ts e2e/builds.spec.ts e2e/dashboard.spec.ts \
   e2e/groups-mgmt.spec.ts e2e/health-dashboard.spec.ts e2e/license-policies-page.spec.ts \
   e2e/lifecycle-page.spec.ts e2e/migration-page.spec.ts e2e/monitoring-page.spec.ts \
   e2e/package-browser.spec.ts e2e/package-detail.spec.ts e2e/packages.spec.ts \
   e2e/peers.spec.ts e2e/permissions-mgmt.spec.ts e2e/plugins.spec.ts \
   e2e/profile-crud.spec.ts e2e/profile.spec.ts e2e/quality-gates.spec.ts \
   e2e/replication.spec.ts e2e/repositories.spec.ts e2e/repository-detail.spec.ts \
   e2e/search.spec.ts e2e/security-full.spec.ts e2e/service-accounts.spec.ts \
   e2e/setup.spec.ts e2e/sso.spec.ts e2e/staging-rejection.spec.ts \
   e2e/staging.spec.ts e2e/telemetry-page.spec.ts e2e/users-mgmt.spec.ts \
   e2e/webhooks.spec.ts
```

**步骤 3：从 playwright.config.ts 移除 legacy 项目**

从 `playwright.config.ts` 中移除 `legacy` 项目块。

**步骤 4：移动旧的 global-setup 与 helpers**

```bash
# Old global-setup is now replaced by e2e/setup/global-setup.ts
rm e2e/global-setup.ts
# Old helpers are now in e2e/fixtures/
rm -r e2e/helpers/
# Old page objects are now in e2e/fixtures/page-objects/
rm -r e2e/pages/
```

**步骤 5：运行完整套件以确认**

运行：`npx playwright test --project=interactions --reporter=list`
预期：所有测试通过，数量与迁移前相同。

**步骤 6：提交**

```bash
git add -A
git commit -m "chore(e2e): remove legacy spec files after migration to suites"
```

---

## 阶段 3：RBAC 角色测试

### 任务 20：编写管理员角色 spec

**文件：**

- 创建：`e2e/suites/roles/admin.spec.ts`

**步骤 1：编写管理员角色测试**

这验证管理员用户可以看到所有页面与所有 CRUD 控件。

```typescript
// e2e/suites/roles/admin.spec.ts
import { test, expect } from "../../fixtures/test-fixtures";

test.describe("Admin role access", () => {
  test("sidebar shows all sections", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const sidebar = page
      .locator('[data-testid="app-sidebar"]')
      .or(page.getByRole("navigation"));

    // Admin should see all sidebar sections
    await expect(sidebar.getByText(/dashboard/i).first()).toBeVisible();
    await expect(sidebar.getByText(/repositor/i).first()).toBeVisible();
    await expect(sidebar.getByText(/package/i).first()).toBeVisible();
    await expect(sidebar.getByText(/security/i).first()).toBeVisible();
    await expect(sidebar.getByText(/user/i).first()).toBeVisible();
    await expect(sidebar.getByText(/setting/i).first()).toBeVisible();
    await expect(sidebar.getByText(/analytic/i).first()).toBeVisible();
    await expect(sidebar.getByText(/monitor/i).first()).toBeVisible();
  });

  test("admin pages are accessible", async ({ page }) => {
    const adminPages = [
      "/users",
      "/groups",
      "/settings",
      "/analytics",
      "/monitoring",
      "/backups",
      "/permissions",
    ];
    for (const route of adminPages) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      // Should NOT be redirected to login or 403
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page).not.toHaveURL(/\/error\/403/);
    }
  });

  test("CRUD buttons are visible on admin pages", async ({ page }) => {
    await page.goto("/users");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("button", { name: /create user/i }),
    ).toBeVisible();

    await page.goto("/groups");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("button", { name: /create group/i }),
    ).toBeVisible();
  });
});
```

**步骤 2：运行**

运行：`npx playwright test --project=roles-admin --reporter=list`
预期：通过

**步骤 3：提交**

```bash
git add e2e/suites/roles/admin.spec.ts
git commit -m "feat(e2e): add admin RBAC role spec"
```

---

### 任务 21：编写未认证角色 spec

**文件：**

- 创建：`e2e/suites/roles/unauthenticated.spec.ts`

**步骤 1：编写 spec**

```typescript
// e2e/suites/roles/unauthenticated.spec.ts
import { test, expect } from "@playwright/test";

// This project has no storageState, so the user is unauthenticated

test.describe("Unauthenticated access", () => {
  const protectedRoutes = [
    "/",
    "/repositories",
    "/packages",
    "/profile",
    "/users",
    "/settings",
    "/security",
    "/analytics",
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirects to login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    });
  }

  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });
});
```

**步骤 2：运行**

运行：`npx playwright test --project=roles-unauthenticated --reporter=list`
预期：通过

**步骤 3：提交**

```bash
git add e2e/suites/roles/unauthenticated.spec.ts
git commit -m "feat(e2e): add unauthenticated RBAC role spec"
```

---

### 任务 22：编写常规用户（开发者）角色 spec

**文件：**

- 创建：`e2e/suites/roles/regular-user.spec.ts`

**步骤 1：编写 spec**

```typescript
// e2e/suites/roles/regular-user.spec.ts
import { test, expect } from "../../fixtures/test-fixtures";

test.describe("Developer role access", () => {
  test("can access repositories", async ({ page }) => {
    await page.goto("/repositories");
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/login|\/error/);
    await expect(page.getByText(/repositor/i).first()).toBeVisible();
  });

  test("can access packages", async ({ page }) => {
    await page.goto("/packages");
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/login|\/error/);
  });

  test("can access profile", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/login|\/error/);
  });

  test("admin pages redirect or show 403", async ({ page }) => {
    const adminRoutes = ["/users", "/groups", "/settings", "/backups"];
    for (const route of adminRoutes) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      // Should be redirected to 403 or show forbidden message
      const url = page.url();
      const content = await page.textContent("body");
      const isBlocked =
        url.includes("/error/403") ||
        url.includes("/login") ||
        content?.includes("forbidden") ||
        content?.includes("Forbidden") ||
        content?.includes("denied") ||
        false;
      expect(isBlocked).toBe(true);
    }
  });

  test("sidebar hides admin section", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const sidebar = page
      .locator('[data-testid="app-sidebar"]')
      .or(page.getByRole("navigation"));

    // Should NOT see admin-only items
    await expect(sidebar.getByText(/^Users$/)).not.toBeVisible();
    await expect(sidebar.getByText(/^Settings$/)).not.toBeVisible();
  });
});
```

**步骤 2：运行**

运行：`npx playwright test --project=roles-developer --reporter=list`
预期：通过

**步骤 3：提交**

```bash
git add e2e/suites/roles/regular-user.spec.ts
git commit -m "feat(e2e): add developer RBAC role spec"
```

---

### 任务 23：编写其余角色 spec（viewer、security-auditor、restricted）

**文件：**

- 创建：`e2e/suites/roles/viewer.spec.ts`
- 创建：`e2e/suites/roles/security-auditor.spec.ts`
- 创建：`e2e/suites/roles/restricted.spec.ts`

**步骤 1：编写 viewer.spec.ts**

```typescript
// e2e/suites/roles/viewer.spec.ts
import { test, expect } from "../../fixtures/test-fixtures";

test.describe("Viewer role access", () => {
  test("can view repositories (read-only)", async ({ page }) => {
    await page.goto("/repositories");
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/login|\/error/);
    // Create button should NOT be visible for viewers
    await expect(
      page.getByRole("button", { name: /create/i }),
    ).not.toBeVisible();
  });

  test("can view packages (read-only)", async ({ page }) => {
    await page.goto("/packages");
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/login|\/error/);
  });

  test("admin pages are denied", async ({ page }) => {
    await page.goto("/users");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    const content = await page.textContent("body");
    const isBlocked =
      url.includes("/error/403") ||
      url.includes("/login") ||
      content?.includes("forbidden") ||
      content?.includes("denied") ||
      false;
    expect(isBlocked).toBe(true);
  });
});
```

**步骤 2：编写 security-auditor.spec.ts**

```typescript
// e2e/suites/roles/security-auditor.spec.ts
import { test, expect } from "../../fixtures/test-fixtures";

test.describe("Security Auditor role access", () => {
  test("can access security dashboard", async ({ page }) => {
    await page.goto("/security");
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/login|\/error/);
    await expect(page.getByText(/security/i).first()).toBeVisible();
  });

  test("can access quality gates", async ({ page }) => {
    await page.goto("/quality-gates");
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/login|\/error/);
  });

  test("admin pages are denied", async ({ page }) => {
    await page.goto("/users");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    const content = await page.textContent("body");
    const isBlocked =
      url.includes("/error/403") ||
      url.includes("/login") ||
      content?.includes("forbidden") ||
      content?.includes("denied") ||
      false;
    expect(isBlocked).toBe(true);
  });
});
```

**步骤 3：编写 restricted.spec.ts**

```typescript
// e2e/suites/roles/restricted.spec.ts
import { test, expect } from "../../fixtures/test-fixtures";

test.describe("Restricted role access", () => {
  test("can access dashboard", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("can access own profile", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/\/login|\/error/);
  });

  test("most pages are denied", async ({ page }) => {
    const restrictedRoutes = [
      "/repositories",
      "/packages",
      "/users",
      "/settings",
      "/security",
      "/analytics",
    ];
    for (const route of restrictedRoutes) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const url = page.url();
      const content = await page.textContent("body");
      const isBlocked =
        url.includes("/error/403") ||
        url.includes("/login") ||
        content?.includes("forbidden") ||
        content?.includes("denied") ||
        false;
      expect(isBlocked).toBe(true);
    }
  });

  test("sidebar shows minimal items", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const sidebar = page
      .locator('[data-testid="app-sidebar"]')
      .or(page.getByRole("navigation"));
    await expect(sidebar.getByText(/dashboard/i).first()).toBeVisible();
    // Most sections should be hidden
    await expect(sidebar.getByText(/^Users$/)).not.toBeVisible();
    await expect(sidebar.getByText(/^Analytics$/)).not.toBeVisible();
  });
});
```

**步骤 4：运行所有角色测试**

运行：`npx playwright test --project=roles-viewer --project=roles-security --project=roles-restricted --reporter=list`
预期：通过

**步骤 5：提交**

```bash
git add e2e/suites/roles/
git commit -m "feat(e2e): add viewer, security-auditor, and restricted RBAC role specs"
```

---

## 阶段 4：视觉回归

### 任务 24：编写页面级视觉回归 spec

**文件：**

- 创建：`e2e/suites/visual/pages/core-pages.spec.ts`
- 创建：`e2e/suites/visual/pages/admin-pages.spec.ts`

**步骤 1：编写核心页面视觉 spec**

```typescript
// e2e/suites/visual/pages/core-pages.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Visual regression: core pages", () => {
  const pages = [
    { name: "dashboard", route: "/" },
    { name: "repositories", route: "/repositories" },
    { name: "packages", route: "/packages" },
    { name: "search", route: "/search" },
    { name: "login", route: "/login" },
  ];

  for (const { name, route } of pages) {
    test(`${name} - desktop`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000); // let animations settle
      await expect(page).toHaveScreenshot(`${name}-desktop-admin.png`, {
        maxDiffPixelRatio: 0.01,
        fullPage: true,
        stylePath: "../../../visual-mask.css",
      });
    });

    test(`${name} - mobile`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      await expect(page).toHaveScreenshot(`${name}-mobile-admin.png`, {
        maxDiffPixelRatio: 0.01,
        fullPage: true,
        stylePath: "../../../visual-mask.css",
      });
    });
  }
});
```

**步骤 2：编写管理页面视觉 spec**

```typescript
// e2e/suites/visual/pages/admin-pages.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Visual regression: admin pages", () => {
  const pages = [
    { name: "users", route: "/users" },
    { name: "groups", route: "/groups" },
    { name: "settings", route: "/settings" },
    { name: "security", route: "/security" },
    { name: "analytics", route: "/analytics" },
    { name: "monitoring", route: "/monitoring" },
    { name: "permissions", route: "/permissions" },
    { name: "quality-gates", route: "/quality-gates" },
    { name: "backups", route: "/backups" },
    { name: "lifecycle", route: "/lifecycle" },
    { name: "telemetry", route: "/telemetry" },
    { name: "system-health", route: "/system-health" },
  ];

  for (const { name, route } of pages) {
    test(`${name} - desktop`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      await expect(page).toHaveScreenshot(`${name}-desktop-admin.png`, {
        maxDiffPixelRatio: 0.01,
        fullPage: true,
        stylePath: "../../../visual-mask.css",
      });
    });
  }
});
```

**步骤 3：生成初始基线**

运行：`npx playwright test --project=visual --update-snapshots --reporter=list`
预期：所有测试通过，截图保存到 `e2e/suites/visual/pages/core-pages.spec.ts-snapshots/` 等处。

**步骤 4：提交基线**

```bash
git add e2e/suites/visual/
git commit -m "feat(e2e): add page-level visual regression specs with initial baselines"
```

---

### 任务 25：编写组件级视觉回归 spec

**文件：**

- 创建：`e2e/suites/visual/components/components.spec.ts`

**步骤 1：编写组件视觉 spec**

```typescript
// e2e/suites/visual/components/components.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Visual regression: components", () => {
  test("sidebar - expanded", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const sidebar = page
      .locator('[data-testid="app-sidebar"]')
      .or(page.locator("aside").first());
    await expect(sidebar).toHaveScreenshot("sidebar-expanded.png", {
      maxDiffPixelRatio: 0.01,
    });
  });

  test("app header", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const header = page.locator("header").first();
    await expect(header).toHaveScreenshot("app-header.png", {
      maxDiffPixelRatio: 0.01,
    });
  });

  test("users table", async ({ page }) => {
    await page.goto("/users");
    await page.waitForLoadState("networkidle");
    const table = page.getByRole("table").first();
    await expect(table).toHaveScreenshot("users-table.png", {
      maxDiffPixelRatio: 0.01,
    });
  });

  test("create user dialog", async ({ page }) => {
    await page.goto("/users");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /create user/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveScreenshot("create-user-dialog.png", {
      maxDiffPixelRatio: 0.01,
    });
    await dialog.getByRole("button", { name: /cancel/i }).click();
  });

  test("confirm delete dialog", async ({ page }) => {
    // Navigate to a page with delete functionality and trigger the confirm dialog
    await page.goto("/repositories");
    await page.waitForLoadState("networkidle");
    // This is best-effort; skip if no repos exist
    const actionButton = page.getByRole("button", { name: /delete/i }).first();
    if (await actionButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await actionButton.click();
      const confirmDialog = page
        .getByRole("alertdialog")
        .or(page.getByRole("dialog"));
      if (await confirmDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(confirmDialog).toHaveScreenshot(
          "confirm-delete-dialog.png",
          { maxDiffPixelRatio: 0.01 },
        );
        await confirmDialog.getByRole("button", { name: /cancel/i }).click();
      }
    }
  });
});
```

**步骤 2：生成基线并提交**

运行：`npx playwright test --project=visual suites/visual/components/ --update-snapshots --reporter=list`

```bash
git add e2e/suites/visual/components/
git commit -m "feat(e2e): add component-level visual regression specs"
```

---

### 任务 26：编写状态视觉回归 spec（加载、空、错误）

**文件：**

- 创建：`e2e/suites/visual/states/states.spec.ts`

**步骤 1：编写状态视觉 spec**

```typescript
// e2e/suites/visual/states/states.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Visual regression: UI states", () => {
  test("loading skeleton - repositories", async ({ page }) => {
    // Delay API response to capture loading state
    await page.route("**/api/v1/repositories*", async (route) => {
      await new Promise((r) => setTimeout(r, 5000)); // 5s delay
      await route.continue();
    });
    await page.goto("/repositories");
    // Capture during loading (before API responds)
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("loading-repositories.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  test("empty state - packages", async ({ page }) => {
    // Mock empty response
    await page.route("**/api/v1/packages*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });
    await page.goto("/packages");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("empty-packages.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
    });
  });

  test("error state - dashboard API failure", async ({ page }) => {
    // Mock 500 error on stats endpoint
    await page.route("**/api/v1/admin/stats*", async (route) => {
      await route.fulfill({ status: 500, body: "Internal Server Error" });
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("error-dashboard.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  test("error state - 403 forbidden page", async ({ page }) => {
    await page.goto("/error/403");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("error-403.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
    });
  });

  test("error state - 500 server error page", async ({ page }) => {
    await page.goto("/error/500");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("error-500.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
    });
  });
});
```

**步骤 2：生成基线并提交**

运行：`npx playwright test --project=visual suites/visual/states/ --update-snapshots --reporter=list`

```bash
git add e2e/suites/visual/states/
git commit -m "feat(e2e): add state visual regression specs (loading, empty, error)"
```

---

## 阶段 5：CI 流水线与文档导出

### 任务 27：创建 docs-export manifest 脚本

**文件：**

- 创建：`e2e/scripts/generate-docs-manifest.ts`

该脚本读取截图基线并为文档站点生成 manifest.json。

**步骤 1：编写脚本**

```typescript
// e2e/scripts/generate-docs-manifest.ts
import * as fs from "fs";
import * as path from "path";

interface ScreenshotManifestEntry {
  file: string;
  page: string;
  route: string;
  viewport: string;
  role: string;
  description: string;
}

/** Map screenshot filenames to metadata */
const PAGE_METADATA: Record<
  string,
  { page: string; route: string; description: string }
> = {
  dashboard: {
    page: "Dashboard",
    route: "/",
    description: "Main dashboard with health status and statistics",
  },
  repositories: {
    page: "Repositories",
    route: "/repositories",
    description: "Repository management with split-panel layout",
  },
  packages: {
    page: "Packages",
    route: "/packages",
    description: "Package browser with search and filters",
  },
  search: {
    page: "Search",
    route: "/search",
    description: "Global search across all artifacts",
  },
  login: {
    page: "Login",
    route: "/login",
    description: "Authentication page with SSO support",
  },
  users: {
    page: "Users",
    route: "/users",
    description: "User management with RBAC controls",
  },
  groups: {
    page: "Groups",
    route: "/groups",
    description: "Group management for team access",
  },
  settings: {
    page: "Settings",
    route: "/settings",
    description: "System configuration and storage settings",
  },
  security: {
    page: "Security",
    route: "/security",
    description: "Security dashboard with vulnerability overview",
  },
  analytics: {
    page: "Analytics",
    route: "/analytics",
    description: "Usage analytics and download metrics",
  },
  monitoring: {
    page: "Monitoring",
    route: "/monitoring",
    description: "System health monitoring",
  },
  permissions: {
    page: "Permissions",
    route: "/permissions",
    description: "Permission rules management",
  },
  "quality-gates": {
    page: "Quality Gates",
    route: "/quality-gates",
    description: "Artifact quality gate policies",
  },
  backups: {
    page: "Backups",
    route: "/backups",
    description: "Backup and restore management",
  },
  lifecycle: {
    page: "Lifecycle",
    route: "/lifecycle",
    description: "Artifact lifecycle policies",
  },
  telemetry: {
    page: "Telemetry",
    route: "/telemetry",
    description: "Telemetry data and opt-in settings",
  },
  "system-health": {
    page: "System Health",
    route: "/system-health",
    description: "Detailed system health checks",
  },
};

function parseScreenshotName(
  filename: string,
): Partial<ScreenshotManifestEntry> {
  // Format: {page}-{viewport}-{role}.png
  const match = filename.match(/^(.+)-(desktop|mobile)-(\w+)\.png$/);
  if (!match) return {};
  const [, pageName, viewport, role] = match;
  const meta = PAGE_METADATA[pageName] || {
    page: pageName,
    route: `/${pageName}`,
    description: "",
  };
  return { ...meta, viewport, role, file: filename };
}

function main() {
  const snapshotDirs = [
    "e2e/suites/visual/pages/core-pages.spec.ts-snapshots",
    "e2e/suites/visual/pages/admin-pages.spec.ts-snapshots",
  ];

  const manifest: ScreenshotManifestEntry[] = [];
  const docsExportDir = "e2e/docs-export";

  for (const dir of snapshotDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png"));
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
    path.join(docsExportDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`Generated manifest with ${manifest.length} entries`);
}

main();
```

**步骤 2：添加 npm 脚本**

在 `package.json` 中添加：

```json
"test:e2e:docs-export": "npx tsx e2e/scripts/generate-docs-manifest.ts"
```

**步骤 3：提交**

```bash
git add e2e/scripts/generate-docs-manifest.ts package.json
git commit -m "feat(e2e): add docs-export manifest generator script"
```

---

### 任务 28：更新 CI 工作流以并行套件

**文件：**

- 修改：`.github/workflows/ci.yml`

**步骤 1：更新 e2e 任务以运行并行套件**

将现有 `e2e` 任务替换为三个并行任务。关键变更：

1. 添加 `e2e-setup` 任务，启动 docker-compose 并运行 seed
2. 拆分为 `e2e-interactions`（带分片）、`e2e-roles`、`e2e-visual` 任务
3. 仅在 main 分支添加 `e2e-docs-export` 任务

`e2e-interactions` 任务使用 Playwright 的 `--shard` 标志：

```yaml
e2e-interactions:
  needs: [e2e-setup]
  strategy:
    matrix:
      shard: [1, 2, 3]
  steps:
    - run: npx playwright test --project=interactions --shard=${{ matrix.shard }}/3 --reporter=github,html
```

`e2e-roles` 任务：

```yaml
e2e-roles:
  needs: [e2e-setup]
  steps:
    - run: npx playwright test --project=roles-admin --project=roles-developer --project=roles-viewer --project=roles-security --project=roles-restricted --project=roles-unauthenticated --reporter=github,html
```

`e2e-visual` 任务：

```yaml
e2e-visual:
  needs: [e2e-setup]
  steps:
    - run: npx playwright test --project=visual --reporter=github,html
    # Upload diff images on failure
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: visual-regression-diffs
        path: test-results/
        retention-days: 7
```

`e2e-docs-export` 任务（仅 main 分支）：

```yaml
e2e-docs-export:
  if: github.ref == 'refs/heads/main'
  needs: [e2e-visual]
  steps:
    - run: npm run test:e2e:docs-export
    - uses: actions/upload-artifact@v4
      with:
        name: docs-screenshots
        path: e2e/docs-export/
        retention-days: 30
```

**步骤 2：提交**

```bash
git add .github/workflows/ci.yml
git commit -m "feat(ci): update E2E pipeline with parallel suites, sharding, and docs export"
```

---

## 阶段 6：文档站点图库

### 任务 29：在文档站点创建 UI 图库页面

**文件：**

- 创建：`artifact-keeper-site/src/content/docs/docs/ui-gallery.mdx`
- 修改：`artifact-keeper-site/astro.config.mjs`（添加侧边栏条目）

**步骤 1：编写图库 MDX 页面**

图库页面从 `public/screenshots/` 读取截图，并在可筛选的网格中显示它们。由于 Astro/Starlight 支持带组件的 MDX，请创建一个简单的图库组件。

```mdx
---
title: UI Gallery
description: Auto-generated screenshots of every page in Artifact Keeper
---

import { Image } from "astro:assets";

# UI Gallery

Browse screenshots of every page in the Artifact Keeper web interface. These are generated automatically from our Playwright E2E test suite and updated on every release.

## Pages

Screenshots are captured at desktop (1280x720) and mobile (375x812) viewports.

{/* This page will be populated by the CI pipeline that copies screenshots to public/screenshots/ */}
{/* For now, reference screenshots manually as they become available */}

### Dashboard

![Dashboard - Desktop](/screenshots/dashboard-desktop-admin.png)

### Repositories

![Repositories - Desktop](/screenshots/repositories-desktop-admin.png)

### Packages

![Packages - Desktop](/screenshots/packages-desktop-admin.png)

### Security Dashboard

![Security - Desktop](/screenshots/security-desktop-admin.png)

### User Management

![Users - Desktop](/screenshots/users-desktop-admin.png)
```

**步骤 2：在 astro.config.mjs 中添加侧边栏条目**

在相应部分下添加：

```javascript
{ label: 'UI Gallery', link: '/docs/ui-gallery' }
```

**步骤 3：提交（在 artifact-keeper-site 仓库中）**

```bash
cd /Users/khan/ak/artifact-keeper-site
git add src/content/docs/docs/ui-gallery.mdx astro.config.mjs
git commit -m "feat(docs): add auto-generated UI gallery page for Playwright screenshots"
```

---

### 任务 30：缺口分析 - 创建其余页面对象与交互 spec

完成阶段 1-5 后，运行以下缺口分析：

**步骤 1：列出所有没有交互 spec 的路由**

将 `src/app/**/page.tsx` 文件与 `e2e/suites/interactions/**/*.spec.ts` 进行比较。任何没有相应 spec 文件的页面都需要一个。

**步骤 2：创建缺失的页面对象**

为每个还没有 POM 的页面在 `e2e/fixtures/page-objects/` 中创建一个。遵循与任务 6 相同的模式。

可能缺少 POM 的页面（按需创建）：

- `StagingPage.ts`
- `SearchPage.ts`
- `BuildsPage.ts`
- `PluginsPage.ts`
- `PeersPage.ts`
- `ReplicationPage.ts`
- `WebhooksPage.ts`
- `AccessTokensPage.ts`
- `ProfilePage.ts`（已存在，但可能需要扩展）
- `ServiceAccountsPage.ts`
- `PermissionsPage.ts`
- `SettingsPage.ts`
- `SSOPage.ts`
- `BackupsPage.ts`
- `MigrationPage.ts`
- `AnalyticsPage.ts`
- `MonitoringPage.ts`
- `TelemetryPage.ts`
- `LifecyclePage.ts`
- `ApprovalsPage.ts`
- `SecurityDashboardPage.ts`
- `SecurityScansPage.ts`
- `SecurityPoliciesPage.ts`
- `DependencyTrackPage.ts`
- `QualityGatesPage.ts`
- `LicensePoliciesPage.ts`
- `SystemHealthPage.ts`
- `PackageDetailPage.ts`
- `RepositoryDetailPage.ts`

**步骤 3：添加缺失的交互测试**

对于每个迁移的 spec，检查它是否覆盖：

- 所有 CRUD 操作（创建、读取、更新、删除）
- 表单校验（必填字段、无效输入）
- 加载状态（骨架屏）
- 空状态（无数据消息）
- 错误状态（通过 `page.route()` 模拟 API 失败）
- 所有交互元素（按钮、下拉框、标签页、开关、分页）

为发现的任何缺口添加测试。

**步骤 4：随着 POM 与 spec 的添加逐步提交**

```bash
git add e2e/fixtures/page-objects/ e2e/suites/interactions/
git commit -m "feat(e2e): add remaining page objects and close interaction coverage gaps"
```

---

## 总结

| 阶段           | 任务  | 描述                                                                                     |
| -------------- | ----- | ---------------------------------------------------------------------------------------- |
| 1：基础设施    | 1-8   | 目录结构、认证状态、预置数据、fixtures、POM、Playwright 配置、视觉 CSS 掩码              |
| 2：迁移        | 9-19  | 将所有 38 个现有 spec 迁移到新的套件结构，移除遗留文件                                   |
| 3：RBAC        | 20-23 | 6 个角色 spec（admin、developer、viewer、security-auditor、restricted、unauthenticated） |
| 4：视觉        | 24-26 | 页面截图、组件截图、状态截图（加载/空/错误）                                             |
| 5：CI + 文档   | 27-28 | Manifest 生成器、带分片的并行 CI 流水线                                                  |
| 6：文档 + 缺口 | 29-30 | 文档站点图库页面、剩余 POM 与 spec 的缺口分析                                            |

总计：30 个任务，在每个阶段内顺序执行。阶段 3、4 与 5 可在阶段 2 完成后并行运行。
