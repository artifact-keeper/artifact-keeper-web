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

### Hosted RPM metadata roots

Local RPM repositories support **Repodata Depth** in the create dialog and
repository Settings when the backend confirms support through
`GET /api/v1/repositories/_/capabilities`
([backend tracking issue](https://github.com/artifact-keeper/artifact-keeper/issues/4216)).
Zero is the default and keeps existing root-level metadata. At depth one,
`build-a/package.rpm` and `build-b/package.rpm` have independent metadata at
`/rpm/<repo>/build-a/repodata/repomd.xml` and
`/rpm/<repo>/build-b/repodata/repomd.xml`. Deeper descendants stay in their
respective root. These are paths in one repository, not child repositories or
separate permissions.

The Upload tab accepts the complete relative artifact path, including the
filename. The shared Setup Guide shows the matching native curl PUT and YUM/DNF
baseurl. A positive depth requires at least that many directories before the
filename; the backend also enforces path safety and its path-length limit.

Positive depth is not supported on Remote, Virtual, Staging, curated or snapshot
repositories, or repositories participating in curation, publications or virtual
membership. Changing the value requires backend-confirmed eligibility and no
artifact history, including deleted artifacts. Unrelated settings and same-value
updates preserve the existing layout. Older backends can still create default
depth-zero repositories; positive settings remain disabled until support is
confirmed. Upgrade all backend instances before enabling this feature.

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
  app/           # Next.js App Router pages
  components/    # Reusable UI components
  lib/           # Utilities, API client, hooks
  styles/        # Global styles, theme tokens
```
