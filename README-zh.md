# Artifact Keeper — Web

面向 Artifact Keeper（企业级制品仓库）的 Next.js 16 Web 前端。

## 技术栈

- **Next.js 16**（App Router）
- **React 19** + **TypeScript 6**
- **Tailwind CSS 4**（样式）
- **shadcn/ui**（组件原语）
- **TanStack Query 5**（服务端状态管理）
- **next-intl**（国际化，en / zh）
- **next-themes**（主题，brand / light / dark）
- **@artifact-keeper/sdk**（外加 `apiFetch` 封装）对接后端 API
- **Lucide React**（图标）

## 设计原则

灵感来源于 Apple HIG、Material Design 3、Linear 与 Vercel Dashboard：

1. 品牌优先 —— 默认白/藏青主题，原始的亮色与深色主题一键可切
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

## 本地化（i18n）

UI 使用 [next-intl](https://next-intl.dev) 完整本地化为英语（`en`）和简体中文
（`zh`）。语言环境在每个请求中通过 `NEXT_LOCALE` Cookie 解析 —— 而非 URL 前缀
—— 因此现有的深层链接、书签与 E2E 测试都能保持不变地工作。语言切换器位于应用
顶栏与登录页。

- 消息目录以扁平 JSON 文件形式存放在 `src/i18n/locales/{en,zh}/` 中，并镜像源码
  树结构：每个 `page.tsx` 对应一个 `page.json`，每个共享组件对应一个 `*.json`。
  文件的名称空间就是它相对 locale 的路径。
- `loadMessages`（仅服务端）从磁盘读取 JSON，并按路由目录加载消息；每个路由
  layout 将共享的 `CORE_ROOTS` 与自身的路由目录组合起来，因此页面只携带其子树
  实际渲染所需的消息。
- 新增语言只需在 `locales/{code}/` 下镜像 `en/`，并在 `src/i18n/routing.ts` 中
  注册该语言代码。任何缺失的键都会回退到英语，因此原始键永远不会泄露到 UI。
- `scripts/check-i18n.mjs` 会校验 `locales/` 仅包含 JSON、en/zh 键对等，以及每个
  消息文件都确实被某个路由 layout 加载。

## 主题

UI 通过 [next-themes](https://github.com/pacocoursey/next-themes) 提供三种主题
（以 `<html>` 上的类名应用），可在应用顶栏切换：

- **brand**（默认）—— 白/藏青配色（`#023795` 主色、`#4690d2` 辅色），白色顶栏，
  以及带柔和光晕渐变的浅蓝页面背景。
- **light** —— 原始的低饱和暖色调亮色配色，纯色背景。
- **dark** —— 纯色深色模式。

主题变量位于 `src/app/globals.css`；品牌配色及其页面渐变限定在 `.brand` 类名下，
因此原始的亮色/深色主题逐字节保持不变。

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
  app/           # Next.js App Router 页面 + globals.css（主题变量）
  components/    # 可复用的 UI 组件
  hooks/         # 客户端 Hooks
  i18n/          # next-intl 配置：routing、request、loadMessages、locales/
  lib/           # 工具函数、API 客户端、Hooks
  middleware.ts  # 安全响应头、AK_ENFORCE_HTTPS、语言环境处理
  providers/     # 主题 Provider、next-intl Provider 等
  types/         # 共享 TypeScript 类型
```
