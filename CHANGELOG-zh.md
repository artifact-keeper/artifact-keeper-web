# 变更日志

本项目所有值得记录的变更都将记录在此文件中。

格式遵循 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，
并且本项目遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。

## [Unreleased]

### Added

- **SSO 管理界面：将 SAML IdP 组映射到 Artifact Keeper 组** (#588，后端 artifact-keeper#2333 在 #2448 中实现) - SAML 提供商表单在创建与编辑时都新增了 **将 IdP 组映射到 Artifact Keeper 组** 开关，默认关闭，与 #534 的 OIDC 开关保持一致。开启后，`attribute_mapping.groups` 所指明的断言属性值（即同一表单上的 **组属性** 字段）会在登录时成为 Artifact Keeper 组成员资格：匹配的组会为该提供商自动创建，提供商未创建的组（包括同名的运维托管组）绝不会被复用，根据后端的归属守卫该成员资格会被拒绝，并且成员资格会在每次登录时重新对账，因此在 IdP 上从组中移除用户也会在此处移除成员资格。关闭时保持传统的角色映射行为。该标志通过 `POST /api/v1/admin/sso/saml` 与 `PUT /api/v1/admin/sso/saml/{id}` 发送，并通过 `SamlConfigResponse` 往返，因此编辑对话框会显示提供商已保存的设置，而不会重置为默认值。早于该字段的后端由 SAML 响应适配器中的防御性 `false` 回退处理，与现有的 `use_absolute_acs_url` 处理方式一致。
- **仓库去重存储用量面板** (#593，后端史诗 artifact-keeper#2056) - 仓库详情视图新增 **存储** 面板，报告真实的、感知去重的占用，而不再只有粗略的逻辑 `storage_used_bytes`：逻辑 vs 物理字节、去重比率与节省量（字节 + 百分比）、唯一 vs 共享的堆叠条、`dedup_scope` 标签（`per_repo` / `instance`）并附内联说明（实例级数字反映的是整个实例范围内合并的 blob），以及 `computed_at` 新鲜度（悬停查看精确时间戳）。管理员还能看到实例级的 `instance_unique_bytes` 总量，以及按需的 **"当前可回收量"** 估算（一次 `storage-gc` 干跑 —— 不会删除任何内容）。**安全（后端 artifact-keeper#2560）：** 在 `instance` 作用域的后端上，对于非管理员查看者，后端会省略 `physical_bytes`/`unique_bytes`/`shared_bytes`/`dedup_ratio`，因此面板会优雅降级 —— 实例作用域下的非管理员只能看到逻辑大小 + blob 数量，外加一条"详细分解仅限管理员"的说明；描述性的共享字节文案、实例总量与可回收估算在服务端与 UI 两端都对管理员做了门控。按仓库的端点尚不在生成的 SDK 中（v1.5.0 只发布实例级的 `/admin/analytics/storage/breakdown` + `/admin/storage-gc`），因此 `src/lib/api/storage.ts` 使用共享的 `apiFetch` 包装器（与 routing-rules / audit / downloads 相同的模式）；如果端点不可用，面板回退到仓库的逻辑 `storage_used_bytes`。文件夹/路径树的存储汇总（史诗子任务 4）此处有意不纳入范围。
- **CVE 爆炸半径视图** (#570) - 新增 `/security/blast-radius` 管理页面，展示后端 #2364 添加的爆炸半径端点（`GET /api/v1/admin/security/cve/{cve_id}/blast-radius`、`/security/artifact/{artifact_id}/blast-radius`）：给定一个 CVE/GHSA id 或制品 id，显示 **谁暴露在其中**。汇总磁贴（受影响的制品、受影响的仓库、不同下载者、不同 IP、总下载量）外加一个"存在匿名下载"徽章；一个 **受影响仓库** 表格，对每个仓库的可达性进行分类，并醒目地标记 `access_scope=public` 为"公开 —— 人人暴露"（相对于受限 ACL / 受限角色）；以及一个分页的 **下载者** 表格（用户名或 'anonymous'、下载次数、不同 IP 的分布并带示例预览、首次/末次下载），使用服务端 page/per_page 分页（默认 20，按后端上限最大 100）。目标 id 在客户端校验（CVE/GHSA 格式、制品 UUID），CVE id 会规范化为标准大小写。可通过 `?cve=` / `?artifact=` 深链，扫描详情页上的扫描发现咨询单元格现在带有指向该报告的十字准线钻取链接。安全导航组中新增"爆炸半径"条目。这些端点尚不在生成的 SDK 中，因此 `src/lib/api/blast-radius.ts` 使用共享的 `apiFetch` 包装器，并在信任边界进行 zod 校验（与 audit 和 downloads 相同的模式）；在没有这些端点的后端上，页面会降级为"不可用"警报。
- **通用制品版本历史 UI** (#571) - 展示后端 #2367 为 Generic/Mlmodel 仓库新增的一等版本能力（`GET /api/v1/repositories/{key}/versions/{path}`、下载/元数据路由上的 `?version=<rev|label|latest>`，以及按仓库的 `versioning_enabled` 标志）。在仓库制品浏览器中，制品详情对话框新增 **版本** 标签页 —— 存储修订版本表格（带"最新"徽章的修订号、可选的版本标签、大小、带复制的短 SHA-256、后端提供时的上传者，以及存储日期），支持 **按修订版本下载**，通过 `?version=<revision>` 固定到精确的已存字节（在按版本选择的 URL 上组合一个下载票据）。该标签页只对选择启用版本且其格式参与（Generic/Mlmodel）的仓库出现；没有记录历史的制品会渲染一个安静的空白状态，正常的单制品下载保持不变，因此现有（非版本化）仓库不受影响。仓库 **设置** 标签页新增 **制品版本控制** 一节，带"启用版本控制"开关（仅 Generic/Mlmodel），通过现有的更新仓库端点写入 `versioning_enabled`。这些端点尚不在生成的 SDK 中，因此 `src/lib/api/versions.ts` 使用共享的 `apiFetch` 包装器，并在信任边界进行 zod 校验（与 audit/downloads 相同的模式），将后端在无历史时的 404 规范化为空列表，`repositoriesApi` 在 SDK 重新生成前通过收窄的转型读写 `versioning_enabled`。新增 `ArtifactVersionsPage` e2e 页面对象 + `artifact-version-history.spec.ts`（API 契约：最新在前列表、`?version=` 固定旧字节、`versioning_enabled` 往返；尽力而为的管理 UI 检查），并为 e2e 技术栈预置了一个 `versioning_enabled: true` 的通用仓库。**后端缺口：** `/versions` 响应尚未序列化 `uploaded_by`（该列已存在于 `artifact_versions` 上），因此上传者列在后端补齐之前保持隐藏 —— UI 已防御性地打通了该字段。
- **下载归属与网络拓扑仪表盘** (#569) - 新增 `/downloads` 管理页面，展示后端 #2365 添加的下载归属端点（`GET /api/v1/admin/downloads`、`/downloads/by-ip/{ip}`、`/downloads/by-user/{user_id}`）。针对归属下载事件的三个视图：**事件**（分页表格：时间、用户 —— 未认证时为 'anonymous'、客户端 IP、制品、用户代理）、**按 IP / 子网**（网络拓扑分组：每个客户端 IP 的下载量、不同用户、不同制品，以及最近活动及其 /24 或 /64 子网）、**按用户**（每个用户的活动及不同 IP 分布）。分组视图在客户端对最近匹配的事件进行聚合（后端返回行而不是聚合），并在样本被截断时注明；每个分组行可钻取回筛选后的事件视图。筛选器：制品 id 与用户 id（客户端校验 UUID）、精确客户端 IP、包含式日期范围，外加服务端 page/per_page 分页（默认 20，按后端上限最大 100）。排他性的 IP 或用户筛选会路由到专用的 by-ip/by-user 端点。运维导航组中新增"下载"条目。这些端点尚不在生成的 SDK 中，因此 `src/lib/api/downloads.ts` 使用共享的 `apiFetch` 包装器，并在信任边界进行 zod 校验（与 rate-limits 和 audit 相同的模式）；在没有这些端点的后端上，页面会降级为"不可用"警报。
- **管理审计日志查看器** (#568) - 新增 `/audit` 管理页面，展示后端审计日志查询端点（`GET /api/v1/admin/audit`，后端 #2366）。已记录事件的表格（时间、操作者、动作、资源、IP、详情），支持按动作、资源类型、操作者用户 id（客户端校验 UUID）与包含式日期范围筛选，外加服务端 page/per_page 分页（默认 50，按后端上限最大 200）。由于审计响应只携带 id，操作者用户 id 通过管理用户列表在客户端解析为用户名。管理导航组中新增"审计日志"条目。该端点尚不在生成的 SDK 中，因此 `src/lib/api/audit.ts` 使用共享的 `apiFetch` 包装器，并在信任边界进行 zod 校验（与 rate-limits 相同的模式）；在没有该端点的后端上，页面会降级为"不可用"警报。
- **SSO 管理界面：展示 SAML `use_absolute_acs_url` 选择启用** (#521) - 回填后端（迁移 139）添加但管理界面从未展示的按提供商开关（"步调一致欠债"）。SAML 提供商表单在"签名请求 / 要求签名断言"组中新增 **使用绝对 ACS URL** 开关，适用于拒绝相对 AssertionConsumerServiceURL 的更严格 SAML 2.0 IdP（例如飞书 AnyCross）。默认关闭（pre-138 线上格式），取自加载的配置，并在创建与更新时回显。`src/types/sso.ts` 与 `adaptSamlConfig` 适配器以防御性的 `false` 默认值传播该字段，因此 UI 可以安全地部署在早于该列的后端之上。（姊妹 OIDC `allow_legacy_rsa_keys` 开关 #522 推迟到 v1.4.0，以便与其仍在进行中的后端 PR 保持同步。）
- **`release/1.1.x` 维护分支 + `:1.1-dev` Docker 标签规则** (#331) - 镜像 `artifact-keeper#890`；推送到 `release/1.1.x` 现在会发布 `ghcr.io/artifact-keeper/artifact-keeper-web:1.1-dev`，以便 v1.1.x 发布门禁可以测试真正的 v1.1.x web/backend 组合。

### Changed

- **类型安全 API 层——将 #206 加固扩展到 sso（最后一批）** (#359 批次 9) - 用适配器函数与 `assertData` 守卫替换了 `src/lib/api/sso.ts` 中全部 30 处 `as never` 转型。7 个读适配器（SsoProvider / OidcConfig / LdapConfig / SamlConfig / LdapTestResult / TokenPair）与 6 个写适配器覆盖 OIDC/LDAP/SAML 的创建+更新请求形态。通过 `narrowEnum` 将提供商类型收窄为本地 `oidc | ldap | saml` 联合。SDK 将 attribute_mapping 值声明为 `unknown`，而本地类型将其声明为 string；适配器防御性地强制转换非字符串。`ldapLogin` 在运行时收窄 SDK 的 `unknown` 200 响应，以提取 access/refresh 令牌对。完整关闭 #359。
- **类型安全 API 层——将 #206 加固扩展到 security** (#359 批次 8) - 用适配器函数与 `assertData` 守卫替换了 `src/lib/api/security.ts` 中全部 25 处 `as never` 转型。9 个读适配器（Dashboard / Score / Scan / ScanList / Finding / FindingList / Policy / ScanConfig / RepoSecurity / TriggerScanResponse）与 4 个写适配器（TriggerRequest / CreatePolicyRequest / UpdatePolicyRequest / UpsertScanConfigRequest）。由于 SDK 的 ScoreResponse 不直接暴露 `total_findings`，Score 适配器从严重级别计数合成它。SDK 的 PolicyResponse 具有本地 ScanPolicy 未建模的额外字段（`max_artifact_age_days`、`min_staging_hours`、`require_signature`），适配器有意丢弃这些字段 —— 它们由生命周期模块而非 security 消费。
- **类型安全 API 层——将 #206 加固扩展到 promotion** (#359 批次 7) - 用适配器函数、`assertData` 守卫，以及针对 `severity`（`critical`/`high`/`medium`/`low`/`info`）与 `PromotionHistoryStatus`（`promoted`/`rejected`/`pending_approval`）的 `narrowEnum`，替换了 `src/lib/api/promotion.ts` 中 10 处 `as never` 转型中的 9 处。`policy_result` 保留一处内联的 `as unknown as`（SDK 将该字段暴露为不透明的键值包，本地类型声明为类型化的 `PolicyEvaluationResult`，消费者只做惰性访问 —— 桥接已文档化）。同时从 `artifacts.ts` 导出 `adaptArtifact` / `adaptArtifactList`，从 `repositories.ts` 导出 `adaptRepository` / `adaptRepositoryList`，以便 promotion 复用它们而不是重新实现。
- **类型安全 API 层——将 #206 加固扩展到 dependency-track** (#359 批次 6) - 用适配器函数与 `assertData` 守卫替换了 `src/lib/api/dependency-track.ts` 中全部 12 处 `as never` 转型。SDK 将 `DtProjectMetrics` / `DtPortfolioMetrics` 上的每个指标计数器都声明为可选；本地类型将其声明为必填 `: number`。适配器将 undefined → 0 强制转换，因此空的后端响应会在指标卡片中渲染为数字零而不是 "undefined"。`DtFinding` 的嵌套适配器（component / vulnerability / analysis / attribution / cwe / license）保留现有的渲染行为。
- **类型安全 API 层——将 #206 加固扩展到 sbom** (#359 批次 5) - 用适配器函数、`assertData` 守卫，以及为需要类型化状态的调用方导出的 `narrowCveStatus` / `narrowPolicyAction` 辅助函数，替换了 `src/lib/api/sbom.ts` 中全部 21 处 `as never` 转型。多处 SDK 形态不匹配现在明确且已文档化：`LicenseCheckResult` 是合成的（SDK 返回 `violations: string[]` 而无 `action`；适配器强制转换为 `{license, reason}` 行，并从 `compliant` 推导 `action: "block"|"allow"`）；`getByArtifact` 不再接受 `format` 查询参数（SDK 没有该查询，后端在 #359 之前也忽略了它）。目前没有应用消费者使用这些端点，因此该合成是尽力而为并在内联文档说明。其他端点（generate/list/get/getComponents/convert/getCveHistory/updateCveStatus/getCveTrends/list-get-upsert-deletePolicy）往返页面不变。
- **类型安全 API 层——将 #206 加固扩展到 replication** (#359 批次 4) - 用适配器函数、`assertData` 守卫，以及针对 `PeerStatus` 联合的 `narrowEnum`，替换了 `src/lib/api/replication.ts` 中全部 11 处 `as never` 转型。从 `PeerInstance` 中移除三个死字段（`api_key`/`sync_filter`/`updated_at`），从 `PeerConnection` 中移除一个（`source_peer_id`）—— 这四个字段都在本地类型上声明过，但 SDK 从未填充、任何消费者也从未读取（已通过 grep 验证）。对等实例列表与连接表渲染不变。
- **类型安全 API 层——将 #206 加固扩展到 telemetry** (#359 批次 3) - 用适配器函数、`assertData` 守卫与显式请求体转发，替换了 `src/lib/api/telemetry.ts` 中全部 9 处 `as never` 转型。CrashReport 的可选+可空字段（`stack_trace`、`os_info`、`uptime_seconds`、`submitted_at`、`submission_error`）现在将 undefined 规范化为 null。消费该 API 的页面不变。
- **类型安全 API 层——将 #206 加固扩展到 webhooks + analytics** (#359 批次 2) - 用适配器函数、`assertData` 守卫，以及针对 `WebhookEvent` 字符串到联合收窄的 `narrowEnum`，替换了 `src/lib/api/webhooks.ts` 中全部 9 处与 `src/lib/api/analytics.ts` 中全部 11 处 `as never` 转型。web 尚未建模的 Webhook 事件现在回退为 `artifact_uploaded` 并输出控制台警告，而不是让期望已知事件的渲染代码崩溃。消费这些 API 的页面不变。
- **类型安全 API 层——将 #206 加固扩展到 monitoring + lifecycle** (#359 批次 1) - 用适配器函数与 `assertData` 守卫替换了 `src/lib/api/monitoring.ts` 与 `src/lib/api/lifecycle.ts` 中所有 `as never` 转型。适配器将 SDK 的 `?: string | null`（可选+可空）形态规范化为本地类型的 `: string | null`（必填+可空）形态，使调用方看到稳定的契约。`lifecycle.ts` 中保留两处 `as unknown as` 转型并加内联注释：SDK 错误地将 `createLifecyclePolicy` / `updateLifecyclePolicy` 请求体类型化为安全策略请求形态而非生命周期请求形态 —— 待生成器针对修正后的 OpenAPI 规范重建后移除。消费这些 API 的页面不变。
- **管理设置页现在只发一次 HTTP 调用而不是三次** (#349) - 该页面过去通过三个独立的 `useQuery` hooks 调用 `/api/v1/admin/settings` 三次（分别为 `password-policy`、`storage-settings`、`smtp-config`）。替换为基于新的 `settingsApi.getAllSettings()` 与 `useAdminSettings()` hook 的单一 `admin-settings` 查询。SMTP 标签页消费同一个 hook，因此 react-query 会去重。为页面外消费者（例如内联的 `PasswordPolicyHint`）保留公共的逐 getter API（`getPasswordPolicy` / `getStorageSettings` / `getSmtpConfig`）。设置页网络往返次数减少 67%。**行为说明**：由于是单一共享查询，响应中某一段畸形（例如 SMTP 字段错误）现在会使整个捆绑失败 —— 存储与密码策略行会与 SMTP 错误一起显示"不可用"，即使它们的字段解析正常。PR 之前它们会独立解析。这一权衡可以接受，因为三个段来自同一个端点，畸形捆绑几乎总是后端全局问题；按段隔离故障已作为后续问题提交。
- **`toUserMessage` 将用户不可信的报错文本截断到 240 字符** (#356) - 防止 50KB 的堆栈跟踪或 HTML 500 页面在 toast 中渲染为一整墙文本。截断的输出以 `… [truncated, <n> more chars]` 结尾，明确消息已被裁剪。作者可控的回退字符串不会被截断。
- **`toUserMessage` 为回退文本加 HTTP 状态码前缀** (#355) - 当错误携带 HTTP 状态（`.status` / `.statusCode` / `.body.status`）但响应体没有有用消息时，回退文本现在显示 "(HTTP 409) Failed to create permission" 而不是仅 "Failed to create permission"，以便在 toast 文本中区分 409 Conflict 与 500 Internal Server Error。后端提供的消息保持不变（不重复装饰）。关闭 #207 中推迟的一半。
- **提取 `mutationErrorToast` 辅助函数以去重约 125 处变更 `onError` 调用点** (#354) - `onError: (err) => toast.error(toUserMessage(err, "Failed to <action>"))` 模式在大多数页面重复出现；在 36 个文件中折叠为 `onError: mutationErrorToast("Failed to <action>")`（-145 行）。将未来的调整（HTTP 状态前缀、截断、遥测）集中到一处。用户可见的 toast 字符串不变。
- **类型安全 API 层——用适配器与 zod 替换双重转型** (#206) - 移除了 15 个 `src/lib/api/*.ts` 文件中所有 `as unknown as T` 与 `as never` 转型。每次 SDK 调用现在都经过适配器函数或基于 Set 的收窄辅助函数，后者会在遇到未知枚举值时发出警告。`assertData`（`fetch.ts` 中新增）以带上下文的错误拒绝空响应体。`settings.ts` 在 `getPasswordPolicy`/`getSmtpConfig` 的信任边界使用 zod `.safeParse()`。公共 `xxxApi` 返回类型不变，因此消费者代码不受影响。

### Fixed

- **UI 报告了错误的版本：web 1.8.0 显示自己是 "Web 1.7.0"** (#784) - `package.json` 未随 1.8.0 发布而升级，因此已发布的 1.8.0 镜像在应用自述版本的每一处都宣传了上一个版本：侧边栏的 Web/Server 对、管理设置页，以及 `GET /api/version`。针对已发布镜像而非推断进行确认 —— `ghcr.io/artifact-keeper/artifact-keeper-web:1.8.0` 中的客户端 bundle 在侧边栏渲染处带有字面量 `"1.7.0"`，并且完全不含 `1.8.0` 的任何出现。显示版本是用户在不报报告中引用的内容，也是运维判断某个修复是否已落地所检查的内容，因此 1.8.0 中发布的一切都可能被误诊为缺失，并把调查引向错误的变更日志。注意 `APP_VERSION` 构建参数**没有**掩盖这一点，也不可能：CI 将 git 标签的 `APP_VERSION=v1.8.0` 传入 `ENV NEXT_PUBLIC_APP_VERSION`，但 `next.config.ts` 将同一变量字面设置为 `pkg.version`，且这一显式配置值胜出，因此无论镜像如何构建，`package.json` 都是显示版本的唯一来源。`package.json`（以及两个匹配的 `package-lock.json` 条目）现在为 1.8.0，且 `scripts/assert-version-matches-tag.sh` 已接入 `docker-publish.yml` 与 `release.yml`，因此标签与 `package.json` 不一致时会在镜像发布或 Release 创建之前失败。权衡：该门禁在打标签时运行，因此它阻止的是发布不匹配的版本，而非阻止不匹配进入 `main` —— 更早捕获意味着要在 `main` 上决定下一个版本是什么，而本仓库刻意不做这件事。
- **视觉回归 CI 现在与基线比较，而不是静默重写基线** (#781) - `E2E Visual Regression` 任务以 `--update-snapshots` 运行测试套件，这会用页面当前渲染的任何内容覆盖每个基线而不是比较，因此无论改了什么该任务都报告成功，捕获到的回归为零。雪上加霜的是，全部 31 个已提交的基线都是 `*-darwin.png`，而 CI 在 `ubuntu-latest` 上运行并查找 `*-linux.png`，因此即使没有该标志，该任务也会在每次运行时从零生成所有基线。CI 调用现在去掉 `--update-snapshots` 并真正进行比较；31 个基线重新生成为 Linux 镜像（在与 CI 相同的 `ubuntu-latest` runner 上捕获，因此字体渲染一致）并提交，同时删除未经验证的 darwin 基线，并加一条 `.gitignore` 规则防止错误平台的镜像再次进入。基线刷新移入一个手动触发的 **Update Visual Baselines** 工作流，该工作流重新生成 Linux 基线并提交回被审阅的分支 —— 因此有意的 UI 改动会有意地更新它们，镜像差异在提交中可见，而不是每次构建都抹掉证据。由于这些基线以前从未真正比较过，首次比较运行可能会暴露真实存在的既有视觉问题。
- **本地管理员凭据表单现在在运维允许的情况下出现在 SSO 下** (#615，后端 artifact-keeper#2621/#2729) - 配置了 OIDC 或 SAML 提供商且无 LDAP 时，登录页无条件隐藏用户名/密码表单。已启用 `ALLOW_LOCAL_ADMIN_LOGIN` 用于应急访问的运维人员没有可输入的内容，`/login?fallback=local` 是找回表单的唯一途径。该检查是在后端公布真实策略之前写的一个临时启发式（无 LDAP + 存在重定向提供商意味着这些字段没有消费者）。页面现在读取 `GET /api/v1/system/config` 中的 `auth.local_login_enabled`，这是后端对是否应提供该表单的官方回答：未启用任何 SSO 提供商时为 true，SSO 下仅在运维设置 `ALLOW_LOCAL_ADMIN_LOGIN` 且未设置 `SSO_DISABLE_ADMIN_BREAK_GLASS` 时为 true。该标志刻意比登录端点的门禁更窄，因为已认证管理员默认保留一条未公开的应急密码路径（后端 #443），因此 `?fallback=local` 作为受支持的管理员恢复路由保持开启，而不是作为遗留物。LDAP 不受影响：已启用的 LDAP 提供商无论该标志如何都会显示表单，首次设置同样如此。早于该标志的后端会省略该字段，因此 `parseSystemConfig` 将其默认为 `true`，而不是隐藏这些部署唯一拥有的表单。表单决策现在除了 SSO 提供商列表外，还会等待系统配置查询，因此加载时不会闪现又消失表单，`?fallback=local` 绕过该等待，因此挂起的请求不会让页面停留在 spinner 上。
- **公共系统配置不再因未认证调用者而解析失败** (#615，后端 artifact-keeper#1960) - `parseSystemConfig` 要求 `scanners`、`search_engine`、`storage_backend` 与 `permissions`，但后端将四个字段都设为仅管理员：匿名与非管理员调用者的响应中完全省略这些字段，以免暴露实例的安全态势被指纹识别。因此每次匿名获取 `GET /api/v1/system/config` 都会抛错、查询失败，消费者静默回退到 `DEFAULT_SYSTEM_CONFIG`。登录页按定义是匿名调用者，因此它从未见过真实配置，也就无法遵守 `auth.local_login_enabled`。这四个字段现在在缺失时回退到文档化的默认值，因此负载中公共安全的部分（认证提供商、上传限制、访客访问、演示模式）能够解析并到达 UI。请求还携带 10 秒超时：`apiFetch` 不设任何超时，而登录页用该查询阻塞其表单决策，因此一个挂起而非失败的请求会显示永久 spinner。
- **一个很长的制品文件名把制品表推出详情面板，无法触及** (#768) - 单个制品文件名足够长时，会把扁平制品表加宽到仓库详情面板之外，且溢出无法滚动到：Size、Downloads、Created 以及每行的 Details/Download 操作被裁剪且没有水平滚动条，滚轮/触控板/键盘都够不到。Name 是唯一没有宽度约束的宽列 —— 旁边的 Path 已用 `max-w-[200px] truncate` 限制 —— 由于两个表格原语都强制 `whitespace-nowrap`，没有任何换行，该列占了页面上最长文件名的完整渲染宽度。这个宽度随后逃出了表格：面板的 `ScrollArea` 视口用 `display: table`（收缩适应，下限 100%）为其内容定尺寸，而 Radix 从挂载的滚动条推导视口的溢出，因此只渲染垂直 `ScrollBar` 时它永久是 `overflow-x: hidden`。多余宽度因此作用于整个详情列 —— 也顶开了表格上方卡片中右对齐的控件，例如存储卡的"估算"按钮 —— 然后被裁剪。名称单元格现在通过新的 `MiddleEllipsis` 组件在**中间**而不是末尾被限制并省略：制品名称按其尾部区分的频率与其头部相同（`…-tlsconsul` vs `…-tlsconsul-docker`、版本与变体后缀、文件扩展名），因此末尾截断会让这类行视觉上完全相同。CSS `text-overflow` 只能省略末尾，因此该值被拆分为一个收缩并截断的头部，以及一个用 `shrink-0` 固定的尾部，使结果保持宽度响应，而不是针对布局前未知宽度的容器猜测字符数。完整名称仍可通过原生 tooltip 与详情对话框获得，且 DOM 文本内容保持完整，因此名称仍可选择、可复制，并会被屏幕阅读器正确朗读。影响所有渲染扁平表格的格式（generic、npm 及其余）；maven/gradle/docker 默认为已经截断的分组卡片视图。注意底层 `overflow-x: hidden` 陷阱在每个 `ScrollArea` 调用点仍然存在 —— 这只是移除了触发它的输入，而不是陷阱本身。
- **制品列表分页报告的总量随页码增长** (#767) - 仓库制品列表下的分页栏在第 1 页显示 `1-20 of 21`，第 2 页 `21-40 of 41`，第 3 页 `41-60 of 61`，无论仓库实际持有多少内容，旁边的 `Page 1 of 2` / `Page 2 of 3` 同样语无伦次。`DataTablePagination` 中的算术是正确的；交给它的数字从来不是总量。键集分页列表（后端 artifact-keeper#2520 / #2519 / #2518）刻意避免在每次页面请求时对整个目录做 `COUNT`，因此 `pagination.total` 默认为一个廉价下界 —— `offset + rows + has_more` —— 以 `has_more` 作为权威的下一页信号，精确计数通过 `?count=exact` 选择启用，而 web 客户端从不发送该参数。由于分页栏同时从 `total` 推导**范围标签**与 `totalPages`，那个单一的下界值就产生了两种症状。`ListArtifactsParams` 新增 `count?: 'exact'`，在 `buildArtifactsListPath` 中转发（`listGrouped` 手工构建其查询字符串，因为 SDK 不建模 `group_by`，并在穿通之前静默丢弃新参数），仓库内容查询现在选择启用。无需后端改动 —— `?count=exact` 已存在并在处理程序的每个分支上生效（扁平托管、虚拟、远程缓存、`group_by=maven_component` 用于托管与远程、`group_by=docker_tag`）。一个查询同时供给扁平表格、Maven 组件列表与 Docker 标签列表，因此三个视图一起被修复。这会在每次页面加载多花一次 `COUNT` 查询，而这正是 artifact-keeper#2520 想要避免的；此处接受它，因为该界面渲染总量**和**页数，所以它确实需要一个真实的数字。只需要"是否有下一页"的列表应保持不设置 `count` 并读取 `has_more`。
- **npm 虚拟仓库可以再次创建；npm 远程不再静默阻止非作用域包** (#745) - 创建对话框为 `virtual` 仓库提供了 npm 作用域策略区域，并总是把 `npm_allowed_scopes` / `npm_allowed_name_patterns` / `npm_allow_unscoped` 附加到请求，即使运维从未碰过它。后端门禁基于**存在性**（`[]` 反序列化为 `Some([])`，`false` 为 `Some(false)`），因此**每次** npm 虚拟创建都失败并报 `Validation error: npm scope policy is only configurable on remote (proxy) repositories`，没有仓库被创建。该策略存储在每个 Remote *成员*上并从其上读取 —— npm 虚拟解析器在候选选择期间会咨询成员策略（后端 artifact-keeper#2327/#2424）—— 因此 `hasNpmScopePolicy` 现在只对 npm **remote** 返回 true，声称两种类型都符合的误导性注释也已修正。第二个且更糟的一半：存储的 `allow_unscoped: false` 使策略 `is_active()`，而激活的策略拒绝每个非作用域名称，因此通过 UI 创建 npm **proxy** 且不动该区域时，会静默阻止裸包名（`react`、`lodash`、`express`），尽管表单自己的提示写着"留空则仓库不受作用域限制"。创建时提交现在由新的 `hasNpmScopePolicyInput` 谓词门控，因此未触碰的区域不会发送任何内容，后端的允许全部默认值得以保留。`buildNpmScopePolicyFields` 仍无条件发出每个键 —— 正是这一点让设置标签页可以**清空**已存储的允许列表，而设置标签页保留自己"已更改 vs 已存储"的门禁。
- **OIDC 声明配置键现在与后端的 `<field>_claim` 模式一致** (#516) - OIDC 提供商表单将声明覆盖写入 `attribute_mapping` 下的裸键 `username` / `email` / `groups`（外加 `display_name`），但后端（`sso.rs::resolve_oidc_claim_name`）只读取 `username_claim` / `email_claim` / `groups_claim`，因此每个配置的 OIDC 声明覆盖都被静默忽略 —— 无论运维输入什么，登录都回退到内置默认。`handleSubmit` 现在写入 `_claim` 后缀的键（`display_name_claim` 也是，为保持对称，尽管后端尚未消费它），并在保存时从 JSONB blob 中丢弃旧的裸键。编辑对话框读取新键并回退到旧键，因此修复前 UI 保存的提供商仍会显示其配置的声明名。无关的 `attribute_mapping` 键仍可往返（保留回归 #406）。
- **将 SSE EVENT_TYPE_MAP 扩展到 webhook/artifact/scan/backup/plugin 事件** (#213) - 按域映射只覆盖了 7 个域（users、groups、repositories、service accounts、permissions、quality gates、dashboard）。当后端事件针对缺失的域通过 SSE 触发时，UI 不会重新获取过期数据 —— 运维必须硬刷新。新增 5 个 QUERY_KEYS（`WEBHOOKS`、`WEBHOOK_DELIVERIES`、`BACKUPS`、`SECURITY`、`PLUGINS`）、4 个 INVALIDATION_GROUPS（`webhooks`、`backups`、`security`、`plugins`）与 19 个新事件类型条目（`webhook.{created,updated,deleted,delivery}`、`artifact.{uploaded,deleted}`、`scan.{started,completed,failed}`、`finding.{acknowledged,acknowledgment_revoked}`、`backup.{created,completed,failed,restored}`、`plugin.{installed,uninstalled,enabled,disabled}`）。映射规模从 20 增至 39。
- **设置指南：为 Gradle/SBT 属性名净化仓库键 + 更清晰的 SSR 占位符** (#362，部分) - Gradle 凭据片段对带连字符的仓库键发出诸如 `my-jvm-repoUsername` 的属性名；在 `gradle.properties` 中技术上合法，但期望标识符规则的读者看起来像是坏了。新增 `repoKeyToGradleId` 辅助函数，将 kebab/点/下划线分隔符转换为驼峰，并剥离其余非字母数字字符。URL 与 `<id>` 槽保留原始键 —— 只有属性名被净化。同时将 SSR 回退的 `https://artifacts.example.com` 替换为 `__REPLACE_WITH_REGISTRY_URL__`，使预渲染的 HTML 不会携带一个用户可能误复制的看似真实的域名。剩余的 `repo_type`（proxy/virtual 隐藏发布步骤）与 `is_public`（匿名模式）修复推迟到后续。
- **按制品的 Security 标签页现在展示原生 scan_findings** (#368) - 仓库视图上的 Security 标签页（`security-tab-content.tsx`）过去只显示 SBOM CVE 历史与 Dependency-Track 发现，从不显示原生 `scan_findings` 表格。通过 `POST /api/v1/security/scan` 为特定制品触发扫描的用户无法在制品自己的页面上看到结果发现 —— 他们必须导航到 `/security/scans`，按名称+时间戳找到正确的扫描 id。新的 `ArtifactScansSection` 组件列出该制品的最近 scan_results 行（状态 / 类型 / 计数 / completed_at），并带一个指向按扫描页面的"查看发现"链接。数据来自 `securityApi.listArtifactScans(artifact.id)`，该接口早已存在但一直没有消费者。
- **`getInstallCommand` 返回 Gradle/SBT 原生片段而不是 Maven XML** (#361) - `package-utils.ts` 中的 JVM 分支对 `maven` / `gradle` / `sbt` 三种情况都返回相同的 `<dependency>` XML。浏览 Gradle 命名仓库的用户在包详情 / 复制片段 UI 中看到 Maven XML —— 与 #333 在设置指南页修复的 bug 同类。现在 `gradle` 返回 `implementation 'GROUP:name:version'`，`sbt` 返回 `libraryDependencies += "GROUP" % "name" % "version"`。Maven 输出不变。
- **`getPasswordPolicy` 与 `getSmtpConfig` 暴露加载失败，而不是静默回退到默认值** (#347) - 两个 getter 过去捕获任何 SDK 错误或模式不匹配并返回内置默认值，因此后端故障会在管理设置页渲染为看起来合理的占位值（与 #334 相同的失败模式）。现在 getter 在 SDK 错误 / 响应不可解析时抛出，页面渲染明确的"不可用"状态（密码策略行 + SMTP 标签页错误警报），让运维人员能看出确实有问题。
- **`formatBytes` 对 NaN/Infinity/负数输入返回 "--"** (#348) - 之前这些输入产生诸如 "NaN undefined" 或 "Infinity undefined" 的无意义字符串，显示在管理设置 → 存储标签页上。现在返回与其他地方（包/搜索渲染路径）已经使用的相同 `--` 哨兵。同时为 >TB 的值夹紧单位索引，使多 PB 的字节数渲染为 "<n> TB" 而不是索引越过单位表。
- **SSO 登录按钮读作 "Sign in with SSO" 而不是 "default" 之类的通用提供商名** (#351) - 当管理员的 SSO 提供商名为 `default` / `primary` / `main` / `sso`（或为空/空白）时，按钮现在回退到协议感知的标签（`Sign in with SSO (OIDC)` / `(SAML)`），让用户看清他们实际点击的是什么。诸如 "Corp SSO" 这样的真实提供商名保持不变。
- **登录页在仅配置重定向 SSO 时隐藏用户名/密码字段** (#350) - 之前即使唯一可用的认证方式是 OIDC/SAML，表单仍会渲染，留下没有消费者的字段。现在当存在 SSO 提供商且未配置 LDAP 提供商时表单隐藏。设置模式与 `?fallback=local` 查询参数保持表单可用于首次设置与运维恢复。SSO 提供商获取期间的加载骨架防止表单短暂闪现可见。临时启发式，直到后端暴露公共的 `local_auth_enabled` 标志。
- **迁移"添加连接"现在让用户选择源仓库管理器类型** (#319) - 表单之前没有"源类型"字段，因此后端静默地把每个连接默认为 Artifactory。新增"源类型"下拉框，带 Artifactory + Nexus 选项（SDK 当前接受的两个值），贯穿类型、API 适配器、表单状态与创建连接变更请求体。默认保持 Artifactory 以保留先前行为。
- **设置指南现在为 Gradle 与 SBT 仓库显示正确的客户端片段** (#333) - JVM 格式仓库（maven / gradle / sbt）之前只渲染 Maven `pom.xml` / `settings.xml`。对话框现在提供 Maven、Gradle (Groovy)、Gradle (Kotlin) 与 SBT 标签页，每个客户端都有正确的凭据与依赖片段。默认标签页跟随仓库声明的格式，因此 Gradle 仓库在 Gradle (Groovy) 上打开。
- **变更错误现在暴露后端详情，而不是通用占位符** (#207) - 审计了每个 TanStack Query `useMutation`，将不透明的 `onError: () => toast.error("Failed to ...")` 回调替换为 `toUserMessage(err, fallback)` 驱动的 toast。覆盖 27 个文件中的 91 个调用点。同时为 8 个之前静默的变更添加 `onError`（security/policies/scans + 仓库选择器预览），并按提供商（OIDC/LDAP/SAML）消除 SSO 切换 toast 的歧义。`toUserMessage` 现在还读取 FastAPI 风格的 `.detail` 字段，使插件安装错误（以及任何其他 FastAPI 形态的后端错误）展示其服务端消息。

### Accessibility

- **管理页面的 Aria 属性覆盖** (#208) - 将仅图标按钮上的 `title` 替换为 `aria-label`（lifecycle、monitoring、quality-gates、sso、telemetry、groups、security/scans、file-viewer）；通过 `htmlFor`/`id` 将表单输入与标签配对；为 `Switch` 组件添加可访问名称。每行的表格操作按钮（SSO 提供商、质量门禁、生命周期策略、遥测崩溃报告、用户、监控抑制）现在将行的标识名插值进 aria-label，使屏幕阅读器能够消歧。审批、安全与迁移页面上新增了可访问命名的 `Refresh` 按钮。

### Security

- **将第三方 GitHub Actions 固定到提交 SHA** (#205) - `codeql.yml`、`dependency-review.yml`、`docker-publish.yml` 与 `stale.yml` 中的每个第三方 `uses:` 行现在都固定到特定的提交 SHA（带版本注释），因此上游标签改写无法静默替换操作代码。`ci.yml` 早已固定，是范本。同组织可复用工作流 `artifact-keeper/artifact-keeper-test/.github/workflows/release-gate.yml@main`（docker-publish.yml 第 191 行）有意跟踪 `main` —— 同组织工作流继承组织的分支保护信任边界，而将可复用工作流固定到 SHA 在运维上更重。Dependabot 已为 `github-actions` 配置，因此升级会持续流经评审。

### Notes

- **v1.1.8 web 镜像永久不可用** (#320) - web 发布流程止步于 v1.1.3，而后端继续到 v1.1.8。没有可供重新构建的 v1.1.8 源引用；回填会伪造出处。参见 [docs/release-history/v1.1.8-web-postmortem.md](docs/release-history/v1.1.8-web-postmortem.md)。复发由 `artifact-keeper#882`（镜像发布门禁）阻止。

## [1.8.0] - 2026-08-03

### Fixed

- **仓库对话框：默认私有 + 访客访问关闭时隐藏公共开关** (#734) - 创建仓库表单初始化为 `is_public: true`，覆盖了后端默认私有的姿态；并且即使后端以 `AK_GUEST_ACCESS_ENABLED=false` 运行（匿名访问不可能；后端无论如何都会把 `is_public=true` 强制为 false），两个对话框也都显示已启用的 Public 开关。创建表单现在默认为私有，当 `/api/v1/system/config` 报告 `guest_access_enabled: false` 时，创建与编辑对话框中的开关被替换为一条低调的"公共仓库已被运维人员禁用"说明。通过现有的 `SystemConfigProvider`/`useFeatureFlags` 读取该标志；配置加载期间开关照常渲染（后端强制使该方向是安全的）。

## [1.7.0] - 2026-08-01

在 `@artifact-keeper/sdk` 1.7.0 上将 Artifact Keeper 1.7.0 后端能力呈现在 web UI 中。亮点：可逆的年龄门禁审查决策与按仓库的年龄门禁设置、从制品浏览器隔离发布/拒绝、面向发布者信任与热度门禁的策展规则编辑器、按仓库的扫描与执行设置、可对接 SIEM 的 NDJSON 审计导出，以及 WASM 插件布局选择 —— 外加一轮安全加固（基于 nonce 的 CSP、运行时 HTTPS 强制、CSRF 纵深防御）与一轮可访问性工作（页面标题、跳转导航、CI 中的 axe 扫描）。

### Sponsors

感谢我们的赞助者支持 Artifact Keeper 的持续开发。

**Backers（支持者）**

- Ash A. ([@dragonpaw](https://github.com/dragonpaw))
- Gabriel Rodriguez ([@injectedfusion](https://github.com/injectedfusion))

[成为赞助者](https://github.com/sponsors/artifact-keeper) 以支持该项目，并让你的名字出现在这里。

### Thank You（致谢）

- **[@dvodop](https://github.com/dvodop)** — 包年龄策略状态在导航间保持（#657）与可滚动的创建仓库对话框（#652）
- **[@ivolnistov](https://github.com/ivolnistov)** — 生命周期策略的仓库作用域选择器（#660）与权限 UI 中的服务账号主体（#710）
- **[@nicola-preda](https://github.com/nicola-preda)** — 安全策略表单中的仓库选择器（#662）与迁移测试连接 toast 上的连接器类型标签（#625）

### Added

- **年龄门禁审查决策事后可以更改** — 队列状态现在是下拉框，由后端重开端点支撑：重开至待处理会重新应用门禁并再次扣留版本，重开-再决定作为单个运维动作运行，若第二个调用失败则给出明确的中间态错误；重开要求非空理由，批准则针对正在发布的版本进行确认。队列还展示它早已收到的决策元数据（记录的理由、决策管理员、决策日期），并将状态筛选改为多状态复选框。重开能力按会话检测而非版本检查，因此早于该端点的后端会降级为仅决定，并附说明（#651、#698；后端 artifact-keeper#2939）。
- **按仓库的年龄门禁设置面板与 Webhook 事件接线** (#701、#707)。
- **从制品详情对话框隔离发布与拒绝** — 管理员可以从仓库制品浏览器解除或终结隔离（拒绝可带可选理由；两者对非管理员隐藏）。制品列表现在携带后端的每行隔离状态（`is_blocked`、`quarantine_status`、`quarantine_until`、`quarantine_reason` —— 服务器未查找时为缺失而非 null），之前无法触及的 `QuarantineBanner` 终于上线，被隔离制品的下载控件被禁用并以理由重新标注，而不是点击后遇到 409（#650，后端 artifact-keeper#2940）。
- **策展规则编辑器** — 在现有审查队列旁边的规则标签页中编写发布者信任与热度/仿冒门禁（#683）。
- **扫描与执行设置面板** — 按仓库的扫描开关（`scan_enabled`、`scan_on_upload`、`scan_on_proxy`）、内联扫描并阻止、严重级别阈值，以及代理扫描的失败开放 vs 失败关闭动作（#681）。
- **SIEM 审计日志导出** — 管理审计日志的 NDJSON 导出，采用后端已发布的审计事件 v1 模式（每行一条自包含记录），与 CSV 和带版本 JSON 格式并列（#703、#706）。
- **npm 上游源配置 UI** (#702、#705)。
- **WASM 插件布局可在 UI 中选择与显示** (#591、#592、#709) — 完整布局显示需要后端 artifact-keeper#3070（后端 1.7.0 线）。
- **权限 UI 中的服务账号主体** (#710)。
- **SSO 同步组的只读 UI** — 外部同步组上的编辑与添加成员动作被禁用（#629、#711）。
- **生命周期策略的仓库作用域选择器** (#660)。
- **仓库详情默认使用 Packages 标签页**，用于面向包的格式；RAW/Generic 与容器/OCI 格式保留 Artifacts 标签页（#633）。
- **可访问性：页面标题、跳转导航链接，以及 CI 中的 axe-core 扫描**，包括仓库列表筛选下拉框的可访问名称（#671、#687）。

### Changed

- 消费 **`@artifact-keeper/sdk` 1.7.0** (#667)；SDK 客户端重构新增 `unwrap` 辅助函数、移除死 API 模块、规范化具名导出（#678、#694）。`apiFetch` 现在抛出导出的 `ApiError`，携带 `.status` 与原始 `.body`（增量式、向后兼容）（#651）。
- **Docker 标签视图使用服务端 `docker_tag` 分组** — 真正的多架构感知镜像大小、扫描汇总状态与服务端分页，修复大型注册表上的空白"未找到镜像标签"状态（#561、#714）。
- **仓库列表查询整合进共享 hooks** (#669、#692)。
- **合并依赖升级**，取代 12 个 dependabot PR（#704）。
- **存储可回收估算** — 面板的可回收干跑现在使用随附的按仓库 `storage-gc` 端点，而不是 404（#708、#716）；该估算需要后端 artifact-keeper#3074（后端 1.7.0 线）。

### Fixed

- **暂存发布目标被读回并遵守** — 设置选择器显示已保存的链接而不是总为 "None"，Promote 对话框锁定到链接目标并带"链接的发布目标"徽章（#658、#661、#712）。
- **用户列表与组成员选择器分页** (#564、#715)。
- **包年龄策略状态在导航间保持** — 表单现在从已保存的服务器状态播种，而不是硬编码默认值（#656、#657）。
- **隔离列表徽章与已交付的后端契约对齐** (#697、#700)。
- **静默的 `per_page` 截断在管理列表页面上被暴露** (#670、#688)。
- **安全策略表单：选择一个仓库而不是输入其 UUID** (#489、#662)。
- **可滚动的创建仓库对话框** (#652)。
- **迁移测试连接 toast 按连接器类型标注** (#625)。
- **可访问性：从仓库列表行中移除嵌套的交互元素** (#672、#689)。

### Security

- **无 `script-src unsafe-inline` 的基于 nonce 的 CSP** (#674、#693)。
- **`AK_ENFORCE_HTTPS` 在运行时求值**，而不是构建时（#679、#691）。
- **变更请求上的自定义请求头用于 CSRF 纵深防御** (#673、#690)。
- **CI 依赖门禁** — 依赖审查现在是阻塞性的，并新增 npm audit 门禁（#675、#686）。

### Removed

- **SMTP 保存流程** — 后端从未暴露 SMTP 保存端点（SMTP 完全通过服务器环境变量配置），因此电子邮件标签页总是 404 的可编辑表单被替换为指向环境变量的信息性说明；发送测试邮件仍保留（#555、#713）。

## [1.6.0] - 2026-07-31

在 `@artifact-keeper/sdk` 1.6.0 上将 Artifact Keeper 1.6.0 后端能力呈现在 web UI 中（史诗 #599）。亮点：审计日志 SIEM 导出、按文件夹的去重存储用量、CVE 爆炸半径潜在暴露披露、1.6.0 特定格式的仓库配置、年龄门禁审查队列，以及 RAW/Generic 仓库可浏览的文件夹树 —— 外加授权加固与一轮管理 UI 修复。

### Sponsors

感谢我们的赞助者支持 Artifact Keeper 的持续开发。

**Backers（支持者）**

- Ash A. ([@dragonpaw](https://github.com/dragonpaw))
- Gabriel Rodriguez ([@injectedfusion](https://github.com/injectedfusion))

[成为赞助者](https://github.com/sponsors/artifact-keeper) 以支持该项目，并让你的名字出现在这里。

### Thank You（致谢）

- **[@rockdrilla](https://github.com/rockdrilla)** — 设置指南中的单行与 DEB822 APT 源格式（#595）
- **[@nicola-preda](https://github.com/nicola-preda)** — 包空状态布局修复（#622）
- **[@cazlo](https://github.com/cazlo)** — 为本地自身对等实例禁用操作（#581）与认证测试时序加固（#583）
- **[@nicexe2e4](https://github.com/nicexe2e4)** — 从设置 API 渲染 Environment 徽章（#556）
- **[@mymarche](https://github.com/mymarche)** — 组成员现在显示在管理对话框中（#525）

### Added

- **审计日志 SIEM 导出** — 审计日志的 CSV 与带版本 JSON 导出（#606）。
- **按文件夹的去重存储用量**，外加仓库去重存储面板；`storage.ts` 迁移到 SDK（#608、#594）。
- **CVE 爆炸半径潜在暴露** — 展示能够访问受限仓库但尚未下载受影响制品的用户（#607）。
- **创建对话框与设置标签页中的 1.6.0 特定格式仓库配置**（#609）。
- **年龄门禁审查队列**管理页面（#635）。
- **RAW/Generic 仓库可浏览的文件夹树**（#630）。
- **APT 设置**在设置指南中提供单行与 DEB822 两种源格式（#595）。
- **首次运行设置提示**从后端渲染在登录页上（#620）。

### Changed

- 消费 **`@artifact-keeper/sdk` 1.6.0** (#601)；web 版本升至 1.6.0（#598）。
- 面向维护者的前端 **ARCHITECTURE.md**（#617）。
- 常规依赖与 CI 动作升级（Next.js、React、lucide-react、shiki、openapi-ts，以及数个 GitHub Actions）。

### Fixed

- 包空状态布局（#622）。
- 为本地自身对等实例禁用操作（#581）。
- 从设置 API 渲染 Environment 徽章（#556）。
- 组成员现在显示在管理对话框中（#525）。

### Security

- **授权加固** — 插件配置 Configure 门禁与签名密钥所有者门禁（#612）。

## [1.1.0] - 2026-04-19

Artifact Keeper Web 的首个稳定版本。与 `artifact-keeper` 1.1.0 后端实现平台对等。整合 `1.1.0-rc.5` 至 `1.1.0-rc.9` 以及 RC 后的工作。

### Added

- **多 GB 制品的分块上传** (#218) - 哈希、暂停/恢复/取消控件、按块重试、速度/ETA 读数；上传到仓库时对 >=100MB 的文件自动启用
- **仓库作用域的访问令牌** (#294) - 按格式筛选器、名称模式与标签限制令牌；启用时令牌创建对话框会多出一个仓库选择器
- **详情视图上的仓库设置标签页** (#298) - 无需离开页面即可内联编辑仓库元数据
- **仓库上的通知配置标签页** (#293) - 按仓库的 Webhook 与电子邮件通知目标
- **管理设置中的 SMTP 配置** (#299) - 从 UI 配置出站邮件服务器
- **Webhook 负载模板选择器** (#295) - 创建 Webhook 时选择预定义或自定义负载模板
- **制品上的隔离状态** (#292) - 列表与详情视图显示隔离状态与横幅
- **管理用户列表与编辑对话框上的认证来源徽章** (#291) - 显示用户来自哪个身份提供商（local、LDAP、SAML、OIDC）
- **登录失败时的账户锁定状态** (#284) - 登录页展示剩余尝试次数与锁定到期时间
- **密码过期警告横幅与强制更改流程** (#286) - 到期前警告、到期后阻止访问并强制更改
- **全局错误与根错误边界页面** (#290) - Next.js `error.tsx` 与 `global-error.tsx`，带遥测与重试 UX
- **管理权限 UI** (#186，作者 @TechEnchante) - 带仓库选择地管理主体 / 目标 / 动作权限
- **暂存仓库创建** (#142) - 从 UI 创建暂存仓库
- **带语法高亮的制品内容查看器** (#154) - 通过 Shiki 内联浏览文件内容
- **侧边栏与设置中的 Git 提交哈希** (#153) - 显示运行中的构建哈希，便于支持与复现
- **远程仓库创建/编辑中的上游认证字段** (#181) - 配置远程仓库时设置代理凭据与令牌
- **仓库创建/编辑上的存储配额字段** (#184) - 按仓库的大小限制
- **按格式的默认上游 URL 建议** (#185) - 根据所选包格式预填代理 URL
- **为其他用户管理管理员令牌** (#191) - 管理员可以代表用户创建、列出与撤销令牌
- **Playwright E2E 套件扩展** (#76、#119、#121、#151) - 250+ 交互测试，含 RBAC 角色覆盖、视觉回归与 CI 分片
- **带 V8 覆盖率的 Vitest 单元测试套件** (#69、#70、#71、#112、#113) - 覆盖率门禁集成进 CI
- **教程视频流水线** (#79) - 带 Amazon Polly 配音的 YouTube 就绪教程生成

### Changed

- **SDK 升级到 `@artifact-keeper/sdk` 1.1.4** (#297、#233、#231) - 跟踪生成的 OpenAPI 客户端从 1.1.0-rc.5 → 1.1.0 → 1.1.4 的演进
- 主要依赖升级：Next.js 16.2.x、React 19.2.x、Tailwind CSS 4.2.x、基于 Radix UI 的 shadcn/ui、TanStack Query 5.99.x、react-hook-form 7.72.x、framer-motion 12.38.x、vitest 4.1.x、shiki 4.0.x、lucide-react 1.8.x
- **CI 加固** - SonarCloud 扫描以 `SONAR_TOKEN` 可用性为门禁（#94）；预发布标签排除在 Docker Hub `:latest` 之外（#223）；新增重复代码与新代码覆盖率门禁，带可见的逐步输出（#313）

### Fixed

- **访问令牌创建对话框在 Playwright 中溢出视口** (#312) - 对话框现在限制在 `90vh` 并带内部滚动，与 quality-gates、webhooks 与 settings-sso 对话框使用的模式一致
- **E2E 选择器与新的"Name Pattern"标签冲突** (#301) - 在访问令牌对话框上将 `getByLabel(/^name$/i)` 锚定
- **SSO 回调在令牌交换后未刷新认证上下文** (#276，作者 @nikitatsym) - 回调现在在重定向前调用 `refreshUser()`，使侧边栏无需重新加载即可反映已认证用户
- **CSP 收紧、`Math.random` 替换、SSO 错误净化** (#217) - 减少 XSS 面与信息泄露
- **为大制品上传提高代理请求体大小限制** (#285) - 提高 Next.js 代理中间件请求体限制
- **CVE 发现显示 GHSA 而非 CVE 标识符** (#280) - 解析咨询 id 以用于显示
- **扫描执行失败时扫描状态显示错误状态** (#288)
- **密码复用拒绝消息** (#296) - 在更改密码时展示后端的策略消息
- **API 密钥与访问令牌创建后不显示** (#106)
- **下载 URL 模式与后端路由不匹配** (#115)
- **暂存仓库筛选使用了错误的类型参数** (#138)
- **Docker 登录 `/v2` 未到达中间件** (#108) - 扩展中间件 matcher
- **SSO 回调路由** (#201) - `/auth/callback` 重写路由到 SSO 页面
- **虚拟仓库创建字段映射** (#187) - 包含 `member_repos`，修复成员列表
- **非管理员用户看到管理员作用域复选框** (#57)
- **独立 Docker 中 `BACKEND_URL` 在运行时被忽略** (#56、#58)
- **Playwright 严格模式下的重复创建按钮** (#66)
- **安全扫描与访问令牌的易失败 E2E 测试** (#119)
- **E2E 设置中的强制密码更改** (#202)
- **发布门禁在镜像构建之前运行** - Docker 发布现在先构建，之后再运行兼容性门禁作为咨询性检查
- **代码重复门禁结果不可见** (#313) - 步骤现在将百分比与克隆列表打印到 stdout，并在解析错误时快速失败

### Security

- **包元数据中的 URL 校验与 CSP 头** (#92) - 校验从包元数据渲染的 URL 以防存储型 XSS；添加 `Content-Security-Policy` 头
- **实例 URL SSRF 加固** - 拒绝私有 IP 范围与 IPv6 回环变体；从 `localStorage` 移除遗留令牌存储
- **CSP 收紧、Math.random 替换、SSO 错误净化** (#217)

### New Contributors（新贡献者）

- @TechEnchante (#186)
- @nikitatsym (#276)
- @mergify[bot] (#232)

## [1.1.0-rc.4] - 2026-02-25

### Added

- **访问令牌页面与服务账号 UI** (#62) - 用于管理访问令牌的专用页面，支持服务账号，从个人资料标签页移至侧边栏导航
- **服务账号令牌作用域的仓库选择器** (#64) - 将服务账号令牌限制到特定仓库的 UI
- **Incus/LXC 格式** (#63) - 浏览与管理 Incus 容器镜像的 web UI 支持
- **带 SSE 的实时数据刷新** (#77) - 通过服务器发送事件实现实时缓存失效、TanStack Query 缓存调优与跨页数据协调
- **插件安装对话框** (#75) - 将插件安装流程接入后端 API
- **Vitest 单元测试套件** (#69、#70、#71) - SDK 客户端、认证 API 与 URL 校验的单元测试，带 V8 覆盖率报告与 CI 集成
- **Playwright E2E 测试套件** (#76) - 250+ 交互测试，含 RBAC 角色覆盖、视觉回归与 CI 分片支持
- **教程视频流水线** (#79) - 生成带 Amazon Polly 配音的 YouTube 就绪教程视频的后处理流水线

### Fixed

- **重复的创建按钮** (#66) - 移除导致 Playwright 严格模式失败的重复按钮元素
- **插件页面描述** (#73) - 更新页面文案以匹配实际插件能力
- **E2E 种子数据 API 路径** (#91) - 修正测试种子数据中的 API 端点路径与配置
- **实例 URL 校验加固** - 通过针对私有 IP 范围校验、从 localStorage 移除遗留令牌存储来防止通过实例 URL 的 SSRF
- **IPv6 回环检查** - 修复 URL 校验以正确识别 IPv6 回环地址
- **CI SonarCloud 条件** (#94) - 当 `SONAR_TOKEN` 不可用时跳过 SonarCloud 扫描（fork、外部 PR）

### Security

- **包元数据中的 URL 校验与 CSP 头** (#92) - 校验从包元数据渲染的 URL 以防存储型 XSS，添加 Content-Security-Policy 头

### Changed

- CI 中加入 SonarCloud 扫描（#72）
- Mergify 自动合并配置（#67）
- 依赖升级：@tailwindcss/postcss 4.2.0、tailwind-merge 3.5.0、framer-motion 12.34.3、react-hook-form 7.71.2、react-resizable-panels v4、lucide-react、tailwindcss

## [1.1.0-rc.3] - 2026-02-17

### Fixed

- **独立 Docker 中 `BACKEND_URL` 在运行时被忽略** (#56、#58) — 用 Next.js 中间件替换构建时的 `rewrites()`，在每次请求时读取 `BACKEND_URL`，因此容器无需重新构建即可配置
- **非管理员用户看到管理员作用域复选框** (#57) — API 密钥与访问令牌表单中的"Admin"作用域选项现在对非管理员用户隐藏

### Added

- **令牌 CRUD E2E 测试** (#57) — 针对 `POST /api/v1/auth/tokens`（创建）、`DELETE /api/v1/auth/tokens/:id`（撤销）与空名称校验的 Playwright 测试

### Changed

- 提取 `TokenCreateForm` 组件，以消除个人资料页面中重复的表单块（#57）
- 从 Dockerfile 构建阶段移除 `ARG BACKEND_URL`；默认值现在是运行时 `ENV`（#58）

## [1.0.0-a1] - 2026-02-06

### Added

- 用于查看、生成与许可证合规分析的 SBOM UI
- TOTP 双因素认证 UI
- 实例切换器中的实例在线/离线状态点
- Web UI 中的首次启动设置体验
- MIT 许可证

### Changed

- 为 Docker 构建使用原生 arm64 runner（性能改进）

### Fixed

- 为演示模式反馈添加仓库变更的错误处理
- 更新演示自动登录密码以匹配演示实例
- 清理 lint 错误与未使用导入
- 允许 docker 命令在首次设置横幅中换行
- 防止移动屏幕上 docker exec 命令溢出

## [1.0.0-rc.1] - 2026-02-03

### Added

- 带按仓库说明与格式筛选的设置指南页面
- 在仓库内搜索制品，而不仅是仓库名
- 重新设计的主从分栏布局仓库浏览器
- 多平台 Docker 构建（amd64 + arm64）

### Changed

- 使 packages 与 builds 页面与实际后端 API 对齐
- 移除独立制品页面，重定向到仓库
- 使设置指南页面无需认证即可访问

### Fixed

- 在构建时传入 BACKEND_URL 以用于 Next.js rewrites
- 登出时重定向到 / 而不是 /login
- 加宽设置对话框并在代码块中换行长 URL
- 无包存在时隐藏包详情面板
- 在生产中禁用 Next.js 开发指示器
- 移除 useEffect 中的 setState 与未使用变量警告
- 从其他页面获取制品匹配的仓库，并将其排序在前
- 登出时停止 401 刷新循环
- 解决阻止 CI Docker 镜像发布的 lint 错误
