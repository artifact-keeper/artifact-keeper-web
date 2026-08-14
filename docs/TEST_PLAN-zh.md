# Web 前端测试计划

## 概述

artifact-keeper web 前端使用 Playwright 进行 E2E 浏览器测试，使用 ESLint 进行静态分析，并辅以 Next.js 构建验证。

## 测试清单

| 测试类型 | 框架       | 数量            | CI 任务 | 状态   |
| -------- | ---------- | --------------- | ------- | ------ |
| Lint     | ESLint     | 全代码库        | `lint`  | 进行中 |
| 构建     | Next.js    | 整个应用        | `build` | 进行中 |
| E2E      | Playwright | 44 个 spec 文件 | `e2e`   | 进行中 |
| 单元测试 | （无）     | 0               | -       | 缺失   |
| 视觉回归 | （无）     | 0               | -       | 缺失   |
| 可访问性 | （无）     | 0               | -       | 缺失   |

## 如何运行

### Lint

```bash
npm run lint
```

### 构建

```bash
npm run build
```

### E2E 测试（需要运行中的后端）

```bash
npx playwright test                              # 全部测试
npx playwright test e2e/service-accounts.spec.ts  # 单个文件
npx playwright test --ui                          # 交互模式
```

### 带 Docker 技术栈的 E2E

```bash
docker compose -f docker-compose.e2e.yml up -d
npx playwright test
```

## E2E 测试覆盖

44 个 spec 文件，覆盖：admin、auth、dashboard、repositories、packages、builds、approvals、quality gates、staging、lifecycle、backups、replication、peers、monitoring、analytics、license policies、migration、webhooks、plugins、permissions、groups、users、SSO、service accounts、access tokens、health dashboard、setup、package browser、package detail、repository detail、search、profile、security、telemetry、API 集成。

## CI 流水线

```
PR 打开/推送
  -> lint (ESLint)
  -> build (Next.js)
  -> e2e (针对 docker-compose 技术栈的 Playwright)

合并到 main
  -> 以上全部 PLUS:
  -> docker（多平台镜像构建 + 推送到 ghcr.io）
```

## 缺口与路线图

| 缺口           | 建议                                           | 优先级 |
| -------------- | ---------------------------------------------- | ------ |
| 无单元测试     | 为工具函数、Hooks 与 API 客户端函数添加 Vitest | P2     |
| 无视觉回归     | 为关键页面添加 Playwright `toHaveScreenshot()` | P3     |
| 无可访问性测试 | 在 E2E 测试中添加 axe-core 检查                | P2     |
| 无组件测试     | 添加 Playwright 组件测试或 Storybook           | P3     |

## 代理辅助 QA

调用测试覆盖率分析器以查找未经测试的页面：

```bash
claude --print ".claude/agents/test-coverage.md"
```

调用功能对等跟踪器以比较 web 与移动端：

```bash
claude --print ".claude/agents/feature-parity.md"
```

代码变更后调用 E2E 回归检测器：

```bash
claude --print ".claude/agents/e2e-regression.md"
```
