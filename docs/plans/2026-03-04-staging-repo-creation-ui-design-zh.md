# 将暂存仓库创建添加到 UI

**问题：** https://github.com/artifact-keeper/artifact-keeper-web/issues/123
**日期：** 2026-03-04

## 问题

用户无法通过 web UI 创建暂存仓库。创建仓库对话框只提供 Local、Remote 与 Virtual 三种类型，尽管后端完全支持 staging 作为一种仓库类型。用户必须直接使用 API 来创建暂存仓库。

## 设计决策

- **两步工作流**：先创建暂存仓库，再单独配置提升规则。与后端的工作方式一致（创建时 `promotion_target_id` 与 `promotion_policy_id` 总是 NULL）。
- **两处都可见**：暂存仓库出现在主 /repositories 列表中（带现有紫色徽章）与专用的 /staging 页面。
- **简短的内联提示**：在类型下拉框中选择"Staging"时，显示一行提示，解释什么是暂存仓库，以及提升规则在创建后配置。
- **创建后 toast**：成功创建后，显示一个带链接的 toast，指向 /staging 页面以配置提升规则。

## 变更

### 1. constants.ts - 将 staging 添加到 TYPE_OPTIONS

在 TYPE_OPTIONS 数组中 "Local" 之后添加 `{ value: 'staging', label: 'Staging' }`。暂存仓库像本地仓库一样可写，因此将它们放在一起是合理的。

### 2. repo-dialogs.tsx - staging 类型的表单行为

当 `repo_type === 'staging'` 时：

- 隐藏"Upstream URL"字段（与 local 相同）
- 隐藏"Member Repositories"区域（与 local 相同）
- 在类型选择器下方显示内联提示文本："Staging repos hold artifacts for review before promotion to a release repository. Configure promotion rules after creation."

成功创建暂存仓库后，显示一个 toast：

- 消息："Repository created. Configure promotion rules to start promoting artifacts."
- 指向 `/staging` 的操作链接

### 3. 无需后端变更

`POST /api/v1/repositories` 端点已接受 `repo_type: "staging"`。`parse_repo_type()` 函数已处理它。创建时不需要新字段。

### 4. 无需仓库列表变更

仓库列表已支持全部四种类型：

- 类型筛选下拉框以 `?type=staging` 查询 API
- REPO_TYPE_COLORS 中已有紫色徽章样式
- API 返回时暂存仓库正确渲染

## 要修改的文件

| 文件                                                      | 变更                           |
| --------------------------------------------------------- | ------------------------------ |
| `src/app/(app)/repositories/_lib/constants.ts`            | 将 staging 添加到 TYPE_OPTIONS |
| `src/app/(app)/repositories/_components/repo-dialogs.tsx` | 内联提示 + 创建后 toast        |

## 测试

- 通过 UI 创建暂存仓库，验证它出现在 /repositories 与 /staging 中
- 验证内联提示只在选择"Staging"时显示
- 验证创建后 toast 出现且带可用链接
- 验证类型切换时正确隐藏/显示相应字段
- 验证 /repositories 上的类型筛选包含暂存仓库
