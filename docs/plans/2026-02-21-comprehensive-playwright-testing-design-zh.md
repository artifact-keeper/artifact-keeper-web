# 综合 Playwright E2E 测试套件设计

**日期：** 2026-02-21
**状态：** 已批准
**范围：** artifact-keeper-web

## 目标

为 artifact-keeper-web 前端实现 100% 的 Playwright 测试覆盖率：覆盖每一个用户可见的交互、完整的 RBAC 角色矩阵、带页面级与组件级截图的视觉回归，以及一条将精选截图导出到文档站点的流水线。

## 当前状态

- 38 个 E2E spec 文件（5,130 行），覆盖大多数页面但仅以管理员角色
- 4 个页面对象模型（login、dashboard、profile、repositories）
- 4 个单元测试文件（仅工具函数）
- Playwright 配置为针对 docker-compose 技术栈（Postgres、Meilisearch、backend、web）运行 Chromium
- CI 流水线：lint、unit、build、E2E（顺序执行）

## 设计决策

- **真实后端**：所有测试都针对完整的 docker-compose 技术栈运行。除模拟错误状态外不做 API 模拟。
- **按关注点分套件**：三个独立测试套件（interactions、roles、visual），而不是按页面的单体文件。
- **完整 RBAC 矩阵**：五个用户角色外加未认证，每个都有存储的认证状态。
- **视觉回归**：整页 + 组件级 + 状态截图，基线提交到 git。
- **截图即文档**：CI 将精选截图导出到文档站点，带自动生成的图库与内联引用。
- **增量迁移**：现有 38 个 spec 迁入新结构，而不是从零重写。

## 测试架构

### 目录结构

```
e2e/
  setup/
    global-setup.ts             # 为所有角色创建认证状态
    seed-data.ts                # 基于 API 的数据预置
    teardown.ts                 # 套件之间的清理
    auth-states.ts              # 角色定义 + 存储的认证文件

  fixtures/
    test-fixtures.ts            # 扩展的 Playwright fixtures
    page-objects/               # 每个页面一个 POM（约 40 个文件）
      DashboardPage.ts
      RepositoriesPage.ts
      PackagesPage.ts
      LoginPage.ts
      UsersPage.ts
      GroupsPage.ts
      ...

  suites/
    interactions/               # 每个可点击元素、表单、导航
      auth/
      dashboard/
      repositories/
      packages/
      staging/
      admin/
      security/
      operations/
      integrations/

    roles/                      # RBAC 访问矩阵
      admin.spec.ts
      regular-user.spec.ts
      viewer.spec.ts
      security-auditor.spec.ts
      restricted.spec.ts
      unauthenticated.spec.ts

    visual/                     # 截图基线
      pages/
      components/
      states/

  screenshots/                  # 基线图像存储
    pages/
    components/
    states/

  docs-export/                  # CI 将精选截图复制到这里
    manifest.json
```

### Playwright 配置项目

四个项目按依赖顺序运行：

1. **setup** - 创建认证状态并预置数据
2. **interactions** - 所有交互测试（依赖 setup，以管理员运行）
3. **roles** - RBAC 矩阵，每个角色一个子项目（依赖 setup）
4. **visual** - 截图比较（依赖 setup）

每个套件都可以独立运行：`npx playwright test --project=interactions`。

## 数据预置

一个 `seed-data.ts` 模块在测试运行前使用后端 API 创建已知数据集。

**预置数据：**

- 5 个用户：`admin`（完全访问）、`developer`（读取 + 推送）、`viewer`（只读）、`security-auditor`（仅安全页面）、`restricted`（最小权限）
- 1 个带 API 令牌的服务账号
- 3 个仓库（Maven 本地、NPM 远程、Docker 虚拟）
- 跨格式的约 10 个包及版本
- 2 个组（dev-team、security-team）并分配了用户
- 1 个 Webhook、1 条复制规则、1 个质量门禁、1 条生命周期策略
- 每个用户 1 个访问令牌

**认证状态文件**存储在 `e2e/.auth/`：

```
admin.json
developer.json
viewer.json
security-auditor.json
restricted.json
```

Teardown 在所有套件之后运行，删除预置数据以保证幂等。

## 页面对象模型库

从 4 个 POM 扩展到约 40 个（每个页面一个）。

**约定：**

