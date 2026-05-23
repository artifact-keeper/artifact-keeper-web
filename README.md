# Artifact Keeper — Web

Next.js 15 web frontend for Artifact Keeper, an enterprise artifact registry.

## Tech Stack

- **Next.js 15** with App Router
- **TypeScript 5.x**
- **Tailwind CSS 4** for styling
- **shadcn/ui** as the primitives layer (heavily restyled — see Design)
- **TanStack Query 5** for server state management
- **Axios** for HTTP client
- **JetBrains Mono** as the only typeface

## Design

Terminal-native. Dark-mode-first. JetBrains Mono throughout, with a single
signal-lime accent (`oklch(0.92 0.17 130)`) reserved for primary actions,
healthy status, and active nav. The product reads to platform engineers
the way `htop`, `fly`, or `tailscale up` reads — type-driven, dense, signed.

See [CLAUDE.md](CLAUDE.md) for the full design system rules used when
generating new features.

### Principles

1. **Mono first.** Numerics, identifiers, paths, versions, sizes — all
   monospace. Tabular alignment beats decorative variety.
2. **One accent.** Lime carries semantic weight (active, healthy, primary
   CTA). Don't introduce a second.
3. **Square edges.** 2px radius max. Cards and rows are rule-edged, not
   boxed.
4. **Typographic icons.** Lucide is reserved for header chrome and nav
   only; data rows use typographic glyphs (`●○◐`).
5. **Status, not greeting.** The dashboard opens with an `ak://prod`
   status line, not "Welcome back, $name".
6. **No pastel zoo.** Format identity lives in the syntax (`maven:`,
   `npm:`), never in colored badges.

### Anti-references

shadcn stock theme, gradient hero cards, decorative icon-per-row nav,
greeting copy, badge-per-format coloring, Inter / Geist for body text,
rounded-pill progress bars.

## Getting Started

```bash
npm install
npm run dev
```

Runs on http://localhost:3000. Configure `NEXT_PUBLIC_API_URL` to point to the Artifact Keeper backend.

## Project Structure

```
src/
  app/           # Next.js App Router pages
  components/    # Reusable UI components
  lib/           # Utilities, API client, hooks
  styles/        # Global styles, theme tokens
```
