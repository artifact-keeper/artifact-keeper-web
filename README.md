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

## Project Structure

```
src/
  app/           # Next.js App Router pages
  components/    # Reusable UI components
  lib/           # Utilities, API client, hooks
  styles/        # Global styles, theme tokens
```