- 每个页面一个类，命名为 `{Page}Page`
- 定位器为只读属性，使用可访问选择器（`getByRole`、`getByTestId`、`getByText`）
- 常见动作为方法（例如 `createRepository()`、`deleteUser()`）
- POM 内不做断言；所有 `expect()` 调用由测试拥有

**共享组件辅助函数：**

- `DialogHelper` - 打开、填充、提交、取消
- `DataTableHelper` - 分页、排序、筛选、断言行数
- `TabHelper` - 切换标签页、验证活动标签页
- `ToastHelper` - 断言成功/错误 toast

## 交互测试覆盖图

约 45 个 spec 文件，按功能区域组织：

### Auth

- `login.spec.ts` - 用户名/密码、校验错误、错误凭据、LDAP 标签页、SSO 按钮
- `totp.spec.ts` - TOTP 设置、代码输入、无效代码拒绝
- `password-change.spec.ts` - 首次登录强制更改、自愿更改、不匹配校验
- `logout.spec.ts` - 会话清除、重定向到登录

### Dashboard

- `dashboard.spec.ts` - 健康卡片、管理员统计、CVE 图表、最近仓库表格

### 仓库与包

- `repo-list.spec.ts` - 列表、搜索、格式筛选、类型筛选、排序、分页
- `repo-create.spec.ts` - 对话框、表单校验、用所有格式类型创建
- `repo-edit.spec.ts` - 编辑对话框预填、保存、取消
- `repo-delete.spec.ts` - 确认对话框、删除后从列表移除
- `repo-detail.spec.ts` - 元数据、标签页（配置、包、权限）
- `package-browse.spec.ts` - 列表/网格切换、搜索、筛选、排序、分页
- `package-detail.spec.ts` - 元数据、版本、安装命令复制、文件树、依赖
- `package-versions.spec.ts` - 版本标签页、比较、下载链接

### Staging

- `staging-list.spec.ts` - 列表、筛选、搜索
- `staging-detail.spec.ts` - 暂存制品、批准/拒绝
- `staging-approval.spec.ts` - 端到端批准工作流

### Admin

- `users.spec.ts` - 列表、创建、编辑、管理员开关、重置密码、删除
- `groups.spec.ts` - 列表、创建、添加/移除成员、删除
- `service-accounts.spec.ts` - 列表、创建、令牌生成、撤销、删除
- `permissions.spec.ts` - 规则表、创建、编辑、删除
- `settings.spec.ts` - 服务器配置、存储设置
- `sso.spec.ts` - 提供商列表、创建 OIDC/SAML、编辑、删除、测试连接
- `backups.spec.ts` - 列表、触发备份、恢复、删除
- `migration.spec.ts` - 向导步骤、源配置、干跑、执行

### Security

- `security-dashboard.spec.ts` - 概览统计、CVE 表、严重级别分解
- `scans.spec.ts` - 扫描列表、触发扫描、带发现的详情页
- `policies.spec.ts` - 列表、创建/编辑/删除
- `dt-projects.spec.ts` - 列表、带风险仪表盘的详情、组件列表
- `quality-gates.spec.ts` - 列表、带条件创建、编辑、删除
- `license-policies.spec.ts` - 列表、带许可证模式创建、编辑、删除

### Operations

- `analytics.spec.ts` - 图表、日期范围筛选、导出
- `monitoring.spec.ts` - 系统指标、健康检查
- `telemetry.spec.ts` - 开关、数据显示
- `lifecycle.spec.ts` - 列表、创建策略、预览、执行
- `approvals.spec.ts` - 待处理列表、批准/拒绝

### Integrations

- `peers.spec.ts` - 列表、添加、测试连接、移除
- `replication.spec.ts` - 列表、创建推送/拉取、立即运行、删除
- `plugins.spec.ts` - 列表、安装、启用/禁用、卸载
- `webhooks.spec.ts` - 列表、带事件创建、测试、编辑、删除
- `access-tokens.spec.ts` - 列表、带作用域创建、复制值、撤销
- `profile.spec.ts` - 查看、编辑显示名、更改邮箱、TOTP 设置/禁用

每个 spec 还验证加载状态（骨架屏）、空状态（无数据消息）与错误状态（通过 `page.route()` 模拟 500 响应）。

## RBAC 角色矩阵

