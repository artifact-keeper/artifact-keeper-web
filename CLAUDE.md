# CLAUDE.md — Design rules for new features

This file is read by Claude / Claude Code / Cursor / Copilot when generating
UI in this repo. Follow it strictly. The product is an artifact registry
positioned against JFrog Artifactory and Sonatype Nexus, so the audience is
platform engineers and DevSecOps. They reward precision and terminal-
nativeness, not glossy polish.

If you produce stock shadcn output, you are wrong. Re-read this file.

---

## 0. North star

**Terminal-native. Dark-mode-first. Mono-only. One accent.**

The look references `htop`, `fly`, `tailscale up`, Sentry CLI, Hetzner Robot —
type-driven, dense, signed. Light mode is "engineer reading docs on cream
paper": warm cream bg, deep ink, deep terminal-green accent. Dark mode is
"sysadmin in a tmux pane": near-black bg, parchment-white fg, signal-lime
accent.

---

## 1. Tokens — use these, never hard-code colors

All colors live in [src/app/globals.css](src/app/globals.css) as CSS variables.
Reference them through Tailwind utility classes that map to these tokens.

| Token              | Tailwind class           | Use for                                            |
|--------------------|--------------------------|----------------------------------------------------|
| `--background`     | `bg-background`          | Page background                                    |
| `--foreground`     | `text-foreground`        | Default body text                                  |
| `--card`           | `bg-card`                | Raised surfaces (panels, modals)                   |
| `--muted`          | `bg-muted`               | Subdued surfaces (skeletons, disabled)             |
| `--muted-foreground` | `text-muted-foreground` | Secondary text, labels, hints                     |
| `--primary`        | `text-primary` / `bg-primary` | THE accent. Active nav, healthy status, primary CTA, format-prefix, status-line key glyphs |
| `--primary-foreground` | `text-primary-foreground` | Text on primary fills                          |
| `--border`         | `border-border`          | All borders, rules, separators                     |
| `--seal`           | `text-seal` / `bg-seal`  | Reserved for **critical alarms only**              |
| `--destructive`    | `text-destructive`       | Errors, destructive actions                        |

**Never:**
- Hard-code colors (`text-orange-700`, `bg-blue-100`, `#1e293b`, etc.). If
  you reach for a Tailwind color name, stop and use a token instead.
- Use a second accent. Lime/green is the only color that carries meaning.
- Use `text-red-500` etc. for "critical" — use `text-seal` or `text-destructive`.

---

## 2. Typography — mono everything

Only **JetBrains Mono** is loaded ([src/app/layout.tsx](src/app/layout.tsx)).
`--font-sans`, `--font-mono`, `--font-display` all resolve to it. The body
default is mono. You don't need to add `font-mono` to most elements — it's
already there.

| Use case                    | Treatment                                                  |
|-----------------------------|------------------------------------------------------------|
| Page titles                 | `text-2xl` (or larger), normal weight, no tracking         |
| Section labels              | Use `SectionLabel` pattern (see §6)                        |
| Inline labels / dt fields   | `text-[10px] uppercase tracking-[0.18em] text-muted-foreground` |
| Values, SHAs, sizes, versions | `tabular-nums` for column alignment                     |
| Code / paths / repo keys    | Lowercase, no special class needed (already mono)          |
| User-facing prose           | `text-sm` to `text-base`, sentence case                    |

**Never:**
- Import a second typeface (no Inter, Geist, Söhne, Plex Sans, Fraunces).
- Use `font-sans` or `font-display` as a stylistic toggle — they're aliases.
- Use Title Case Headings With Capitals For Each Word in chrome (sidebar
  groups, status labels, etc.). Prefer lowercase.

---

## 3. Color discipline — kill the pastel zoo

The previous (pre-refactor) codebase used per-format pastel chips
(`bg-orange-100 text-orange-700` for maven, blue for pypi, red for npm, etc.).
**That pattern is banned.** Format identity lives in the *syntax*, not in
color.

```tsx
// ❌ BAD — pastel zoo
<Badge className="bg-orange-100 text-orange-700">maven</Badge>

// ✅ GOOD — typographic format prefix
<Link href={`/repositories/${repo.key}`} className="text-sm">
  <span className="text-primary">{repo.format.toLowerCase()}</span>
  <span className="text-muted-foreground">:</span>
  <span>{repo.name}</span>
</Link>
// Renders: maven:spring-boot-starter
```

