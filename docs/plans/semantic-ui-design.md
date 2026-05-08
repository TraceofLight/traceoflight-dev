# Semantic UI Core — Design

**Status:** spec
**Companion plan:** `docs/plans/semantic-ui.md`
**Worktree:** `.worktrees/semantic-ui` (branch `feat/semantic-ui`)

## Why

Today the web app has two overlapping UI systems that don't talk to each other:

1. `src/components/ui/` — shadcn-style React primitives (Button, Card, Badge, Dialog, AlertDialog, Input, Label, Select, Separator, Sheet) driven by HSL tokens in `tokens.css`. Used almost exclusively in admin React widgets under `src/components/public/*.tsx`.
2. `src/lib/ui-effects.ts` — 22 named Tailwind utility-string constants (`PUBLIC_SECTION_SURFACE_CLASS`, `PUBLIC_HOVER_CARD_CLASS`, `PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS`, …). Used by every `.astro` page and several `.tsx` widgets. **These are visually similar to the shadcn primitives but hardcode `bg-white/95`, `border-white/80`, `shadow-[0_28px_80px_rgba(15,23,42,0.10)]` etc. — they bypass the token layer entirely.**

The consequences:

- **Dark mode survives via a hack.** `src/styles/base.css:271-301` patches over the hardcoded surfaces with attribute selectors like `[class*='bg-white/96']`, `[class*='shadow-[0_28px_80px']`. Any opacity tweak (`92` → `90`) silently breaks dark mode.
- **No status color tokens.** Warning/danger/info badges use `text-amber-700`, `border-red-200/80`, `text-sky-700` directly — a brand refresh would require touching ~20+ files.
- **Variant explosion.** `PANEL` vs `PANEL_SOFT`, `SECTION` vs `SECTION_STRONG`, `TOP_MEDIA` vs `TOP_MEDIA_PANEL`, `SURFACE_ACTION_CLASS` vs `SURFACE_ACTION_EFFECT_CLASS` — these should be CVA `tone` / `size` variants, not separate exports.
- **Cards are reimplemented in Astro.** `PostCard.astro` builds its own card layout twice (archive vs default) using `PUBLIC_HOVER_CARD_CLASS`, instead of using the React `<Card>` (which it can't, because hydration cost).

## Scale

| Surface | Count |
|---|---|
| Files importing `PUBLIC_*` constants | 33 |
| Total `PUBLIC_*` occurrences | 240 |
| Files with raw color/shadow utilities (`bg-white/N`, `text-{red,amber,sky}-N`, `shadow-[0_...]`) | 27 |
| Files importing shadcn primitives | 14 (all in `components/public/*.tsx`) |
| `.astro` page templates | 57 |
| `.astro` / `.tsx` components | 48 |

## Approach

**One semantic component layer, expressed as CVA recipes (pure class-string functions). Astro and React both consume the same recipes.**

```
┌─────────────────────────────────────────────┐
│  Tokens   src/styles/tokens.css             │
│  ──────                                     │
│  HSL semantic colors, status colors,        │
│  surface/shadow tokens, light + dark        │
└─────────────────────────────────────────────┘
                  ↑
┌─────────────────────────────────────────────┐
│  Recipes  src/lib/ui/recipes.ts             │
│  ───────                                    │
│  cva()-based functions: surface(),          │
│  pill(), action(), field(), mediaFrame(),   │
│  overlay(). Token-driven only.              │
└─────────────────────────────────────────────┘
       ↑                          ↑
┌──────────────┐         ┌─────────────────┐
│ Astro pages  │         │ React wrappers  │
│ class={      │         │ <Surface kind=  │
│   surface({  │         │  "card">…       │
│   kind:"card"│         │ </Surface>      │
│   })}        │         │                 │
└──────────────┘         └─────────────────┘
```

Why CVA recipes (not React-only components):

- Astro pages would need `client:` directives to use React-only primitives — paying SSR + hydration cost for a static `<Card>` is wrong.
- Class strings work identically in `class={…}` (Astro) and `className={…}` (React).
- React wrappers stay thin (`<Surface kind="card" {...rest}>` → `<div className={surface({ kind: "card" })} {...rest}>`).

## Token Schema (additions)

`src/styles/tokens.css` already has: `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius{,-sm,-md,-lg,-xl}`. Add:

### Status colors

```css
--success: 142 71% 38%;
--success-foreground: 0 0% 100%;
--success-soft: 142 76% 92%;
--warning: 38 92% 48%;
--warning-foreground: 0 0% 100%;
--warning-soft: 48 96% 89%;
--info: 212 100% 59%;          /* alias of --primary in light */
--info-foreground: 210 40% 99%;
--info-soft: 208 100% 96%;
```

Dark variants shift lightness only; hue/saturation track light. Use `--success-soft` etc. for badge backgrounds where today `bg-amber-500/10` etc. are used.

### Surface tokens

The visual difference between the current `bg-white/88`, `bg-white/92`, `bg-white/95`, `bg-slate-100/88` is "how strong is this surface against the page background". Encode that as 3 levels:

```css
--surface: 0 0% 100% / 0.92;       /* default panels */
--surface-strong: 0 0% 100% / 0.96; /* hovered cards / modals */
--surface-soft: 0 0% 100% / 0.88;   /* subdued chips / fields */
--surface-border: 0 0% 100% / 0.80;
```

In dark theme these become tinted-slate at appropriate opacities.

### Elevation tokens

The hardcoded shadows `shadow-[0_10px_30px_rgba(15,23,42,0.06)]`, `shadow-[0_24px_60px_rgba(15,23,42,0.08)]`, `shadow-[0_28px_80px_rgba(15,23,42,0.10)]` collapse to:

```css
--shadow-pill: 0 10px 30px rgba(15, 23, 42, 0.08);
--shadow-card: 0 24px 60px rgba(15, 23, 42, 0.08);
--shadow-card-hover: 0 38px 90px rgba(15, 23, 42, 0.14);
--shadow-modal: 0 32px 80px rgba(15, 23, 42, 0.18);
```

Dark variants use `rgba(2, 6, 23, ...)` with higher opacity (matches the current dark-mode override block).

## Recipe API

`src/lib/ui/recipes.ts` exports:

```ts
export const surface: (opts?: {
  kind?: "section" | "panel" | "card" | "media" | "empty";   // shape
  tone?: "default" | "strong" | "soft";                       // contrast
  interactive?: boolean;                                      // adds hover lift
  className?: string;
}) => string;

export const mediaFrame: (opts?: {
  aspect?: "3/2" | "16/9" | "square";
  className?: string;
}) => string;

export const action: (opts?: {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "link"
          | "primaryOutline" | "dangerOutline" | "surface" | "danger";
  size?: "sm" | "md" | "lg" | "icon" | "pill";
  className?: string;
}) => string;

export const pill: (opts?: {
  active?: boolean;
  className?: string;
}) => string;

export const field: (opts?: {
  kind?: "input" | "frame" | "display";
  className?: string;
}) => string;

export const overlay: (opts?: {
  kind?: "popover" | "modal-overlay" | "modal-surface" | "modal-close";
  className?: string;
}) => string;

export const statusBadge: (opts?: {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md";
  className?: string;
}) => string;
```

Each maps to existing constants like:

| Recipe call | Replaces |
|---|---|
| `surface({ kind: "section" })` | `PUBLIC_SECTION_SURFACE_CLASS` |
| `surface({ kind: "section", tone: "strong" })` | `PUBLIC_SECTION_SURFACE_STRONG_CLASS` |
| `surface({ kind: "panel" })` | `PUBLIC_PANEL_SURFACE_CLASS` |
| `surface({ kind: "panel", tone: "soft" })` | `PUBLIC_PANEL_SURFACE_SOFT_CLASS` |
| `surface({ kind: "card" })` | `PUBLIC_CARD_SURFACE_CLASS` |
| `surface({ kind: "card", interactive: true })` | `PUBLIC_HOVER_CARD_CLASS` |
| `surface({ kind: "media" })` | `PUBLIC_TOP_MEDIA_SURFACE_CLASS` |
| `surface({ kind: "empty" })` | `PUBLIC_EMPTY_STATE_CLASS` |
| `mediaFrame()` | `PUBLIC_MEDIA_FRAME_CLASS` |
| `field({ kind: "input" })` | `PUBLIC_FIELD_SURFACE_CLASS` |
| `field({ kind: "frame" })` | `PUBLIC_FIELD_FRAME_CLASS` |
| `field({ kind: "display" })` | `PUBLIC_FIELD_DISPLAY_CLASS` |
| `overlay({ kind: "popover" })` | `PUBLIC_POPOVER_SURFACE_CLASS` |
| `overlay({ kind: "modal-overlay" })` | `PUBLIC_MODAL_OVERLAY_CLASS` |
| `overlay({ kind: "modal-surface" })` | `PUBLIC_MODAL_SURFACE_CLASS` |
| `overlay({ kind: "modal-close" })` | `PUBLIC_MODAL_CLOSE_CLASS` |
| `action({ variant: "surface" })` | `PUBLIC_SURFACE_ACTION_CLASS` |
| `action({ variant: "primaryOutline" })` | `PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS` |
| `action({ variant: "dangerOutline" })` | `PUBLIC_DANGER_OUTLINE_ACTION_CLASS` |
| `action({ variant: "surface", size: "icon" })` | `PUBLIC_ICON_ACTION_CLASS` |
| `action({ variant: "dangerOutline", size: "pill" })` | `DANGER_PILL_ACTION_CLASS` |
| `pill({ active: true })` | `PUBLIC_NAV_ACTIVE_PILL_CLASS` |
| `pill()` | `PUBLIC_PILL_CLASS` |
| `statusBadge()` | `PUBLIC_BADGE_CLASS` |
| `statusBadge({ size: "md" })` | `PUBLIC_BADGE_STRONG_CLASS` |

**Crucial constraint:** recipe outputs MUST use only token-backed Tailwind utilities — `bg-card`, `bg-surface`, `border-surface-border`, `shadow-card`, `text-success`, etc. **No `bg-white/N`, no `text-{red,amber,sky}-N`, no inline `shadow-[0_...]`.** The `surface-*` and `shadow-*` utilities are added via Tailwind 4's CSS-variable-driven `@theme` block, so they're available globally.

## React Wrappers

Thin wrappers in `src/components/ui/`:

```tsx
// surface.tsx
export function Surface({ kind, tone, interactive, className, ...props }) {
  return <div className={cn(surface({ kind, tone, interactive }), className)} {...props} />;
}

// pill.tsx, icon-button.tsx, media-frame.tsx, field.tsx — same pattern
```

Existing primitives keep their public API but reroute internals:

- `<Card>` → uses `surface({ kind: "card" })` instead of `rounded-xl border bg-card text-card-foreground shadow-sm`
- `<Button>` → keeps current variants but the class strings come from `action({ variant, size })`
- `<Badge>` → adds `success` / `warning` / `info` variants via `statusBadge`

## Migration Philosophy

1. **No visual regressions on the pilot.** The initial recipe outputs match the existing `PUBLIC_*` strings closely enough that `PostCard.astro` looks identical before and after.
2. **One file at a time.** Replace `PUBLIC_*` import + usage in a file; commit; move on. Don't bundle changes across unrelated files.
3. **Dark-mode hack stays until last.** Removing `[class*='bg-white/...']` from `base.css` only when **all** consumer files have moved off raw color utilities.
4. **`ui-effects.ts` deleted at the end.** Until then, both old constants and new recipes coexist — the old constants don't break.

## Out of Scope

- Markdown/prose styling (`markdown-prose` class, hljs themes) — keep as-is.
- Milkdown writer surfaces (`writer.css`, `--writer-*` tokens) — keep as-is, this is its own visual world.
- Layout primitives (`Container`, `Stack`, `Inline`) — current `flex gap-…` inline usage is already terse; abstracting it now is YAGNI.
- New design language / brand refresh — this PR preserves the current look, only restructures it.

## Risks

| Risk | Mitigation |
|---|---|
| Pixel drift between old and new surfaces | Pilot with `PostCard.astro`; do side-by-side dev comparison before approving the recipe API |
| `[class*=...]` dark hack interacts with mid-migration files | Keep `bg-white/N` selectors valid until all consumers migrate; don't delete the block early |
| Tailwind 4 `@theme` block doesn't expose CSS variables to arbitrary utilities | Verified — Tailwind 4 supports custom theme keys via `@theme inline`; fallback is CSS-only utilities (`.shadow-card { box-shadow: var(--shadow-card); }`) |
| Astro tree-shaking + recipe imports add bundle size | Recipes are pure functions — bundlers tree-shake unused variants; total CVA + tailwind-merge is already shipped |
| 240-occurrence migration is too large to ship in one PR | Plan splits into ~10 commits along feature/page boundaries; each is independently reviewable |