| 角色             | 可见页面                       | 隐藏页面                         | 关键限制           |
| ---------------- | ------------------------------ | -------------------------------- | ------------------ |
| admin            | 一切                           | 无                               | 完整 CRUD          |
| developer        | 仓库、包、暂存、集成、个人资料 | Admin 侧边栏区域                 | 无用户/组/设置管理 |
| viewer           | 仓库、包（只读）               | Admin、operations、创建/删除按钮 | 无写操作           |
| security-auditor | 安全页面、质量门禁、许可证策略 | Admin（用户/设置）、operations   | 只读安全           |
| restricted       | 仅 Dashboard、个人资料         | 大多数侧边栏条目                 | 最小访问           |
| unauthenticated  | 仅登录页                       | 其他一切                         | 重定向到 /login    |

每个角色 spec 导航到 5-10 个代表性页面，并断言正确的元素可见/隐藏。

## 视觉回归

### 页面级截图

- 每个路由组一个 spec，以管理员捕获每个页面
- 两种视口尺寸：桌面（1280x720）与移动（375x812）
- 命名约定：`{page}-{viewport}-{role}.png`

### 组件级截图

- 约 30 个定向捕获：侧边栏（折叠/展开）、顶栏、数据表、对话框、统计卡片、严重级别条、文件树、安装命令块
- 使用 `locator.screenshot()` 实现精确

### 状态截图

- 加载骨架（通过 `page.route()` 延迟 API 响应）
- 空状态（特定端点无预置数据）
- 错误状态（模拟 500 响应）
- 约 20 个状态基线

### 基线管理

- 存储在 `e2e/screenshots/`，提交到 git
- 阈值：`maxDiffPixelRatio: 0.01`（1% 容差）
- 通过 `stylePath` 注入 CSS 以隐藏动态内容（时间戳、随机 ID）
- 更新：`npx playwright test --update-snapshots`

## 截图即文档流水线

视觉套件在 CI 中运行后：

1. CI 将精选截图从 `e2e/screenshots/` 复制到 `e2e/docs-export/`
2. 一个 `manifest.json` 将每张截图映射到元数据（页面名、描述、视口、角色）
3. 一个后续工作流将 `docs-export/` 复制到 `artifact-keeper-site/public/screenshots/`
4. 文档站点提供：
   - **图库页面**（`/docs/ui-gallery`）由 manifest 自动生成，支持按页面/视口筛选
   - 现有指南页面中的**内联引用**

### Manifest 格式

```json
[
  {
    "file": "repositories-desktop-admin.png",
    "page": "Repositories",
    "route": "/repositories",
    "viewport": "desktop",
    "role": "admin",
    "description": "Repository management with split-panel layout"
  }
]
```

## CI 流水线

```
lint ──┐
       ├──► build ──► e2e-setup ──┬──► e2e-interactions (3 shards)
test ──┘                          ├──► e2e-roles
                                  ├──► e2e-visual
                                  └──► docs-screenshot-export (main only)
```

- interactions 套件在 3 个 CI runner 上分片
- setup 之后三个套件并行运行
- 失败时 visual 任务将差异图像作为工件上传
- 文档导出仅在 main 分支合并时执行，并在 artifact-keeper-site 上开启 PR
- 超时：interactions 30 分钟（分片）、roles 10 分钟、visual 15 分钟

## 迁移策略

增量式，而非大爆炸式：

1. **阶段 1：基础设施** - setup、fixtures、POM 库、更新的 Playwright 配置
2. **阶段 2：迁移现有 38 个 spec** 到 `suites/interactions/`（提取 POM、重组）
3. **阶段 3：RBAC 角色测试** - 在预置中加入用户创建，编写角色 spec
4. **阶段 4：视觉回归** - 捕获初始基线，添加视觉 spec
5. **阶段 5：CI 更新** - 并行套件、分片、文档导出工作流
6. **阶段 6：缺口分析** - 识别未测试元素，补齐剩余覆盖

迁移期间旧 `e2e/*.spec.ts` 文件保持可用，一旦所有测试在新结构中通过即被移除。

## 预计范围

- 约 40 个页面对象模型
- 约 45 个交互 spec 文件
- 约 6 个角色 spec 文件
- 约 10 个视觉 spec 文件（页面、组件、状态）
- 更新后的 Playwright 配置，含 4 个项目组
- 更新后的 CI 工作流，含并行任务与分片
- 文档站点图库页面 + manifest 流水线
