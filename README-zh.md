# Artifact Keeper — Web

面向 Artifact Keeper（企业级制品仓库）的 Next.js 15 Web 前端。

## 技术栈

- **Next.js 15**（App Router）
- **TypeScript 5.x**
- **Tailwind CSS 4**（样式）
- **shadcn/ui**（组件原语）
- **TanStack Query 5**（服务端状态管理）
- **Axios**（HTTP 客户端）
- **Lucide React**（图标）

## 设计原则

灵感来源于 Apple HIG、Material Design 3、Linear 与 Vercel Dashboard：

1. 深色模式优先 —— 开发者工具的默认形态
2. 排版驱动的层级 —— 极简的界面装饰
3. 充足的留白 —— 让内容呼吸
4. 渐进式呈现 —— 先展示核心，细节按需展开
5. 有目的的动效 —— 有意义的过渡

## 快速开始

```bash
npm install
npm run dev
```

运行于 http://localhost:3000。将 `NEXT_PUBLIC_API_URL` 配置为指向 Artifact Keeper 后端。

## 部署

### HTTPS 强化（`AK_ENFORCE_HTTPS`）

默认情况下，Web UI **不**携带 HSTS 头，也不包含 CSP 的
`upgrade-insecure-requests` 指令，以便纯 HTTP 部署（例如首次运行时通过
`http://<IP>:30080` 访问）开箱即用。如果始终发送这些传输安全头，浏览器会把所有
同源请求改写为 `https://`，而纯 HTTP 端口无法响应这些请求 —— 导致 UI 无法使用。

当 UI 部署在 TLS 之后时，设置 `AK_ENFORCE_HTTPS=true`（或 `1`）即可重新启用
`Strict-Transport-Security` 与 `upgrade-insecure-requests`。其余所有安全响应头
（X-Frame-Options、X-Content-Type-Options、Referrer-Policy、
Permissions-Policy 以及 CSP 的其余部分）无论何种情况都会始终发送。

该标志在**容器运行时**进行求值 —— 响应头由中间件（`src/middleware.ts`）发出，
它会在每次请求时读取环境变量，因此无需重新构建。在运行中的容器上设置即可：

```bash
docker run -e AK_ENFORCE_HTTPS=true ... artifact-keeper-web
```

或配置在 compose 的 `environment:` 块中。生效的模式会在服务器启动时记录一次
（`[security] AK_ENFORCE_HTTPS ...`），以便你确认容器已正确读取。

对于自定义镜像构建，`--build-arg AK_ENFORCE_HTTPS=true` 仍然可用 —— 它只会
设置镜像的**默认**值，运行时的 `-e` 标志可以覆盖它。

### CSRF 防护

UI 使用 httpOnly 会话 Cookie 进行身份验证（`credentials: "include"`），
因此它依赖与后端约定的一套 CSRF 契约：

- **前端（此处已实现）：** 每一个 API 请求 —— SDK 调用、`apiFetch`，
  以及剩余的原始 `fetch` 变更请求 —— 都会携带自定义请求头
  `X-Requested-With: XMLHttpRequest`（参见 `src/lib/sdk-client.ts` 中的
  `CSRF_HEADER_NAME`）。跨站 HTML 表单无法设置自定义请求头，因此该请求头
  会强制触发一次伪造请求无法满足的 CORS 预检。
- **后端（契约要求）：** 后端**必须**
  1. 以 `SameSite=Lax` 或 `SameSite=Strict` 签发会话 Cookie，并且
  2. 拒绝缺少 `X-Requested-With` 请求头的、基于 Cookie 认证的变更请求
     （POST/PUT/PATCH/DELETE）。原生包管理器客户端不受影响 —— 它们使用
     Basic/Bearer 凭据而非 Cookie 进行认证，因此该请求头要求仅适用于
     Cookie 认证。

后端的强制执行部分已在本仓库中作为后续问题跟踪
（完整审计发现参见本仓库的 issue #673）。

## 项目结构

```
src/
  app/           # Next.js App Router 页面
  components/    # 可复用的 UI 组件
  lib/           # 工具函数、API 客户端、Hooks
  styles/        # 全局样式、主题变量
```