When you need to distinguish many values (formats, severities, etc.):

- Prefer **typographic prefix** (`maven:`, `npm:`, `docker:`).
- If you must color, use a single hue at varying weight/opacity:
  - `text-primary` (full lime/green)
  - `text-primary/60` (dimmer)
  - `text-foreground/80` (neutral)
  - `text-muted-foreground` (dimmest)
  - `text-seal` only for `critical`
- Never use 4+ different hues in one view.

---

## 4. Shape — square edges, visible rules

```css
--radius: 0.125rem; /* 2px max. Most surfaces should be 0 or 1px. */
```

- Use `rounded-none` or omit radius classes entirely.
- Cards and rows are **rule-edged**, not boxed (`border border-border`, not
  drop shadows).
- No `rounded-full` except for things that genuinely should be circular
  (avatars, dot indicators).
- No `rounded-xl` / `rounded-2xl` ever.
- Buttons: `border border-border` or `border border-primary` — no
  shadow-elevated default-state buttons.

---

## 5. Reference patterns to copy

When building a new feature, find the closest pattern below and adapt it.
Do **not** invent a new visual language.

### 5a. Status line / hero (top of a page)

Source: `StatusLine` in [src/app/(app)/_components/dashboard-content.tsx](src/app/(app)/_components/dashboard-content.tsx)

Use when: page is an overview / dashboard / instance summary.

```tsx
<section className="border border-border bg-background/40">
  <header className="flex items-baseline justify-between gap-4 border-b border-border bg-card/40 px-4 py-2">
    <span className="text-sm">
      <span className="text-primary">ak://</span>
      <span className="text-foreground">prod</span>
      <span className="text-muted-foreground"> · {user}@</span>
      <span className="text-foreground/80">artifact-keeper</span>
    </span>
    <span className="text-[11px] tabular-nums text-muted-foreground">{stamp}Z</span>
  </header>
  <div className="px-4 py-3">
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
      <Stat label="health" value="●healthy" signal />
      <Stat label="repos" value="47" />
      {/* ... */}
    </div>
    <div className="mt-2 text-[11px] text-muted-foreground">
      <span className="text-primary">$</span>{" "}
      <span className="text-foreground/80">ak status</span>{" "}
      <span className="text-muted-foreground/70"># streaming events</span>
    </div>
  </div>
</section>
```

### 5b. Stat (key=value)

```tsx
function Stat({ label, value, signal }) {
  return (
    <span className="inline-flex items-baseline whitespace-nowrap">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-muted-foreground/60">=</span>
      <span className={signal ? "text-primary" : "text-foreground"}>{value}</span>
    </span>
  );
}
```

### 5c. Section divider

```tsx
function SectionLabel({ children }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs">
      <span aria-hidden className="text-muted-foreground/70">─</span>
      <span className="lowercase text-primary">{children}</span>
      <span aria-hidden className="flex-1 border-t border-border/70" />
    </div>
  );
}
// <SectionLabel>subsystems</SectionLabel> →  ─ subsystems ─────────────
```

### 5d. Status glyphs (●○◐✕)

Use Unicode glyphs, not lucide icons:

```tsx
function healthGlyph(s) {
  if (!s) return "○";                                  // unknown
  if (s === "healthy") return "●";                     // primary lime
  if (["degraded","unavailable"].includes(s)) return "◐"; // dim
  return "✕";                                          // seal red
}
```

### 5e. Format prefix on list items

Source: `RepoRow` in dashboard-content.tsx. Use whenever you display a
type-prefixed identifier (`maven:`, `npm:`, `docker:`, etc.).

```tsx
<Link href={...} className="text-sm">
  <span className="text-primary">{kind.toLowerCase()}</span>
  <span className="text-muted-foreground">:</span>
  <span>{name}</span>
</Link>
```

### 5f. Inline ruled row (key with leader)

Use for dense fact lists where each row is a label/value pair:

```tsx
<div className="flex items-baseline gap-2 border border-border/60 bg-card/40 px-3 py-2 hover:border-primary/60">
  <span className={`leading-none ${tone}`}>●</span>
  <span className="text-xs lowercase text-muted-foreground">{label}</span>
  <span className="ml-auto text-xs lowercase">{value}</span>
</div>
```

---

## 6. Icons

- Lucide icons are allowed in **header chrome** (search button, theme
  toggle, user menu) and in **sidebar nav** (one per row, the established
  pattern in [src/components/layout/app-sidebar.tsx](src/components/layout/app-sidebar.tsx)).
