# 教程录制基础设施实施计划

> **给 Claude：** 必需子技能：使用 superpowers:executing-plans 逐任务实施此计划。

**目标：** 构建一个基于 Playwright 的教程录制系统，为 6 个培训视频生成 YouTube 就绪的 MP4、截图与解说脚本。

**架构：** 独立的 Playwright 配置（`playwright-tutorials.config.ts`），始终开启 1080p 视频录制。`e2e/tutorials/` 中的教程脚本使用 `TutorialHelper` 类进行节奏控制、章节标记与解说提示。复用现有 E2E 基础设施中的共享页面对象与预置数据。输出进入已 gitignore 的 `e2e/tutorials/output/`。

**技术栈：** Playwright 1.58.2（已安装）、TypeScript、现有页面对象

---

### 任务 1：搭建教程目录结构并更新 gitignore

**文件：**

- 创建：`e2e/tutorials/`（目录）
- 创建：`e2e/tutorials/fixtures/`（目录）
- 创建：`e2e/tutorials/scripts/`（目录）
- 修改：`.gitignore`

**步骤 1：创建目录结构**

```bash
cd /Users/khan/ak/artifact-keeper-web
mkdir -p e2e/tutorials/fixtures e2e/tutorials/scripts e2e/tutorials/output
```

**步骤 2：将输出目录添加到 .gitignore**

添加到 `.gitignore`：

```
# tutorial recordings
e2e/tutorials/output/
```

**步骤 3：提交**

```bash
git add .gitignore
git commit -m "chore: scaffold tutorial recording directory structure"
```

---

### 任务 2：创建 Playwright 教程配置

**文件：**

- 创建：`playwright-tutorials.config.ts`

