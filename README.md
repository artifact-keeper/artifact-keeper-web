# Artifact Keeper — Web

Next.js 15 web frontend for Artifact Keeper, an enterprise artifact registry.

## Tech Stack

- **Next.js 15** with App Router
- **TypeScript 5.x**
- **Tailwind CSS 4** for styling
- **shadcn/ui** for component primitives
- **TanStack Query 5** for server state management
- **Axios** for HTTP client
- **Lucide React** for icons

## Design Principles

Inspired by Apple HIG, Material Design 3, Linear, and Vercel Dashboard:

1. Dark mode first — developer tool default
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

## Project Structure

```
src/
  app/           # Next.js App Router pages
  components/    # Reusable UI components
  lib/           # Utilities, API client, hooks
  styles/        # Global styles, theme tokens
```