- Lucide icons are **not** allowed in dense data rows or as decoration
  inside tables / lists. Replace with typographic glyphs (●○◐) or with the
  format-prefix pattern.
- Never use color-tinted lucide icons (`text-emerald-500`, `text-red-500`).
  Use `text-primary`, `text-muted-foreground`, `text-seal` only.

---

## 7. Layout & spacing

- Page-level container: `<main className="flex-1 p-6">` (set in
  [src/app/(app)/layout.tsx](src/app/(app)/layout.tsx); don't override).
- Inside a page: `<div className="space-y-8">` for stacked sections,
  `space-y-6` for sub-sections, `space-y-3` for tight rows.
- Grids: prefer `grid-cols-2 lg:grid-cols-4` for stat tiles. Don't go
  beyond 4 columns at lg.
- Tables: `<Table>` from shadcn primitives are fine. **No alternating row
  colors** (`even:bg-muted`). Hairline `border-b` between rows is enough.
- Cards: `<Card>` primitive is fine; the new tokens already make it
  rule-edged.
- **Never** add gradient backgrounds, blurred orbs, or decorative SVG
  illustrations on chrome.

---

## 8. Empty states

```tsx
<div className="border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
  <p className="text-sm text-muted-foreground">No repositories yet.</p>
  <p className="mt-1 text-[11px] text-muted-foreground/70">
    <span className="text-primary">$</span> ak repo create &lt;name&gt;
  </p>
  <Button asChild className="mt-4"><Link href="/repositories">new repo</Link></Button>
</div>
```

The "command hint" line (`$ ak …`) is optional but encouraged — it's
terminal-native and tells the user what the action *is*.

---

## 9. Copy

- **Lowercase chrome.** Section labels, nav items, button labels: lower.
- **No "Welcome back" / greeting copy** in product chrome. The dashboard
  opens with a status line, not a salutation.
- **Prefer terse identifiers.** `health=●healthy`, not "System Health:
  Healthy". `47 repos`, not "47 repositories total". `12s ago`, not "12
  seconds ago".
- **Errors are signed and routable.** Show the operator what to do, not
  just "Something went wrong". Include the command, the docs link, or the
  log file path.

---

## 10. Motion

- Use motion sparingly. Page loads: no orchestrated reveals.
- Allowed: `transition-colors` on hover (border/text), `animate-spin` on
  refresh icons, `animate-pulse` on skeletons.
- Banned: parallax, sliding modals (`framer-motion` exists in deps but
  prefer Radix-driven transitions — they're tiny and CSS-only).

---

## 11. Pre-flight before writing UI

Before generating any new page or component:

1. **Find the closest existing component.** Grep for similar patterns in
   `src/app/(app)/` and `src/components/`. Copy that pattern's styling.
2. **Check it against §3 (color), §4 (shape), §5 (patterns).** If your
   draft contains: a colored badge per category, a rounded-xl card, a
   purple/blue/orange accent, or a "Welcome back" → **stop and rewrite**.
3. **Run tests.** `npm test -- <your-test-file>` for the component you
   touched. The dashboard / sidebar / login tests are good canaries for
   "did I break the public copy".

---

## 12. What "good" looks like

Run `npm run dev` and look at:

- [src/app/(app)/_components/dashboard-content.tsx](src/app/(app)/_components/dashboard-content.tsx)
  — canonical dashboard composition: StatusLine + SectionLabel + dense
  data, format-prefix on repo rows.
- [src/components/layout/app-header.tsx](src/components/layout/app-header.tsx)
  — chrome bar treatment: `> search…` button, `@username` menu trigger,
  `ak://prod` indicator.
- [src/components/layout/app-sidebar.tsx](src/components/layout/app-sidebar.tsx)
  — typographic `[ak]` mark, lowercase nav items, lucide icons for
  scannability.
- [src/app/globals.css](src/app/globals.css) — all design tokens. **Read
  this file before writing any new component.**

---

## 13. Anti-references (do not look here for inspiration)

- shadcn/ui demo site
- Material Design 3 sample apps
- Linear (was a north star pre-refactor — now archived)
- Vercel Dashboard
- Anything labeled "modern SaaS template"
- Anything with a gradient hero
- Anything that opens with "Welcome back, {name}"

If your output looks like one of those, you have failed the brief.
