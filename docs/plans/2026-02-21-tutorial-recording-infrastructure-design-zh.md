# 教程录制基础设施设计

## 目的

构建一个基于 Playwright 的教程录制系统，根据 Artifact Keeper Web UI 的脚本化界面演示生成 YouTube 就绪的视频内容。系统捕获 MP4 录制、关键步骤的截图，以及用于 AI 配音的解说脚本。

## 受众

混合人群：评估产品的新用户（概览/介绍视频）与配置其实例的现有管理员（操作指南）。

## 架构

### 独立配置，共享基础设施

web 项目根目录有一个专用的 `playwright-tutorials.config.ts`。它从 `e2e/fixtures/` 导入共享页面对象与 fixtures，但与测试套件独立运行。教程脚本位于 `e2e/tutorials/`，输出到 `e2e/tutorials/output/`（已 gitignore）。

### 与 E2E 测试的配置差异

| 设置     | E2E 测试                | 教程                       |
| -------- | ----------------------- | -------------------------- |
| 视频     | `off`（重试时 trace）   | 始终 `on`                  |
| 视口     | 1280x720（桌面 Chrome） | 1920x1080（YouTube 1080p） |
| 截图     | 仅失败时                | 在关键步骤手动             |
| Workers  | 并行                    | 1（顺序，一次一个）        |
| 超时     | 默认 30s                | 120s（流程缓慢而刻意）     |
| 基础 URL | 同一个 Tailscale 实例   | 相同                       |
| 认证     | 管理员存储状态          | 管理员存储状态             |

### 教程脚本结构

每个 `.tutorial.ts` 文件定义一个教程视频。它使用一个 `TutorialHelper` 类来包装常见模式：

- `helper.pause(ms)` - 刻意延迟，让观众能跟上
- `helper.chapter(name)` - 用时间戳标记章节边界
- `helper.step(name)` - 捕获截图并记录一条解说提示
- `helper.narrate(text)` - 记录带当前时间戳的解说文本，用于 AI TTS 脚本生成

脚本**不使用**断言。它们是录制，不是测试。它们使用页面对象进行导航，但在动作之间增加刻意的节奏。

### 输出结构

```
e2e/tutorials/output/
  manifest.json                          # 带元数据的全部教程
  01-getting-started/
    recording.webm                       # Playwright 视频捕获
    narration-script.md                  # 带时间戳的解说，用于 AI TTS
    screenshots/
      step-01-login-page.png
      step-02-dashboard-overview.png
      ...
  02-create-repositories/
    recording.webm
    narration-script.md
    screenshots/
      ...
```

### Manifest 格式

```json
{
  "tutorials": [
    {
      "id": "01-getting-started",
      "title": "Getting Started with Artifact Keeper",
      "description": "Log in, explore the dashboard, and navigate the main sections of Artifact Keeper.",
      "chapters": [
        { "time": "0:00", "name": "Login" },
        { "time": "0:32", "name": "Dashboard Overview" },
        { "time": "1:15", "name": "Navigation Tour" }
      ],
      "outputDir": "01-getting-started",
      "thumbnailScreenshot": "step-02-dashboard-overview.png"
    }
  ]
}
```

### 预置数据

复用 `e2e/setup/seed-data.ts` 中现有的 `seedAll()` 作为基础数据（用户、组）。新增一个教程专用的预置模块（`tutorial-seed.ts`），创建更接近真实的内容：

- 带生产风格名称的仓库（`maven-releases`、`npm-proxy`、`docker-hub-proxy`、`company-virtual`）
- 预填逼真的描述
- 带有意义阈值的质量门禁与生命周期策略

### 解说流水线

1. 教程脚本调用 `helper.narrate("Click Create Repository to set up a new local Maven repository.")`
2. 每次调用在内存中存储 `{ timestamp, text }`
3. 教程结束后，辅助函数写出带时间戳条目的 `narration-script.md`
4. markdown 文件在外部被送入 ElevenLabs / 类似的 TTS 服务
5. 在 Clueso 或视频编辑器中音频与视频同步

Playwright 基础设施**不**自行做 TTS。它产生脚本。音频生成与视频合成在外部完成。

## 教程集（6 个视频）

| #   | 文件                                    | 标题                                 | 预计时长 | 关键流程                                   |
| --- | --------------------------------------- | ------------------------------------ | -------- | ------------------------------------------ |
| 1   | `01-getting-started.tutorial.ts`        | Getting Started with Artifact Keeper | 2-3 分钟 | 登录、仪表盘导览、侧边栏导航               |
| 2   | `02-create-repositories.tutorial.ts`    | Creating Repositories                | 3-4 分钟 | 创建本地 Maven、远程 NPM、虚拟 Docker 仓库 |
| 3   | `03-proxy-setup.tutorial.ts`            | Setting Up a Proxy Repository        | 3-4 分钟 | 创建 NPM 代理、配置上游 URL、浏览代理包    |
| 4   | `04-virtual-repositories.tutorial.ts`   | Virtual Repositories                 | 3-4 分钟 | 创建虚拟仓库、添加本地 + 代理源、解释解析  |
| 5   | `05-security-quality-gates.tutorial.ts` | Security Scanning and Quality Gates  | 3-4 分钟 | 安全仪表盘、查看扫描结果、创建质量门禁     |
| 6   | `06-user-management.tutorial.ts`        | User Management and Access Control   | 3-4 分钟 | 创建用户、组、分配权限、生成 API 密钥      |

## 文件结构

```
artifact-keeper-web/
  playwright-tutorials.config.ts
  e2e/tutorials/
    fixtures/
      tutorial-helper.ts          # TutorialHelper 类（pause、chapter、step、narrate）
      tutorial-seed.ts            # 教程用的逼真预置数据
    scripts/
      generate-manifest.ts        # 运行后：从输出目录构建 manifest.json
    01-getting-started.tutorial.ts
    02-create-repositories.tutorial.ts
    03-proxy-setup.tutorial.ts
    04-virtual-repositories.tutorial.ts
    05-security-quality-gates.tutorial.ts
    06-user-management.tutorial.ts
    output/                       # 已 gitignore
```

## npm 脚本

```json
{
  "tutorial:record": "playwright test --config playwright-tutorials.config.ts",
  "tutorial:record:one": "playwright test --config playwright-tutorials.config.ts -g",
  "tutorial:manifest": "npx tsx e2e/tutorials/scripts/generate-manifest.ts"
}
```

## 依赖

不需要新依赖。Playwright 已处理视频录制与截图。解说脚本生成是纯 TypeScript 文件 I/O。