**步骤 1：编写配置**

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/tutorials",
  testMatch: /\.tutorial\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ||
      "https://artifactkeeper.possum-fujita.ts.net",
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 },
    video: {
      mode: "on",
      size: { width: 1920, height: 1080 },
    },
    screenshot: "off", // we take manual screenshots via helper
    trace: "off",
    colorScheme: "dark",
    launchOptions: {
      slowMo: 100,
    },
  },
  projects: [
    {
      name: "tutorials-setup",
      testDir: "./e2e/setup",
      testMatch: /global-setup\.ts/,
    },
    {
      name: "tutorials",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["tutorials-setup"],
    },
  ],
});
```

**步骤 2：将 npm 脚本添加到 package.json**

添加这些脚本：

```json
"tutorial:record": "playwright test --config playwright-tutorials.config.ts",
"tutorial:record:one": "playwright test --config playwright-tutorials.config.ts -g"
```

**步骤 3：验证配置加载**

```bash
cd /Users/khan/ak/artifact-keeper-web
npx playwright test --config playwright-tutorials.config.ts --list
```

预期：无错误，列出 0 个测试（尚无教程文件）。

**步骤 4：提交**

```bash
git add playwright-tutorials.config.ts package.json
git commit -m "feat: add Playwright config for tutorial recordings"
```

---

### 任务 3：构建 TutorialHelper 类

**文件：**

- 创建：`e2e/tutorials/fixtures/tutorial-helper.ts`

这是所有教程脚本使用的核心工具。它管理节奏、截图、章节标记与解说脚本生成。

**步骤 1：编写 TutorialHelper**

````typescript
import { type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

export interface Chapter {
  name: string;
  timestampMs: number;
}

export interface NarrationCue {
  text: string;
  timestampMs: number;
}

export interface TutorialStep {
  name: string;
  screenshotPath: string;
  timestampMs: number;
}

export interface TutorialMetadata {
  id: string;
  title: string;
  description: string;
}

export class TutorialHelper {
  private startTime = 0;
  private chapters: Chapter[] = [];
  private narrationCues: NarrationCue[] = [];
  private steps: TutorialStep[] = [];
  private outputDir: string;
  private screenshotsDir: string;
  private stepCounter = 0;

  constructor(
    private page: Page,
    private metadata: TutorialMetadata,
  ) {
    this.outputDir = path.join(__dirname, "..", "output", metadata.id);
    this.screenshotsDir = path.join(this.outputDir, "screenshots");
  }

  /** Call at the start of each tutorial to initialize timing and directories. */
  async begin(): Promise<void> {
    fs.mkdirSync(this.screenshotsDir, { recursive: true });
    this.startTime = Date.now();
    this.chapters = [];
    this.narrationCues = [];
    this.steps = [];
    this.stepCounter = 0;
  }

  /** Deliberate pause so viewers can see the current state. */
  async pause(ms = 1500): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  /** Mark a chapter boundary (for YouTube chapters). */
  chapter(name: string): void {
    this.chapters.push({ name, timestampMs: this.elapsed() });
  }

  /** Record a narration cue for AI TTS script generation. */
  narrate(text: string): void {
    this.narrationCues.push({ text, timestampMs: this.elapsed() });
  }

  /** Capture a named screenshot and log the step. */
  async step(name: string): Promise<void> {
    this.stepCounter++;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const filename = `step-${String(this.stepCounter).padStart(2, "0")}-${slug}.png`;
    const screenshotPath = path.join(this.screenshotsDir, filename);

    await this.page.screenshot({ path: screenshotPath, fullPage: false });

    this.steps.push({
      name,
      screenshotPath: `screenshots/${filename}`,
      timestampMs: this.elapsed(),
    });
  }

  /** Narrate + screenshot in one call (common pattern). */
  async show(stepName: string, narration: string): Promise<void> {
    this.narrate(narration);
    await this.pause(800);
    await this.step(stepName);
    await this.pause(1200);
  }

  /** Call at the end of each tutorial to write output files. */
  async finish(): Promise<void> {
    this.writeNarrationScript();
    this.writeManifest();

    // Move the Playwright video to the output directory
    const video = this.page.video();
    if (video) {
      const videoPath = await video.path();
      if (videoPath) {
        const dest = path.join(this.outputDir, "recording.webm");
        // Playwright may still be writing; copy after a short wait
        await this.page.waitForTimeout(500);
        try {
          fs.copyFileSync(videoPath, dest);
        } catch {
          // Video may not be finalized yet; will be saved by Playwright to test-results
          console.log(
            `[tutorial] Video will be in test-results; manual copy may be needed.`,
          );
        }
      }
    }
  }

  private elapsed(): number {
    return Date.now() - this.startTime;
  }

  private formatTimestamp(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  private writeNarrationScript(): void {
    const lines = [
      `# ${this.metadata.title}`,
      "",
      `> ${this.metadata.description}`,
      "",
      "## Narration Script",
      "",
    ];

    for (const cue of this.narrationCues) {
      lines.push(`**[${this.formatTimestamp(cue.timestampMs)}]** ${cue.text}`);
      lines.push("");
    }

    if (this.chapters.length > 0) {
      lines.push("## YouTube Chapters");
      lines.push("");
      lines.push("```");
      for (const ch of this.chapters) {
        lines.push(`${this.formatTimestamp(ch.timestampMs)} ${ch.name}`);
      }
      lines.push("```");
    }

    fs.writeFileSync(
      path.join(this.outputDir, "narration-script.md"),
      lines.join("\n"),
    );
  }

  private writeManifest(): void {
    const manifest = {
      id: this.metadata.id,
      title: this.metadata.title,
      description: this.metadata.description,
      chapters: this.chapters.map((ch) => ({
        time: this.formatTimestamp(ch.timestampMs),
        name: ch.name,
      })),
      steps: this.steps.map((s) => ({
        name: s.name,
        screenshot: s.screenshotPath,
        time: this.formatTimestamp(s.timestampMs),
      })),
      thumbnailScreenshot:
        this.steps[1]?.screenshotPath ?? this.steps[0]?.screenshotPath ?? null,
    };

    fs.writeFileSync(
      path.join(this.outputDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
  }
}
````

**步骤 2：提交**

```bash
git add e2e/tutorials/fixtures/tutorial-helper.ts
git commit -m "feat: add TutorialHelper class for tutorial recordings"
```

---

### 任务 4：创建教程预置数据

**文件：**

- 创建：`e2e/tutorials/fixtures/tutorial-seed.ts`

创建比 E2E 测试预置更接近真实的数据。带生产风格名称与有意义描述的仓库。

**步骤 1：编写教程预置模块**

```typescript
import { type APIRequestContext } from "@playwright/test";

const API_BASE = "/api/v1";

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
  if (!resp.ok() && resp.status() !== 409) {
    console.warn(`[tutorial-seed] ${method} ${path} failed (${resp.status()})`);
  }
  return resp;
}

/** Seed repositories that look like a real company setup. */
export async function seedTutorialRepos(
  request: APIRequestContext,
): Promise<void> {
  const repos = [
    {
      key: "maven-releases",
      name: "Maven Releases",
      format: "maven",
      repo_type: "local",
      description: "Production Maven artifacts for release builds",
    },
    {
      key: "maven-snapshots",
      name: "Maven Snapshots",
      format: "maven",
      repo_type: "local",
      description: "Maven snapshot builds from CI pipelines",
    },
    {
      key: "npm-local",
      name: "NPM Local",
      format: "npm",
      repo_type: "local",
      description: "Internal NPM packages published by teams",
    },
    {
      key: "npmjs-proxy",
      name: "npmjs.org Proxy",
      format: "npm",
      repo_type: "remote",
      upstream_url: "https://registry.npmjs.org",
      description: "Caching proxy for the public NPM registry",
    },
    {
      key: "npm-virtual",
      name: "NPM Virtual",
      format: "npm",
      repo_type: "virtual",
      description: "Aggregates npm-local and npmjs-proxy for a single endpoint",
    },
    {
      key: "docker-hub-proxy",
      name: "Docker Hub Proxy",
      format: "docker",
      repo_type: "remote",
      upstream_url: "https://registry-1.docker.io",
      description: "Caching proxy for Docker Hub images",
    },
    {
      key: "docker-local",
      name: "Docker Local",
      format: "docker",
      repo_type: "local",
      description: "Internal Docker images built from CI",
    },
    {
      key: "pypi-proxy",
      name: "PyPI Proxy",
      format: "pypi",
      repo_type: "remote",
      upstream_url: "https://pypi.org",
      description: "Caching proxy for the Python Package Index",
    },
  ];

  for (const repo of repos) {
    await api(request, "POST", "/repositories", repo);
  }
}

/** Seed a tutorial-specific quality gate. */
export async function seedTutorialQualityGate(
  request: APIRequestContext,
): Promise<void> {
  await api(request, "POST", "/quality-gates", {
    name: "production-release-gate",
    description:
      "Blocks promotion to production if critical vulnerabilities are found",
    max_critical_issues: 0,
    max_high_issues: 3,
    required_checks: ["security"],
    action: "block",
  });
}

/** Seed a tutorial user and group. */
export async function seedTutorialUsers(
  request: APIRequestContext,
): Promise<void> {
  await api(request, "POST", "/users", {
    username: "jane.smith",
    password: "Tutorial1!",
    email: "jane.smith@example.com",
    display_name: "Jane Smith",
    is_admin: false,
  });

  await api(request, "POST", "/groups", {
    name: "platform-engineering",
    description: "Platform engineering team with publish access to all repos",
  });
}

/** Run all tutorial seed functions. */
export async function seedTutorialData(
  request: APIRequestContext,
): Promise<void> {
  console.log("[tutorial-seed] Creating tutorial repositories...");
  await seedTutorialRepos(request);
  console.log("[tutorial-seed] Creating tutorial quality gate...");
  await seedTutorialQualityGate(request);
  console.log("[tutorial-seed] Creating tutorial users...");
  await seedTutorialUsers(request);
  console.log("[tutorial-seed] Done.");
}
```

**步骤 2：提交**

```bash
git add e2e/tutorials/fixtures/tutorial-seed.ts
git commit -m "feat: add tutorial-specific seed data with realistic names"
```

---

### 任务 5：编写教程 01 - 快速入门

**文件：**

- 创建：`e2e/tutorials/01-getting-started.tutorial.ts`

**步骤 1：编写教程脚本**

```typescript
import { test } from "@playwright/test";
import { TutorialHelper } from "./fixtures/tutorial-helper";
import { DashboardPage } from "../fixtures/page-objects";

test("Tutorial: Getting Started with Artifact Keeper", async ({ page }) => {
  const tutorial = new TutorialHelper(page, {
    id: "01-getting-started",
    title: "Getting Started with Artifact Keeper",
    description:
      "Log in to Artifact Keeper, explore the dashboard, and navigate the main sections of the UI.",
  });
  await tutorial.begin();

  // --- Chapter 1: Login ---
  tutorial.chapter("Login");

  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await tutorial.show(
    "Login page",
    "Welcome to Artifact Keeper. Start by logging in with your credentials.",
  );

  await page.getByLabel(/username/i).fill("admin");
  await tutorial.pause(600);
  await page.getByLabel(/password/i).fill("admin");
  await tutorial.pause(600);

  tutorial.narrate("Enter your username and password, then click Sign In.");
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForLoadState("networkidle");
  await tutorial.pause(2000);

  // --- Chapter 2: Dashboard Overview ---
  tutorial.chapter("Dashboard Overview");

  await tutorial.show(
    "Dashboard",
    "This is the main dashboard. It shows system health, repository statistics, and recent activity.",
  );

  const dashboard = new DashboardPage(page);
  await tutorial.pause(1500);

  tutorial.narrate(
    "The health cards at the top show the status of your storage, database, and search engine.",
  );
  await tutorial.step("Health cards");
  await tutorial.pause(1500);

  tutorial.narrate(
    "Below that, you can see counts for repositories, artifacts, users, and total storage used.",
  );
  await tutorial.step("Statistics");
  await tutorial.pause(1500);

  // --- Chapter 3: Navigation Tour ---
  tutorial.chapter("Navigating the UI");

  tutorial.narrate(
    "The sidebar provides access to all sections. Let us walk through the main ones.",
  );
  await tutorial.pause(1000);

  // Repositories
  await page.goto("/repositories");
  await page.waitForLoadState("networkidle");
  await tutorial.show(
    "Repositories page",
    "The Repositories page shows all your local, remote, and virtual repositories in a split-panel layout.",
  );
  await tutorial.pause(1500);

  // Packages
  await page.goto("/packages");
  await page.waitForLoadState("networkidle");
  await tutorial.show(
    "Packages page",
    "The Packages page lets you browse and search all artifacts across repositories.",
  );
  await tutorial.pause(1500);

  // Security
  await page.goto("/security");
  await page.waitForLoadState("networkidle");
  await tutorial.show(
    "Security dashboard",
    "The Security dashboard gives you an overview of vulnerability scan results across all your artifacts.",
  );
  await tutorial.pause(1500);

  // Users
  await page.goto("/users");
  await page.waitForLoadState("networkidle");
  await tutorial.show(
    "Users page",
    "User management is where you create accounts, assign roles, and manage access.",
  );
  await tutorial.pause(1500);

  // Settings
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  await tutorial.show(
    "Settings page",
    "System settings let you configure storage, authentication, and other instance-wide options.",
  );
  await tutorial.pause(2000);

  tutorial.narrate(
    "That covers the basics. In the next video, we will create our first repositories.",
  );

  await tutorial.finish();
});
```

**步骤 2：验证其运行（干跑）**

```bash
cd /Users/khan/ak/artifact-keeper-web
npx playwright test --config playwright-tutorials.config.ts --list
```

预期：列出 "Tutorial: Getting Started with Artifact Keeper"

**步骤 3：提交**

```bash
git add e2e/tutorials/01-getting-started.tutorial.ts
git commit -m "feat: add Tutorial 01 - Getting Started"
```

---

### 任务 6：编写教程 02 - 创建仓库

**文件：**

- 创建：`e2e/tutorials/02-create-repositories.tutorial.ts`

**步骤 1：编写教程脚本**

```typescript
import { test } from "@playwright/test";
import { TutorialHelper } from "./fixtures/tutorial-helper";
import { seedTutorialData } from "./fixtures/tutorial-seed";

test("Tutorial: Creating Repositories", async ({ page, request }) => {
  const tutorial = new TutorialHelper(page, {
    id: "02-create-repositories",
    title: "Creating Repositories in Artifact Keeper",
    description:
      "Learn how to create local, remote, and virtual repositories for different package formats.",
  });
  await tutorial.begin();

  // --- Chapter 1: Overview ---
  tutorial.chapter("Repository Types");

  await page.goto("/repositories");
  await page.waitForLoadState("networkidle");
  await tutorial.show(
    "Repositories list",
    "Artifact Keeper supports three repository types: local for your own artifacts, remote for proxying external registries, and virtual for combining multiple sources.",
  );

  // --- Chapter 2: Create Local Repo ---
  tutorial.chapter("Create a Local Repository");

  tutorial.narrate(
    "Let us create a local Maven repository for our release builds.",
  );
  await page
    .getByRole("button", { name: /create repository/i })
    .first()
    .click();
  await page.waitForTimeout(1000);
  await tutorial.step("Create dialog open");

  // Fill in the form
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel(/key|name/i)
    .first()
    .fill("maven-releases");
  await tutorial.pause(800);

  // Select format
  const formatSelect = dialog
    .getByLabel(/format/i)
    .or(dialog.getByRole("combobox").first());
  await formatSelect.click();
  await tutorial.pause(500);
  await page.getByRole("option", { name: /maven/i }).first().click();
  await tutorial.pause(800);

  // Select type
  const typeSelect = dialog
    .getByLabel(/type/i)
    .or(dialog.getByRole("combobox").nth(1));
  await typeSelect.click();
  await tutorial.pause(500);
  await page.getByRole("option", { name: /local/i }).first().click();
  await tutorial.pause(800);

  await tutorial.show(
    "Local repo form filled",
    "We have named it maven-releases, selected Maven format, and local type.",
  );

  // Submit
  tutorial.narrate("Click Create to set up the repository.");
  await dialog.getByRole("button", { name: /create$/i }).click();
  await page.waitForLoadState("networkidle");
  await tutorial.pause(2000);
  await tutorial.step("Local repo created");

  // --- Chapter 3: Create Remote Repo ---
  tutorial.chapter("Create a Remote Repository");

  tutorial.narrate(
    "Now let us create a remote repository that proxies the public NPM registry.",
  );
  await page.goto("/repositories");
  await page.waitForLoadState("networkidle");
  await tutorial.pause(1000);

  await page
    .getByRole("button", { name: /create repository/i })
    .first()
    .click();
  await page.waitForTimeout(1000);

  const dialog2 = page.getByRole("dialog");
  await dialog2
    .getByLabel(/key|name/i)
    .first()
    .fill("npmjs-proxy");
  await tutorial.pause(800);

  const formatSelect2 = dialog2
    .getByLabel(/format/i)
    .or(dialog2.getByRole("combobox").first());
  await formatSelect2.click();
  await tutorial.pause(500);
  await page.getByRole("option", { name: /npm/i }).first().click();
  await tutorial.pause(800);

  const typeSelect2 = dialog2
    .getByLabel(/type/i)
    .or(dialog2.getByRole("combobox").nth(1));
  await typeSelect2.click();
  await tutorial.pause(500);
  await page
    .getByRole("option", { name: /remote/i })
    .first()
    .click();
  await tutorial.pause(800);

  // Fill upstream URL
  const urlInput = dialog2
    .getByLabel(/url|upstream/i)
    .or(dialog2.getByPlaceholder(/url/i));
  await urlInput.fill("https://registry.npmjs.org");
  await tutorial.pause(800);

  await tutorial.show(
    "Remote repo form",
    "For a remote repository, you also provide the upstream URL to proxy.",
  );

  tutorial.narrate("Click Create to set up the proxy.");
  await dialog2.getByRole("button", { name: /create$/i }).click();
  await page.waitForLoadState("networkidle");
  await tutorial.pause(2000);
  await tutorial.step("Remote repo created");

  // --- Chapter 4: Create Virtual Repo ---
  tutorial.chapter("Create a Virtual Repository");

  tutorial.narrate(
    "Finally, a virtual repository aggregates multiple sources behind a single URL.",
  );
  await page.goto("/repositories");
  await page.waitForLoadState("networkidle");
  await tutorial.pause(1000);

  await page
    .getByRole("button", { name: /create repository/i })
    .first()
    .click();
  await page.waitForTimeout(1000);

  const dialog3 = page.getByRole("dialog");
  await dialog3
    .getByLabel(/key|name/i)
    .first()
    .fill("npm-virtual");
  await tutorial.pause(800);

  const formatSelect3 = dialog3
    .getByLabel(/format/i)
    .or(dialog3.getByRole("combobox").first());
  await formatSelect3.click();
  await tutorial.pause(500);
  await page.getByRole("option", { name: /npm/i }).first().click();
  await tutorial.pause(800);

  const typeSelect3 = dialog3
    .getByLabel(/type/i)
    .or(dialog3.getByRole("combobox").nth(1));
  await typeSelect3.click();
  await tutorial.pause(500);
  await page
    .getByRole("option", { name: /virtual/i })
    .first()
    .click();
  await tutorial.pause(800);

  await tutorial.show(
    "Virtual repo form",
    "A virtual repository combines local and remote sources. Your teams use one URL and Artifact Keeper resolves packages from all sources in priority order.",
  );

  await dialog3.getByRole("button", { name: /create$/i }).click();
  await page.waitForLoadState("networkidle");
  await tutorial.pause(2000);
  await tutorial.step("Virtual repo created");

  // --- Wrap up ---
  await page.goto("/repositories");
  await page.waitForLoadState("networkidle");
  await tutorial.pause(1500);
  await tutorial.show(
    "All repos created",
    "We now have a local Maven repository, an NPM proxy, and an NPM virtual repository. In the next video, we will dive deeper into proxy configuration.",
  );

  await tutorial.finish();
});
```

**步骤 2：提交**

```bash
git add e2e/tutorials/02-create-repositories.tutorial.ts
git commit -m "feat: add Tutorial 02 - Creating Repositories"
```

---

### 任务 7：编写教程 03 - 代理设置

**文件：**

- 创建：`e2e/tutorials/03-proxy-setup.tutorial.ts`

**步骤 1：编写教程脚本**

```typescript
import { test } from "@playwright/test";
import { TutorialHelper } from "./fixtures/tutorial-helper";

test("Tutorial: Setting Up a Proxy Repository", async ({ page }) => {
  const tutorial = new TutorialHelper(page, {
    id: "03-proxy-setup",
    title: "Setting Up a Proxy Repository",
    description:
      "Configure an NPM proxy repository to cache packages from the public registry, reducing external downloads and improving build reliability.",
  });
  await tutorial.begin();

  // --- Chapter 1: Why Proxy ---
  tutorial.chapter("Why Use a Proxy Repository");

  await page.goto("/repositories");
  await page.waitForLoadState("networkidle");
  await tutorial.show(
    "Repositories overview",
    "A proxy repository sits between your builds and the public registry. It caches downloaded packages locally, so repeated installs are fast and your builds work even if the upstream goes down.",
  );

  // --- Chapter 2: Create NPM Proxy ---
  tutorial.chapter("Create the NPM Proxy");

  tutorial.narrate(
    "Let us set up an NPM proxy that caches packages from npmjs.org.",
  );
  await page
    .getByRole("button", { name: /create repository/i })
    .first()
    .click();
  await page.waitForTimeout(1000);

  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel(/key|name/i)
    .first()
    .fill("npmjs-cache");
  await tutorial.pause(800);

  const formatSelect = dialog
    .getByLabel(/format/i)
    .or(dialog.getByRole("combobox").first());
  await formatSelect.click();
  await tutorial.pause(500);
  await page.getByRole("option", { name: /npm/i }).first().click();
  await tutorial.pause(600);

  const typeSelect = dialog
    .getByLabel(/type/i)
    .or(dialog.getByRole("combobox").nth(1));
  await typeSelect.click();
  await tutorial.pause(500);
  await page
    .getByRole("option", { name: /remote/i })
    .first()
    .click();
  await tutorial.pause(600);

  const urlInput = dialog
    .getByLabel(/url|upstream/i)
    .or(dialog.getByPlaceholder(/url/i));
  await urlInput.fill("https://registry.npmjs.org");
  await tutorial.pause(800);

  await tutorial.show(
    "NPM proxy configuration",
    "Set the key, format, type to remote, and the upstream URL to https://registry.npmjs.org.",
  );

  await dialog.getByRole("button", { name: /create$/i }).click();
  await page.waitForLoadState("networkidle");
  await tutorial.pause(2000);
  await tutorial.step("NPM proxy created");

  // --- Chapter 3: Explore the Proxy ---
  tutorial.chapter("Exploring the Proxy");

  tutorial.narrate("Click on the proxy repository to see its details.");
  await page.goto("/repositories");
  await page.waitForLoadState("networkidle");
  await tutorial.pause(1000);

  // Click on the proxy repo
  await page
    .getByText("npmjs-cache")
    .or(page.getByText("npmjs-proxy"))
    .first()
    .click();
  await page.waitForLoadState("networkidle");
  await tutorial.pause(2000);
  await tutorial.show(
    "Proxy detail view",
    "The detail panel shows repository settings, cached packages, and download statistics.",
  );

  // --- Chapter 4: Using the Proxy ---
  tutorial.chapter("Configuring Your Client");

  tutorial.narrate(
    "To use this proxy, configure your npm client to point to the proxy URL shown in the repository details. Packages are cached on first download and served locally after that.",
  );
  await tutorial.pause(2000);
  await tutorial.step("Client configuration");

  tutorial.narrate(
    "That is all it takes to set up a proxy. Your builds now go through Artifact Keeper, giving you caching, security scanning, and a single point of control.",
  );
  await tutorial.pause(2000);

  await tutorial.finish();
});
```

**步骤 2：提交**

```bash
git add e2e/tutorials/03-proxy-setup.tutorial.ts
git commit -m "feat: add Tutorial 03 - Proxy Setup"
```

---

### 任务 8：编写教程 04 - 虚拟仓库

**文件：**

- 创建：`e2e/tutorials/04-virtual-repositories.tutorial.ts`

**步骤 1：编写教程脚本**

```typescript
import { test } from "@playwright/test";
import { TutorialHelper } from "./fixtures/tutorial-helper";

test("Tutorial: Virtual Repositories", async ({ page }) => {
  const tutorial = new TutorialHelper(page, {
    id: "04-virtual-repositories",
    title: "Virtual Repositories in Artifact Keeper",
    description:
      "Create a virtual repository that aggregates local and remote sources behind a single endpoint for your builds.",
  });
  await tutorial.begin();

  // --- Chapter 1: What are Virtual Repos ---
  tutorial.chapter("What Are Virtual Repositories");

  await page.goto("/repositories");
  await page.waitForLoadState("networkidle");
  await tutorial.show(
    "Repository list",
    "Virtual repositories give your teams a single URL that resolves packages from multiple sources. Local packages, proxied packages, and other virtual repos can all be combined.",
  );
  await tutorial.pause(1500);

  // --- Chapter 2: Prerequisites ---
  tutorial.chapter("Prerequisites");

  tutorial.narrate(
    "Before creating a virtual repository, you need at least one local and one remote repository of the same format. Let us check that we have NPM repositories ready.",
  );
  await tutorial.pause(1500);

  // Show existing repos
  const searchInput = page.getByPlaceholder(/search/i);
  await searchInput.fill("npm");
  await tutorial.pause(1500);
  await tutorial.show(
    "NPM repositories",
    "We can see our local NPM repository and NPM proxy are already set up.",
  );

  // Clear search
  await searchInput.clear();
  await tutorial.pause(800);

  // --- Chapter 3: Create the Virtual Repo ---
  tutorial.chapter("Create a Virtual Repository");

  tutorial.narrate(
    "Now let us create a virtual repository that combines both NPM sources.",
  );
  await page
    .getByRole("button", { name: /create repository/i })
    .first()
    .click();
  await page.waitForTimeout(1000);

  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel(/key|name/i)
    .first()
    .fill("npm-all");
  await tutorial.pause(800);

  const formatSelect = dialog
    .getByLabel(/format/i)
    .or(dialog.getByRole("combobox").first());
  await formatSelect.click();
  await tutorial.pause(500);
  await page.getByRole("option", { name: /npm/i }).first().click();
  await tutorial.pause(600);

  const typeSelect = dialog
    .getByLabel(/type/i)
    .or(dialog.getByRole("combobox").nth(1));
  await typeSelect.click();
  await tutorial.pause(500);
  await page
    .getByRole("option", { name: /virtual/i })
    .first()
    .click();
  await tutorial.pause(800);

  await tutorial.show(
    "Virtual repo form",
    "Set the type to virtual. The form will show options for adding source repositories.",
  );

  await dialog.getByRole("button", { name: /create$/i }).click();
  await page.waitForLoadState("networkidle");
  await tutorial.pause(2000);
  await tutorial.step("Virtual repo created");

  // --- Chapter 4: View the Virtual Repo ---
  tutorial.chapter("How Resolution Works");

  await page.goto("/repositories");
  await page.waitForLoadState("networkidle");
  await tutorial.pause(1000);

  await page
    .getByText("npm-all")
    .or(page.getByText("npm-virtual"))
    .first()
    .click();
  await page.waitForLoadState("networkidle");
  await tutorial.pause(2000);

  await tutorial.show(
    "Virtual repo details",
    "When a package is requested, Artifact Keeper checks local sources first, then falls back to remote proxies. This means your internal packages always take priority.",
  );

  tutorial.narrate(
    "Configure your npm client to use this virtual repository URL. Your teams do not need to know which packages are local and which come from the public registry. Artifact Keeper handles the routing.",
  );
  await tutorial.pause(2000);

  await tutorial.finish();
});
```

**步骤 2：提交**

```bash
git add e2e/tutorials/04-virtual-repositories.tutorial.ts
git commit -m "feat: add Tutorial 04 - Virtual Repositories"
```

---

### 任务 9：编写教程 05 - 安全与质量门禁

**文件：**

- 创建：`e2e/tutorials/05-security-quality-gates.tutorial.ts`

**步骤 1：编写教程脚本**

```typescript
import { test } from "@playwright/test";
import { TutorialHelper } from "./fixtures/tutorial-helper";

test("Tutorial: Security Scanning and Quality Gates", async ({ page }) => {
  const tutorial = new TutorialHelper(page, {
    id: "05-security-quality-gates",
    title: "Security Scanning and Quality Gates",
    description:
      "View vulnerability scan results, understand severity levels, and create quality gate policies to enforce security standards.",
  });
  await tutorial.begin();

  // --- Chapter 1: Security Dashboard ---
  tutorial.chapter("Security Dashboard");

  await page.goto("/security");
  await page.waitForLoadState("networkidle");
  await tutorial.pause(2000);

  await tutorial.show(
    "Security dashboard",
    "The Security dashboard shows a summary of vulnerabilities found across all your artifacts. Artifact Keeper integrates with Trivy to scan packages automatically on upload.",
  );

  tutorial.narrate(
    "Severity cards at the top show counts of critical, high, medium, and low vulnerabilities. The chart below tracks trends over time.",
  );
  await tutorial.pause(2000);
  await tutorial.step("Severity breakdown");

  // --- Chapter 2: Scan Results ---
  tutorial.chapter("Viewing Scan Results");

  tutorial.narrate(
    "Scroll down to see individual scan results for each artifact.",
  );
  await tutorial.pause(1500);
  await tutorial.step("Scan results table");

  // --- Chapter 3: Quality Gates ---
  tutorial.chapter("Quality Gates");

  await page.goto("/quality-gates");
  await page.waitForLoadState("networkidle");
  await tutorial.pause(2000);

  await tutorial.show(
    "Quality gates page",
    "Quality gates let you define policies that block or warn when artifacts fail security checks. This prevents vulnerable packages from reaching production.",
  );

  // Create a quality gate
  tutorial.narrate(
    "Let us create a quality gate that blocks artifacts with critical vulnerabilities.",
  );
  const createBtn = page
    .getByRole("button", { name: /new gate|create/i })
    .first();
  await createBtn.click();
  await page.waitForTimeout(1000);

  const dialog = page.getByRole("dialog");
  await tutorial.step("Quality gate form");

  // Fill in the form fields
  const nameInput = dialog.getByLabel(/name/i).first();
  await nameInput.fill("production-release-gate");
  await tutorial.pause(800);

  // Look for vulnerability threshold fields
  const criticalInput = dialog
    .getByLabel(/critical/i)
    .or(dialog.getByPlaceholder(/critical/i))
    .first();
  if (await criticalInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await criticalInput.fill("0");
    await tutorial.pause(600);
  }

  const highInput = dialog
    .getByLabel(/high/i)
    .or(dialog.getByPlaceholder(/high/i))
    .first();
  if (await highInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await highInput.fill("3");
    await tutorial.pause(600);
  }

  await tutorial.show(
    "Gate configured",
    "We set zero tolerance for critical issues and allow up to three high-severity findings. You can tune these thresholds to match your organization security posture.",
  );

  // Submit
  await dialog
    .getByRole("button", { name: /create|save/i })
    .first()
    .click();
  await page.waitForLoadState("networkidle");
  await tutorial.pause(2000);
  await tutorial.step("Quality gate created");

  // --- Chapter 4: How Gates Work ---
  tutorial.chapter("How Gates Work");

  tutorial.narrate(
    "When an artifact is uploaded, Artifact Keeper scans it and checks against your quality gates. If a gate fails, the artifact is blocked or flagged depending on the action you configured. This gives your security team confidence that nothing bypasses the checks.",
  );
  await tutorial.pause(3000);

  await tutorial.finish();
});
```

**步骤 2：提交**

```bash
git add e2e/tutorials/05-security-quality-gates.tutorial.ts
git commit -m "feat: add Tutorial 05 - Security and Quality Gates"
```

---

### 任务 10：编写教程 06 - 用户管理

**文件：**

- 创建：`e2e/tutorials/06-user-management.tutorial.ts`

**步骤 1：编写教程脚本**

```typescript
import { test } from "@playwright/test";
import { TutorialHelper } from "./fixtures/tutorial-helper";

test("Tutorial: User Management and Access Control", async ({ page }) => {
  const tutorial = new TutorialHelper(page, {
    id: "06-user-management",
    title: "User Management and Access Control",
    description:
      "Create users, organize them into groups, assign permissions, and generate API access tokens.",
  });
  await tutorial.begin();

  // --- Chapter 1: Users ---
  tutorial.chapter("Creating Users");

  await page.goto("/users");
  await page.waitForLoadState("networkidle");
  await tutorial.pause(1500);

  await tutorial.show(
    "Users page",
    "The Users page lists all accounts on your instance. Artifact Keeper supports local users, LDAP, and SSO authentication.",
  );

  tutorial.narrate("Let us create a new user for a developer on the team.");
  await page.getByRole("button", { name: /create user/i }).click();
  await page.waitForTimeout(1000);

  const userDialog = page.getByRole("dialog");
  await tutorial.step("Create user dialog");

  await userDialog
    .getByLabel(/username/i)
    .first()
    .fill("jane.smith");
  await tutorial.pause(600);
  await userDialog.getByLabel(/email/i).first().fill("jane.smith@example.com");
  await tutorial.pause(600);
  await userDialog
    .getByLabel(/display name/i)
    .or(userDialog.getByLabel(/name/i))
    .first()
    .fill("Jane Smith");
  await tutorial.pause(600);
  await userDialog
    .getByLabel(/password/i)
    .first()
    .fill("SecurePassword1!");
  await tutorial.pause(600);

  await tutorial.show(
    "User form filled",
    "Fill in the username, email, display name, and an initial password.",
  );

  await userDialog.getByRole("button", { name: /create$/i }).click();
  await page.waitForLoadState("networkidle");
  await tutorial.pause(2000);
  await tutorial.step("User created");

  // --- Chapter 2: Groups ---
  tutorial.chapter("Managing Groups");

  await page.goto("/groups");
  await page.waitForLoadState("networkidle");
  await tutorial.pause(1500);

  await tutorial.show(
    "Groups page",
    "Groups let you organize users into teams and assign permissions collectively instead of per-user.",
  );

  tutorial.narrate("Let us create a group for the platform engineering team.");
  await page.getByRole("button", { name: /create group/i }).click();
  await page.waitForTimeout(1000);

  const groupDialog = page.getByRole("dialog");
  await groupDialog.getByLabel(/name/i).first().fill("platform-engineering");
  await tutorial.pause(600);

  const descInput = groupDialog
    .getByLabel(/description/i)
    .or(groupDialog.getByPlaceholder(/description/i))
    .first();
  if (await descInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await descInput.fill("Platform engineering team with publish access");
    await tutorial.pause(600);
  }

  await tutorial.show(
    "Group form",
    "Give the group a name and optional description.",
  );

  await groupDialog.getByRole("button", { name: /create$/i }).click();
  await page.waitForLoadState("networkidle");
  await tutorial.pause(2000);
  await tutorial.step("Group created");

  // --- Chapter 3: Permissions ---
  tutorial.chapter("Assigning Permissions");

  await page.goto("/permissions");
  await page.waitForLoadState("networkidle");
  await tutorial.pause(1500);

  await tutorial.show(
    "Permissions page",
    "Permission rules control who can read, write, or admin specific repositories. You can target individual users or entire groups.",
  );

  tutorial.narrate(
    "You can create permission rules that grant groups access to specific repositories or repository patterns. This keeps access management scalable as your team grows.",
  );
  await tutorial.pause(2000);
  await tutorial.step("Permission rules");

  // --- Chapter 4: Access Tokens ---
  tutorial.chapter("API Access Tokens");

  await page.goto("/access-tokens");
  await page.waitForLoadState("networkidle");
  await tutorial.pause(1500);

  await tutorial.show(
    "Access tokens page",
    "Access tokens let users authenticate API calls and CI pipelines without using passwords.",
  );

  tutorial.narrate(
    "Users can create personal access tokens from their profile, or admins can create tokens for service accounts. Tokens can be scoped and have expiration dates.",
  );
  await tutorial.pause(2000);
  await tutorial.step("Token management");

  tutorial.narrate(
    "That wraps up user management. With users, groups, permissions, and tokens, you have fine-grained control over who can access what in your artifact registry.",
  );
  await tutorial.pause(2000);

  await tutorial.finish();
});
```

**步骤 2：提交**

```bash
git add e2e/tutorials/06-user-management.tutorial.ts
git commit -m "feat: add Tutorial 06 - User Management"
```

---

### 任务 11：创建 manifest 生成脚本

**文件：**

- 创建：`e2e/tutorials/scripts/generate-manifest.ts`

**步骤 1：编写 manifest 生成器**

```typescript
import * as fs from "fs";
import * as path from "path";

interface TutorialManifestEntry {
  id: string;
  title: string;
  description: string;
  chapters: { time: string; name: string }[];
  steps: { name: string; screenshot: string; time: string }[];
  thumbnailScreenshot: string | null;
}

interface CombinedManifest {
  generatedAt: string;
  tutorials: TutorialManifestEntry[];
}

function main() {
  const outputDir = path.join(__dirname, "..", "output");

  if (!fs.existsSync(outputDir)) {
    console.error("No output directory found. Run tutorial:record first.");
    process.exit(1);
  }

  const tutorials: TutorialManifestEntry[] = [];
  const entries = fs.readdirSync(outputDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = path.join(outputDir, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    tutorials.push(manifest);
  }

  // Sort by ID
  tutorials.sort((a, b) => a.id.localeCompare(b.id));

  const combined: CombinedManifest = {
    generatedAt: new Date().toISOString(),
    tutorials,
  };

  const outPath = path.join(outputDir, "manifest.json");
  fs.writeFileSync(outPath, JSON.stringify(combined, null, 2));
  console.log(
    `Generated combined manifest with ${tutorials.length} tutorials at ${outPath}`,
  );

  // Print a summary
  for (const t of tutorials) {
    console.log(
      `  ${t.id}: "${t.title}" (${t.chapters.length} chapters, ${t.steps.length} screenshots)`,
    );
  }
}

main();
```

**步骤 2：添加 npm 脚本**

添加到 `package.json` scripts：

```json
"tutorial:manifest": "npx tsx e2e/tutorials/scripts/generate-manifest.ts"
```

**步骤 3：提交**

```bash
git add e2e/tutorials/scripts/generate-manifest.ts package.json
git commit -m "feat: add combined manifest generator for tutorials"
```

---

### 任务 12：最终集成测试 - 列出所有教程并验证配置

**步骤 1：验证所有教程文件可加载**

```bash
cd /Users/khan/ak/artifact-keeper-web
npx playwright test --config playwright-tutorials.config.ts --list
```

预期：列出全部 6 个教程。

**步骤 2：包含所有文件的最终提交**

如果有遗漏的文件，请添加它们：

```bash
git add -A e2e/tutorials/ playwright-tutorials.config.ts
git status
git commit -m "chore: finalize tutorial recording infrastructure"
```
