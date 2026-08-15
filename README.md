# Artifact Keeper — Web

Next.js 16 web frontend for Artifact Keeper, an enterprise artifact registry.

## Tech Stack

- **Next.js 16** with App Router
- **React 19** + **TypeScript 6**
- **Tailwind CSS 4** for styling
- **shadcn/ui** for component primitives
- **TanStack Query 5** for server state management
- **next-intl** for internationalization (en / zh)
- **next-themes** for theming (brand / light / dark)
- **@artifact-keeper/sdk** (+ `apiFetch` wrapper) for the backend API
- **Lucide React** for icons

## Design Principles

Inspired by Apple HIG, Material Design 3, Linear, and Vercel Dashboard:

1. Brand-first — a white/navy default theme, with the original light and dark themes one click away
2. Typography-driven hierarchy — minimal chrome
3. Generous whitespace — content breathes
4. Progressive disclosure — essentials first, details on demand
5. Motion with purpose — meaningful transitions

## Getting Started

```bash
npm install
npm run dev
```

Runs on http://localhost:3000. Configure `NEXT_PUBLIC_API_URL` to point to the Artifact Keeper backend.

## Localization (i18n)

The UI is fully localized in English (`en`) and Simplified Chinese (`zh`) with
[next-intl](https://next-intl.dev). The locale is resolved per request from the
`NEXT_LOCALE` cookie — not a URL prefix — so existing deep links, bookmarks and
E2E specs keep working unchanged. The language switcher lives in the app header
and on the login page.

- Message catalogs live in `src/i18n/locales/{en,zh}/` as flat JSON files that
  mirror the source tree: one `page.json` per `page.tsx`, one `*.json` per
  shared component. A file's namespace is exactly its locale-relative path.
- `loadMessages` (server-only) reads the JSON from disk and loads messages by
  route directory; each route layout composes the shared `CORE_ROOTS` with its
  own route directory, so a page only ships the messages its subtree renders.
- Adding a language means mirroring `en/` under `locales/{code}/` and
  registering the code in `src/i18n/routing.ts`. Any missing key falls back to
  English, so a raw key never leaks to the UI.
- `scripts/check-i18n.mjs` validates that `locales/` contains only JSON,
  en/zh key parity, and that every message file is actually loaded by some
  route layout.

## Themes

The UI ships three themes via [next-themes](https://github.com/pacocoursey/next-themes)
(applied as a class on `<html>`), switchable from the app header:

- **brand** (default) — white/navy palette (`#023795` primary, `#4690d2`
  secondary), white top header, and a light-blue page background with a soft
  glow gradient.
- **light** — the original warm low-saturation light palette, flat background.
- **dark** — a flat dark mode.

The theme tokens live in `src/app/globals.css`; the brand palette and its page
gradient are scoped to the `.brand` class so the original light/dark themes are
byte-for-byte unchanged.

## Deployment

### HTTPS hardening (`AK_ENFORCE_HTTPS`)

By default the web UI ships **without** HSTS and without the CSP
`upgrade-insecure-requests` directive so that a plain-HTTP deployment (e.g. the
first-run `http://<IP>:30080`) works out of the box. If those transport-security
headers were always emitted, the browser would rewrite every same-origin
request to `https://`, which a plain-HTTP port cannot answer — breaking the UI.

Set `AK_ENFORCE_HTTPS=true` (or `1`) when the UI is served behind TLS to
re-enable `Strict-Transport-Security` and `upgrade-insecure-requests`. All other
security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
Permissions-Policy, and the rest of the CSP) are always emitted regardless.

The flag is evaluated **at container runtime** — the headers are emitted by the
middleware (`src/middleware.ts`), which reads the env var on every request, so
no rebuild is needed. Set it on the running container:

```bash
docker run -e AK_ENFORCE_HTTPS=true ... artifact-keeper-web
```

or in the compose `environment:` block. The effective mode is logged once at
server startup (`[security] AK_ENFORCE_HTTPS ...`) so you can confirm the
container picked it up.

For custom image builds, `--build-arg AK_ENFORCE_HTTPS=true` still works — it
only sets the image's **default** value, which a runtime `-e` flag overrides.

### CSRF protection

The UI authenticates with httpOnly session cookies (`credentials: "include"`),
so it relies on a CSRF contract with the backend:

- **Frontend (implemented here):** every API request — SDK calls, `apiFetch`,
  and the remaining raw `fetch` mutations — carries the custom header
  `X-Requested-With: XMLHttpRequest` (see `CSRF_HEADER_NAME` in
  `src/lib/sdk-client.ts`). Cross-site HTML forms cannot set custom headers,
  so this header forces a CORS preflight a forged request cannot satisfy.
- **Backend (contract):** the backend MUST
  1. issue the session cookie with `SameSite=Lax` or `SameSite=Strict`, and
  2. reject cookie-authenticated mutating requests (POST/PUT/PATCH/DELETE)
     that lack the `X-Requested-With` header. Native package-manager clients
     are unaffected — they authenticate with Basic/Bearer credentials, not
     cookies, so the header requirement applies only to cookie auth.

The backend enforcement half is tracked as a follow-up issue in the
`artifact-keeper` repository (see issue #673 here for the full audit finding).

## Project Structure

```
src/
  app/           # Next.js App Router pages + globals.css (theme tokens)
  components/    # Reusable UI components
  hooks/         # Client-side hooks
  i18n/          # next-intl setup: routing, request, loadMessages, locales/
  lib/           # Utilities, API client, hooks
  middleware.ts  # Security headers, AK_ENFORCE_HTTPS, locale handling
  providers/     # Theme provider, next-intl provider, etc.
  types/         # Shared TypeScript types
```
