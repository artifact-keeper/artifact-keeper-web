# 暂存仓库创建 UI - 实施计划

> **给 Claude：** 必需子技能：使用 superpowers:executing-plans 逐任务实施此计划。

**目标：** 允许用户通过 web UI 的创建仓库对话框创建暂存仓库。

**架构：** 在现有类型下拉框中添加"Staging"，选中时显示内联提示，并显示一个创建后 toast，链接到 /staging 页面以配置提升规则。

**技术栈：** Next.js 15、React、TypeScript、sonner（toast）、shadcn/ui

---

### 任务 1：将 Staging 添加到 TYPE_OPTIONS

**文件：**

- 修改：`src/app/(app)/repositories/_lib/constants.ts:74-78`

**步骤 1：添加 staging 选项**

在 `constants.ts` 中，将 staging 添加到 "Local" 之后的 `TYPE_OPTIONS` 数组中：

```ts
export const TYPE_OPTIONS: { value: RepositoryType; label: string }[] = [
  { value: "local", label: "Local" },
  { value: "staging", label: "Staging" },
  { value: "remote", label: "Remote" },
  { value: "virtual", label: "Virtual" },
];
```

**步骤 2：验证构建**

运行：`cd /Users/khan/ak/artifact-keeper-web && npx tsc --noEmit`
预期：无错误（`src/types/index.ts` 中的 `RepositoryType` 已包含 `'staging'`）

**步骤 3：提交**

```bash
git add src/app/(app)/repositories/_lib/constants.ts
git commit -m "feat: add staging to repository type options"
```

---

### 任务 2：为 staging 类型添加内联提示

**文件：**

- 修改：`src/app/(app)/repositories/_components/repo-dialogs.tsx:256-313`

**步骤 1：在类型选择器网格后添加 staging 提示**

在网格的结束 `</div>`（第 256 行）之后、远程仓库上游 URL 区域（第 257 行）之前添加：

```tsx
{
  /* Staging repository: inline hint */
}
{
  createForm.repo_type === "staging" && (
    <p className="text-xs text-muted-foreground">
      Staging repos hold artifacts for review before promotion to a release
      repository. Configure promotion rules after creation.
    </p>
  );
}
```

**步骤 2：验证构建**

运行：`cd /Users/khan/ak/artifact-keeper-web && npx tsc --noEmit`
预期：无错误

**步骤 3：提交**

```bash
git add src/app/(app)/repositories/_components/repo-dialogs.tsx
git commit -m "feat: show inline hint when staging type is selected"
```

---

### 任务 3：添加带 staging 链接的创建后 toast

**文件：**

- 修改：`src/app/(app)/repositories/page.tsx:102-108`

**步骤 1：更新 createMutation onSuccess 回调**

第 104 行当前的 onSuccess 显示一个通用 toast。更新它，使创建的仓库为 staging 类型时显示一个带操作链接的 staging 专用 toast：

```tsx
  const createMutation = useMutation({
    mutationFn: (d: CreateRepositoryRequest) => repositoriesApi.create(d),
    onSuccess: (_data, variables) => {
      invalidateAllRepoQueries();
      setCreateOpen(false);
      if (variables.repo_type === "staging") {
        toast.success("Repository created", {
          description: "Configure promotion rules to start promoting artifacts.",
          action: {
            label: "Go to Staging",
            onClick: () => router.push("/staging"),
          },
        });
      } else {
        toast.success("Repository created");
      }
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, "Failed to create repository"));
```

注意：`router` 已导入并可用（第 4 行：`const router = useRouter()`）。`variables` 参数可访问变更输入。Sonner 的 `toast.success` 支持 `description` 与 `action` 字段。

**步骤 2：验证构建**

运行：`cd /Users/khan/ak/artifact-keeper-web && npx tsc --noEmit`
预期：无错误

**步骤 3：提交**

```bash
git add src/app/(app)/repositories/page.tsx
git commit -m "feat: show staging-specific toast with link after creation"
```

---

### 任务 4：验证类型筛选包含 staging

**文件：** 无（仅验证）

**步骤 1：检查仓库列表类型筛选**

阅读 `src/app/(app)/repositories/page.tsx` 并找到类型筛选下拉框。验证它已使用 constants 中的 `TYPE_OPTIONS`（现在包含 staging）。如果它使用硬编码列表，请更新为使用 `TYPE_OPTIONS`。

**步骤 2：检查仓库列表徽章颜色**

阅读 `src/lib/utils.ts` 并验证 `REPO_TYPE_COLORS` 包含 `staging` 条目。它应该已有一个（紫色）。

**步骤 3：提交（仅在需要变更时）**

---

### 任务 5：手动测试清单

运行开发服务器并验证：

1. 打开"创建仓库"对话框，确认"Staging"出现在类型下拉框中
2. 选择"Staging"类型，确认内联提示文本出现
3. 选择"Remote"类型，确认提示消失且 Upstream URL 出现
4. 再次选择"Staging"，确认 Upstream URL 被隐藏
5. 创建一个暂存仓库（key："test-staging"，format："maven"），确认 toast 显示且带"Go to Staging"操作
6. 点击 toast 中的"Go to Staging"，确认导航到 /staging
7. 验证暂存仓库出现在 /repositories 列表中且带紫色徽章
8. 验证暂存仓库出现在 /staging 页面
9. 创建一个本地仓库，确认显示通用"Repository created"toast（无 staging 链接）
