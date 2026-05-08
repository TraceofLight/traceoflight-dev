# Semantic UI Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the parallel "shadcn primitives + `ui-effects.ts` strings" UI vocabulary with one token-driven recipe layer that Astro pages and React components both consume. Eliminate the dark-mode `[class*='bg-white/...']` hack in `base.css` along the way.

**Architecture:** CVA recipes (pure class-string functions) live in `src/lib/ui/recipes.ts` and are token-backed only — no raw `bg-white/N`, no inline `shadow-[0_...]`. React wrappers in `src/components/ui/` are 5-line shells over the same recipes. Astro pages consume recipes as `class={surface({ kind: "card" })}`. New status / surface / shadow tokens land in `tokens.css` first; consumer migration moves file-by-file; `base.css` dark-mode hack is removed only after all consumers are off raw utilities; `ui-effects.ts` is deleted last.

**Tech Stack:** Tailwind 4 (`@theme inline`), `class-variance-authority` 0.7, `clsx`, `tailwind-merge` 3, Radix UI (existing), Astro 5, React 19, Vitest 4. Spec: `docs/plans/semantic-ui-design.md`.

---

## File Map

**`apps/web/src/styles/` — modify:**
- `apps/web/src/styles/tokens.css` — add `--success/-foreground/-soft`, `--warning/-foreground/-soft`, `--info/-foreground/-soft`, `--surface/-strong/-soft/-border`, `--shadow-{pill,card,card-hover,modal}` (light + dark).
- `apps/web/src/styles/global.css` — add `@theme inline` block exposing the new tokens to Tailwind utilities.
- `apps/web/src/styles/base.css` — at the end of plan, delete the `[class*='bg-white/...']` block (Task 9).

**`apps/web/src/lib/ui/` — create:**
- `apps/web/src/lib/ui/recipes.ts` — `surface`, `mediaFrame`, `action`, `pill`, `field`, `overlay`, `statusBadge`.
- `apps/web/src/lib/ui/index.ts` — re-exports.

**`apps/web/src/components/ui/` — create:**
- `apps/web/src/components/ui/surface.tsx`
- `apps/web/src/components/ui/media-frame.tsx`
- `apps/web/src/components/ui/icon-button.tsx`
- `apps/web/src/components/ui/pill.tsx`
- `apps/web/src/components/ui/field.tsx`

**`apps/web/src/components/ui/` — modify:**
- `apps/web/src/components/ui/button.tsx` — internals → `action()`.
- `apps/web/src/components/ui/card.tsx` — internals → `surface({ kind: "card" })`.
- `apps/web/src/components/ui/badge.tsx` — add `success`/`warning`/`info` tones via `statusBadge`.

**`apps/web/src/components/` and `apps/web/src/pages/` — modify:**
- 33 files importing `PUBLIC_*` from `ui-effects.ts` (see migration tasks).
- 27 files using raw color/shadow utilities (overlapping set).

**`apps/web/src/lib/ui-effects.ts` — delete (Task 10).**

**`apps/web/tests/ui/` — create:**
- `apps/web/tests/ui/recipes.test.ts` — recipe output asserts.
- `apps/web/tests/ui/surface.test.tsx` — wrapper smoke tests.

---

## Task 0: Add semantic tokens

**Goal:** Extend `tokens.css` with status, surface, and shadow tokens (light + dark) and expose them to Tailwind via `@theme inline`. After this task, utilities like `bg-surface`, `text-success`, `shadow-card` exist and resolve correctly under both themes.

**Files:**
- Modify: `apps/web/src/styles/tokens.css`
- Modify: `apps/web/src/styles/global.css` (add `@theme inline`)
- Create: `apps/web/tests/ui/tokens.test.ts`

**Acceptance Criteria:**
- [ ] `tokens.css` exports `--success`, `--success-foreground`, `--success-soft`, same for `warning` and `info`.
- [ ] `tokens.css` exports `--surface`, `--surface-strong`, `--surface-soft`, `--surface-border`.
- [ ] `tokens.css` exports `--shadow-pill`, `--shadow-card`, `--shadow-card-hover`, `--shadow-modal`.
- [ ] All new tokens have light AND dark variants.
- [ ] `global.css` `@theme inline` block maps the new tokens so `bg-surface`, `bg-success`, `text-success-foreground`, `shadow-card`, `border-surface-border` are valid Tailwind utilities.
- [ ] `bun run typecheck` passes.

**Verify:** `cd apps/web && bun run typecheck` → 0 errors

**Steps:**

- [ ] **Step 1: Write failing token-presence test**

Create `apps/web/tests/ui/tokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("tokens.css", () => {
  const css = readFileSync(
    resolve(__dirname, "../../src/styles/tokens.css"),
    "utf8",
  );

  const expected = [
    "--success:",
    "--success-foreground:",
    "--success-soft:",
    "--warning:",
    "--warning-foreground:",
    "--warning-soft:",
    "--info:",
    "--info-foreground:",
    "--info-soft:",
    "--surface:",
    "--surface-strong:",
    "--surface-soft:",
    "--surface-border:",
    "--shadow-pill:",
    "--shadow-card:",
    "--shadow-card-hover:",
    "--shadow-modal:",
  ];

  it.each(expected)("declares %s in :root", (token) => {
    const root = css.match(/:root\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(root).toContain(token);
  });

  it.each(expected)("redeclares %s in :root[data-theme='dark']", (token) => {
    const dark = css.match(/:root\[data-theme=['"]dark['"]\]\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(dark).toContain(token);
  });
});
```

Run: `cd apps/web && bun x vitest run tests/ui/tokens.test.ts`
Expected: FAIL (tokens absent).

- [ ] **Step 2: Add tokens to `tokens.css` `:root` block**

Append inside the existing `:root { ... }` block (before the closing `}` at line 38):

```css
  --success: 142 71% 38%;
  --success-foreground: 0 0% 100%;
  --success-soft: 142 76% 92%;
  --warning: 38 92% 48%;
  --warning-foreground: 0 0% 100%;
  --warning-soft: 48 96% 89%;
  --info: 212 100% 59%;
  --info-foreground: 210 40% 99%;
  --info-soft: 208 100% 96%;
  --surface: 0 0% 100% / 0.92;
  --surface-strong: 0 0% 100% / 0.96;
  --surface-soft: 0 0% 100% / 0.88;
  --surface-border: 0 0% 100% / 0.80;
  --shadow-pill: 0 10px 30px rgba(15, 23, 42, 0.08);
  --shadow-card: 0 24px 60px rgba(15, 23, 42, 0.08);
  --shadow-card-hover: 0 38px 90px rgba(15, 23, 42, 0.14);
  --shadow-modal: 0 32px 80px rgba(15, 23, 42, 0.18);
```

- [ ] **Step 3: Add tokens to dark block**

Append inside `:root[data-theme='dark'] { ... }`:

```css
  --success: 142 60% 50%;
  --success-foreground: 222 47% 7%;
  --success-soft: 142 50% 18%;
  --warning: 38 92% 60%;
  --warning-foreground: 222 47% 7%;
  --warning-soft: 38 60% 22%;
  --info: 205 100% 66%;
  --info-foreground: 222 47% 7%;
  --info-soft: 208 50% 22%;
  --surface: 222 38% 11% / 0.90;
  --surface-strong: 222 38% 11% / 0.96;
  --surface-soft: 222 38% 11% / 0.78;
  --surface-border: 215 20% 32% / 0.40;
  --shadow-pill: 0 10px 30px rgba(2, 6, 23, 0.40);
  --shadow-card: 0 24px 60px rgba(2, 6, 23, 0.38);
  --shadow-card-hover: 0 38px 90px rgba(2, 6, 23, 0.50);
  --shadow-modal: 0 32px 80px rgba(2, 6, 23, 0.55);
```

- [ ] **Step 4: Expose tokens to Tailwind via `@theme inline`**

Edit `apps/web/src/styles/global.css`. After the existing `@import` lines, append:

```css
@theme inline {
  --color-success: hsl(var(--success));
  --color-success-foreground: hsl(var(--success-foreground));
  --color-success-soft: hsl(var(--success-soft));
  --color-warning: hsl(var(--warning));
  --color-warning-foreground: hsl(var(--warning-foreground));
  --color-warning-soft: hsl(var(--warning-soft));
  --color-info: hsl(var(--info));
  --color-info-foreground: hsl(var(--info-foreground));
  --color-info-soft: hsl(var(--info-soft));
  --color-surface: hsl(var(--surface));
  --color-surface-strong: hsl(var(--surface-strong));
  --color-surface-soft: hsl(var(--surface-soft));
  --color-surface-border: hsl(var(--surface-border));
  --shadow-pill: var(--shadow-pill);
  --shadow-card: var(--shadow-card);
  --shadow-card-hover: var(--shadow-card-hover);
  --shadow-modal: var(--shadow-modal);
}
```

- [ ] **Step 5: Re-run test**

Run: `cd apps/web && bun x vitest run tests/ui/tokens.test.ts`
Expected: PASS (all 34 it.each cases — 17 tokens × 2 themes).

- [ ] **Step 6: Verify build still works**

Run: `cd apps/web && bun run typecheck`
Expected: 0 errors.

Run: `cd apps/web && bun run build 2>&1 | tail -20`
Expected: build succeeds, no token-related warnings.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/styles/tokens.css apps/web/src/styles/global.css apps/web/tests/ui/tokens.test.ts
git commit -m "feat(ui): add semantic status/surface/shadow tokens"
```

---

## Task 1: Build recipe module

**Goal:** Create `src/lib/ui/recipes.ts` exporting `surface`, `mediaFrame`, `action`, `pill`, `field`, `overlay`, `statusBadge` as CVA functions. Outputs use only token-backed utilities (`bg-surface`, `shadow-card`, `text-success`, etc.) — no raw `bg-white/N`, no `shadow-[0_...]`. Each recipe matches the visual intent of an existing `PUBLIC_*` constant.

**Files:**
- Create: `apps/web/src/lib/ui/recipes.ts`
- Create: `apps/web/src/lib/ui/index.ts`
- Create: `apps/web/tests/ui/recipes.test.ts`

**Acceptance Criteria:**
- [ ] All 7 recipes exported with the signatures from `semantic-ui-design.md`.
- [ ] `recipes.test.ts` asserts that no recipe output contains the strings `bg-white/`, `bg-slate-`, `border-white/`, or `shadow-[`.
- [ ] `recipes.test.ts` asserts each existing `PUBLIC_*` constant has a corresponding recipe call documented in a mapping table.
- [ ] `bun run typecheck` passes.
- [ ] `bun x vitest run tests/ui/recipes.test.ts` passes.

**Verify:** `cd apps/web && bun x vitest run tests/ui/recipes.test.ts` → all green

**Steps:**

- [ ] **Step 1: Write failing recipe test**

Create `apps/web/tests/ui/recipes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  action,
  field,
  mediaFrame,
  overlay,
  pill,
  statusBadge,
  surface,
} from "../../src/lib/ui/recipes";

const FORBIDDEN = [/bg-white\//, /bg-slate-\d/, /border-white\//, /shadow-\[/];

const ALL_OUTPUTS = [
  surface(),
  surface({ kind: "section" }),
  surface({ kind: "section", tone: "strong" }),
  surface({ kind: "panel" }),
  surface({ kind: "panel", tone: "soft" }),
  surface({ kind: "card" }),
  surface({ kind: "card", interactive: true }),
  surface({ kind: "media" }),
  surface({ kind: "empty" }),
  mediaFrame(),
  mediaFrame({ aspect: "16/9" }),
  action({ variant: "primary" }),
  action({ variant: "primaryOutline" }),
  action({ variant: "dangerOutline" }),
  action({ variant: "surface" }),
  action({ variant: "surface", size: "icon" }),
  action({ variant: "dangerOutline", size: "pill" }),
  pill(),
  pill({ active: true }),
  field(),
  field({ kind: "frame" }),
  field({ kind: "display" }),
  overlay({ kind: "popover" }),
  overlay({ kind: "modal-overlay" }),
  overlay({ kind: "modal-surface" }),
  overlay({ kind: "modal-close" }),
  statusBadge(),
  statusBadge({ tone: "success" }),
  statusBadge({ tone: "warning" }),
  statusBadge({ tone: "danger" }),
  statusBadge({ tone: "info" }),
];

describe("recipes", () => {
  it.each(ALL_OUTPUTS)("output %# uses no raw color/shadow utilities", (out) => {
    for (const pattern of FORBIDDEN) {
      expect(out).not.toMatch(pattern);
    }
  });

  it("surface(card, interactive) includes hover lift", () => {
    expect(surface({ kind: "card", interactive: true })).toMatch(/hover:-translate-y/);
  });

  it("statusBadge(success) uses --success token", () => {
    expect(statusBadge({ tone: "success" })).toMatch(/(bg-success|text-success)/);
  });

  it("action(icon) is square", () => {
    const out = action({ variant: "surface", size: "icon" });
    expect(out).toMatch(/h-10/);
    expect(out).toMatch(/w-10/);
  });
});
```

Run: `cd apps/web && bun x vitest run tests/ui/recipes.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement `recipes.ts`**

Create `apps/web/src/lib/ui/recipes.ts`:

```ts
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const surface = cva(
  "border border-surface-border bg-surface text-card-foreground",
  {
    variants: {
      kind: {
        section: "rounded-[2.25rem] shadow-card",
        panel: "rounded-[1.75rem] shadow-card",
        card: "rounded-[2rem] shadow-card",
        media: "rounded-[2.5rem] shadow-card",
        empty: "rounded-3xl border-dashed shadow-card bg-surface-soft",
      },
      tone: {
        default: "",
        strong: "bg-surface-strong",
        soft: "bg-surface-soft",
      },
      interactive: {
        true: "transition duration-300 hover:-translate-y-2 hover:bg-surface-strong hover:shadow-card-hover",
        false: "",
      },
    },
    defaultVariants: {
      kind: "panel",
      tone: "default",
      interactive: false,
    },
  },
);

export const mediaFrame = cva(
  "relative overflow-hidden rounded-[1.5rem] bg-surface-soft",
  {
    variants: {
      aspect: {
        "3/2": "aspect-[3/2]",
        "16/9": "aspect-[16/9]",
        square: "aspect-square",
      },
    },
    defaultVariants: { aspect: "3/2" },
  },
);

const actionBase =
  "inline-flex select-none items-center gap-2 whitespace-nowrap font-medium transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export const action = cva(actionBase, {
  variants: {
    variant: {
      primary: "rounded-full bg-primary text-primary-foreground shadow-pill hover:bg-primary/92",
      secondary: "rounded-full bg-surface text-secondary-foreground shadow-pill hover:bg-surface-strong",
      outline: "rounded-full border border-surface-border bg-surface text-foreground shadow-pill hover:bg-surface-strong",
      ghost: "rounded-full text-muted-foreground hover:bg-surface hover:text-foreground",
      link: "text-primary underline-offset-4 hover:underline",
      surface: "rounded-full border border-surface-border bg-surface-soft text-muted-foreground shadow-pill hover:-translate-y-0.5 hover:bg-surface-strong hover:text-foreground",
      primaryOutline: "rounded-full border border-info-soft bg-surface-strong text-primary shadow-pill hover:-translate-y-0.5 hover:border-info hover:bg-info-soft",
      dangerOutline: "rounded-full border border-destructive/30 bg-surface text-destructive shadow-pill hover:-translate-y-0.5 hover:border-destructive/60 hover:bg-warning-soft",
      danger: "rounded-full bg-destructive text-destructive-foreground shadow-pill hover:opacity-92",
    },
    size: {
      sm: "h-9 px-4 text-xs",
      md: "h-10 px-5 py-2.5 text-sm",
      lg: "h-11 px-8 text-sm",
      icon: "h-10 w-10 justify-center",
      pill: "px-2.5 py-1 text-xs leading-none",
    },
  },
  defaultVariants: { variant: "primary", size: "md" },
});

export const pill = cva(
  "inline-flex select-none items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium uppercase tracking-[0.18em]",
  {
    variants: {
      active: {
        true: "border-surface-border bg-surface text-foreground shadow-pill",
        false: "border-surface-border bg-surface-soft text-muted-foreground shadow-pill",
      },
    },
    defaultVariants: { active: false },
  },
);

export const field = cva("border border-surface-border", {
  variants: {
    kind: {
      input: "flex h-11 w-full rounded-2xl bg-surface px-4 py-2 shadow-card",
      frame: "rounded-2xl bg-surface-strong p-1 shadow-card",
      display: "rounded-[1.25rem] bg-surface-soft px-4 py-3 text-sm text-muted-foreground shadow-[inset_0_1px_0_hsl(var(--surface-strong))]",
    },
  },
  defaultVariants: { kind: "input" },
});

export const overlay = cva("", {
  variants: {
    kind: {
      popover: "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-[1.5rem] border border-surface-border bg-surface-strong text-popover-foreground shadow-modal backdrop-blur-xl",
      "modal-overlay": "fixed inset-0 z-50 bg-foreground/16 backdrop-blur-sm",
      "modal-surface": "border border-surface-border bg-surface-strong text-foreground shadow-modal backdrop-blur-xl",
      "modal-close": "absolute right-4 top-4 rounded-full border border-surface-border bg-surface p-1.5 opacity-70 shadow-pill transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    },
  },
});

export const statusBadge = cva(
  "inline-flex select-none items-center gap-2 rounded-full border",
  {
    variants: {
      tone: {
        neutral: "border-surface-border bg-surface-soft text-muted-foreground",
        success: "border-success/30 bg-success-soft text-success",
        warning: "border-warning/30 bg-warning-soft text-warning",
        danger: "border-destructive/30 bg-destructive/10 text-destructive",
        info: "border-info/30 bg-info-soft text-info",
      },
      size: {
        sm: "px-2.5 py-1 text-xs",
        md: "px-3 py-1.5 text-xs font-medium",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

export type SurfaceProps = Parameters<typeof surface>[0] & { className?: string };
export type ActionProps = Parameters<typeof action>[0] & { className?: string };
```

- [ ] **Step 3: Add barrel re-export**

Create `apps/web/src/lib/ui/index.ts`:

```ts
export { action, field, mediaFrame, overlay, pill, statusBadge, surface } from "./recipes";
export type { ActionProps, SurfaceProps } from "./recipes";
```

- [ ] **Step 4: Re-run test**

Run: `cd apps/web && bun x vitest run tests/ui/recipes.test.ts`
Expected: PASS — all 35+ assertions green.

- [ ] **Step 5: Run typecheck and full UI suite**

Run: `cd apps/web && bun run typecheck`
Expected: 0 errors.

Run: `cd apps/web && bun run test:ui`
Expected: 31 existing tests + new recipes tests + tokens tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/ui/recipes.ts apps/web/src/lib/ui/index.ts apps/web/tests/ui/recipes.test.ts
git commit -m "feat(ui): add token-driven UI recipe module"
```

---

## Task 2: React component wrappers

**Goal:** Add thin React wrappers over recipes (`Surface`, `MediaFrame`, `IconButton`, `Pill`, `Field`) and reroute existing primitives (`Button`, `Card`, `Badge`) through recipes — preserving public APIs.

**Files:**
- Create: `apps/web/src/components/ui/surface.tsx`
- Create: `apps/web/src/components/ui/media-frame.tsx`
- Create: `apps/web/src/components/ui/icon-button.tsx`
- Create: `apps/web/src/components/ui/pill.tsx`
- Create: `apps/web/src/components/ui/field.tsx`
- Modify: `apps/web/src/components/ui/button.tsx`
- Modify: `apps/web/src/components/ui/card.tsx`
- Modify: `apps/web/src/components/ui/badge.tsx`
- Create: `apps/web/tests/ui/wrappers.test.tsx`

**Acceptance Criteria:**
- [ ] Each new wrapper is a `React.forwardRef` with `className` prop merged via `cn()`.
- [ ] `Button` keeps its `variant`/`size` API; class strings come from `action()`.
- [ ] `Card` keeps `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter` exports; `Card` root uses `surface({ kind: "card" })`.
- [ ] `Badge` adds `success`/`warning`/`info` variants on top of existing `default`/`secondary`/`destructive`/`outline`.
- [ ] All existing UI tests (31) still pass.

**Verify:** `cd apps/web && bun run test:ui` → 0 failures

**Steps:**

- [ ] **Step 1: Write failing wrapper smoke test**

Create `apps/web/tests/ui/wrappers.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Field } from "../../src/components/ui/field";
import { IconButton } from "../../src/components/ui/icon-button";
import { MediaFrame } from "../../src/components/ui/media-frame";
import { Pill } from "../../src/components/ui/pill";
import { Surface } from "../../src/components/ui/surface";

describe("ui wrappers", () => {
  it("Surface renders as div with card recipe classes", () => {
    render(<Surface kind="card" data-testid="s">child</Surface>);
    const el = screen.getByTestId("s");
    expect(el).toHaveClass("rounded-[2rem]");
    expect(el).toHaveClass("bg-surface");
  });

  it("MediaFrame applies aspect", () => {
    render(<MediaFrame aspect="16/9" data-testid="m" />);
    expect(screen.getByTestId("m")).toHaveClass("aspect-[16/9]");
  });

  it("IconButton is square h-10/w-10", () => {
    render(<IconButton aria-label="x" data-testid="b" />);
    const el = screen.getByTestId("b");
    expect(el).toHaveClass("h-10");
    expect(el).toHaveClass("w-10");
  });

  it("Pill active uses surface bg", () => {
    render(<Pill active data-testid="p">x</Pill>);
    expect(screen.getByTestId("p")).toHaveClass("bg-surface");
  });

  it("Field display uses display kind", () => {
    render(<Field kind="display" data-testid="f">v</Field>);
    expect(screen.getByTestId("f")).toHaveClass("rounded-[1.25rem]");
  });
});
```

Run: `cd apps/web && bun x vitest run tests/ui/wrappers.test.tsx`
Expected: FAIL (modules missing).

- [ ] **Step 2: Create wrapper components**

Create `apps/web/src/components/ui/surface.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";
import { surface, type SurfaceProps as RecipeProps } from "@/lib/ui/recipes";

type Props = React.HTMLAttributes<HTMLDivElement> & RecipeProps;

export const Surface = React.forwardRef<HTMLDivElement, Props>(
  ({ kind, tone, interactive, className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(surface({ kind, tone, interactive }), className)}
      {...rest}
    />
  ),
);
Surface.displayName = "Surface";
```

Create `apps/web/src/components/ui/media-frame.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";
import { mediaFrame } from "@/lib/ui/recipes";

type Aspect = "3/2" | "16/9" | "square";
type Props = React.HTMLAttributes<HTMLDivElement> & { aspect?: Aspect };

export const MediaFrame = React.forwardRef<HTMLDivElement, Props>(
  ({ aspect, className, ...rest }, ref) => (
    <div ref={ref} className={cn(mediaFrame({ aspect }), className)} {...rest} />
  ),
);
MediaFrame.displayName = "MediaFrame";
```

Create `apps/web/src/components/ui/icon-button.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";
import { action } from "@/lib/ui/recipes";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "surface" | "danger" | "primaryOutline" | "dangerOutline";
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export const IconButton = React.forwardRef<HTMLButtonElement, Props>(
  ({ variant = "surface", className, type = "button", ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(action({ variant, size: "icon" }), className)}
      {...rest}
    />
  ),
);
IconButton.displayName = "IconButton";
```

Create `apps/web/src/components/ui/pill.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";
import { pill } from "@/lib/ui/recipes";

type Props = React.HTMLAttributes<HTMLSpanElement> & { active?: boolean };

export const Pill = React.forwardRef<HTMLSpanElement, Props>(
  ({ active, className, ...rest }, ref) => (
    <span ref={ref} className={cn(pill({ active }), className)} {...rest} />
  ),
);
Pill.displayName = "Pill";
```

Create `apps/web/src/components/ui/field.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";
import { field } from "@/lib/ui/recipes";

type Kind = "input" | "frame" | "display";
type Props = React.HTMLAttributes<HTMLDivElement> & { kind?: Kind };

export const Field = React.forwardRef<HTMLDivElement, Props>(
  ({ kind, className, ...rest }, ref) => (
    <div ref={ref} className={cn(field({ kind }), className)} {...rest} />
  ),
);
Field.displayName = "Field";
```

- [ ] **Step 3: Reroute Button through recipe**

Edit `apps/web/src/components/ui/button.tsx`. Replace the `cva(...)` block with:

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { action } from "@/lib/ui/recipes";

export const buttonVariants = action;

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof action> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(action({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
```

Note: `default` variant in old code → use `primary` going forward; but to preserve callers, add `default: "primary"` mapping. Actually keep the API identical — verify caller usage in Step 5.

**Caller-compat check:** grep for `<Button variant="default"` or `buttonVariants({ variant: "default"`. If any → keep a `default` alias in recipe. If none → no compat shim needed.

Run: `cd apps/web && grep -rn 'variant=\"default\"' src/components/public src/components/ui src/components/admin 2>&1 | head` → list usages.
If non-empty: edit `recipes.ts` to add `default` alias under `action` variants matching the old default style (`bg-primary ...`).

- [ ] **Step 4: Reroute Card through recipe**

Edit `apps/web/src/components/ui/card.tsx`. Replace the `Card` root with:

```tsx
import * as React from "react";

import { cn } from "@/lib/utils";
import { surface } from "@/lib/ui/recipes";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(surface({ kind: "card" }), className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

// CardHeader / CardTitle / CardDescription / CardContent / CardFooter unchanged
```

(Keep the rest of `card.tsx` as-is — only the `Card` root changes.)

- [ ] **Step 5: Add status tones to Badge**

Edit `apps/web/src/components/ui/badge.tsx`. Replace the variants block:

```tsx
const badgeVariants = cva(
  "inline-flex select-none items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        success: "border-success/30 bg-success-soft text-success",
        warning: "border-warning/30 bg-warning-soft text-warning",
        info: "border-info/30 bg-info-soft text-info",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
```

- [ ] **Step 6: Run wrapper test + full UI suite**

Run: `cd apps/web && bun run test:ui`
Expected: 31 existing + 5 new wrapper + tokens + recipes all pass.

Run: `cd apps/web && bun run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/ui/ apps/web/tests/ui/wrappers.test.tsx
git commit -m "feat(ui): add semantic component wrappers, reroute Button/Card/Badge through recipes"
```

---

## Task 3: Pilot migration — PostCard.astro

**Goal:** Migrate `PostCard.astro` to use the new recipe layer. Deduplicate the archive vs default branches (currently ~70 lines of near-duplicate JSX). Visual output unchanged in both light and dark mode.

**Files:**
- Modify: `apps/web/src/components/PostCard.astro`

**Acceptance Criteria:**
- [ ] No imports from `@/lib/ui-effects` remain in `PostCard.astro`.
- [ ] No raw `bg-white/N`, `border-white/N`, `bg-slate-N` in `PostCard.astro`.
- [ ] Archive and default variants share one JSX block; differ only in metadata row position.
- [ ] Dev server (`bun run dev`) renders post cards identically (manual diff).
- [ ] `bun run test:ui` passes.

**Verify:** `cd apps/web && bun run dev` → load `/ko/blog/`, visually compare cards before/after.

**Steps:**

- [ ] **Step 1: Read current `PostCard.astro` to confirm logic**

Re-read file before editing — specifically the archive vs default branches and how `showVisibility` / metadata row differ.

- [ ] **Step 2: Replace imports**

In `apps/web/src/components/PostCard.astro` frontmatter, replace:

```astro
import {
  PUBLIC_HOVER_CARD_CLASS,
  PUBLIC_MEDIA_FRAME_CLASS,
} from "../lib/ui-effects";
```

with:

```astro
import { mediaFrame, surface, statusBadge } from "../lib/ui";
```

- [ ] **Step 3: Replace class string locals**

Replace:

```astro
const mediaFrameClass = PUBLIC_MEDIA_FRAME_CLASS;
const anchorClass = `flex h-full flex-col p-3 ${PUBLIC_HOVER_CARD_CLASS}`;
```

with:

```astro
const mediaFrameClass = mediaFrame();
const anchorClass = `flex h-full flex-col p-3 ${surface({ kind: "card", interactive: true })}`;
const tagPillClass = statusBadge({ tone: "neutral", size: "sm" });
const privatePillClass = `${statusBadge({ tone: "warning", size: "sm" })} text-[0.72rem] font-medium`;
```

- [ ] **Step 4: Replace inline tag pill**

Replace both `<span class="rounded-full border border-white/80 bg-slate-100/88 px-2.5 py-0.5 text-[0.72rem] font-medium text-muted-foreground">` (occurs twice — once per branch) with `<span class={tagPillClass}>`.

Replace `<span class="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[0.72rem] font-medium text-amber-700">` with `<span class={privatePillClass}>`.

- [ ] **Step 5: Deduplicate archive vs default branches**

Replace the `{ variant === "archive" ? ( <>...</> ) : ( <>...</> ) }` block with a single block that:

1. Renders the anchor + media frame + main content.
2. Uses `variant === "archive"` only inside the metadata section to swap visibility row position (top for archive, top of footer for default).

The two branches differ only in:
- Archive: optional visibility row at top, no inline private badge in metadata.
- Default: no visibility row at top, inline `<Private>` badge in metadata when `showVisibility && visibility === 'private'`.
- Tags: archive places tags in middle, default places tags at bottom (`mt-auto`).

Concrete refactored body (replace lines 68-194):

```astro
<a class={anchorClass} href={localizedPostHref} aria-label={post.title}>
  <div class={mediaFrameClass}>
    {
      post.coverMedia ? (
        <CoverMediaImage
          className="absolute inset-0 !h-full !w-full !max-w-none object-cover object-center transition duration-500 group-hover:scale-[1.06]"
          media={post.coverMedia}
          alt={post.title}
          width={imageWidth}
          height={imageHeight}
          fit="inside"
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
          fallbackSrc={fallbackCoverImageSrc}
        />
      ) : (
        <img
          class="absolute inset-0 block !h-full !w-full !max-w-none object-cover object-center transition duration-500 group-hover:scale-[1.06]"
          src={fallbackCoverImageSrc}
          alt={post.title}
          loading="lazy"
          onerror={coverImageFallbackOnError}
        />
      )
    }
  </div>
  <div class="flex flex-1 flex-col gap-4 px-2 pb-2 pt-5">
    {
      variant === "archive" && showVisibility && (
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{normalizedVisibility === "private" ? t.archiveFilters.privatePost : t.archiveFilters.publicPost}</span>
        </div>
      )
    }
    {
      variant !== "archive" && (
        <p class="flex items-center gap-2 text-xs text-muted-foreground">
          <time datetime={pubDateIso}>{formattedPubDate}</time>
          <span aria-hidden="true">•</span>
          <span>{t.comments.title} {commentCount}{t.archiveFilters.commentCount}</span>
          <span aria-hidden="true">•</span>
          <span>{readingLabel}</span>
          {
            showVisibility && post.visibility === 'private' && (
              <span class={privatePillClass}>Private</span>
            )
          }
        </p>
      )
    }
    <div class="space-y-2">
      <h3 class="text-xl font-semibold tracking-tight">{post.title}</h3>
      <p class="line-clamp-2 text-sm text-muted-foreground">
        {hasDescription ? descriptionText : " "}
      </p>
    </div>
    {
      hasTags && (
        <div class={variant === "archive" ? "flex flex-wrap gap-2" : "mt-auto flex flex-wrap gap-2"}>
          {postTags.map((tag) => (
            <span class={tagPillClass}>{tag}</span>
          ))}
        </div>
      )
    }
    {
      variant === "archive" && (
        <p class="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
          <time datetime={pubDateIso}>{formattedPubDate}</time>
          <span aria-hidden="true">•</span>
          <span>{t.comments.title} {commentCount}{t.archiveFilters.commentCount}</span>
          <span aria-hidden="true">•</span>
          <span>{readingLabel}</span>
        </p>
      )
    }
  </div>
</a>
```

- [ ] **Step 6: Run typecheck + UI tests**

Run: `cd apps/web && bun run typecheck && bun run test:ui`
Expected: both pass.

- [ ] **Step 7: Manual visual check**

Run: `cd apps/web && bun run dev` (background)
Open: `http://localhost:4321/ko/` and `/ko/blog/` — verify cards render identically to main branch.
Open dark mode (`html[data-theme='dark']`) — verify cards still readable.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/PostCard.astro
git commit -m "refactor(ui): migrate PostCard to recipe layer, dedupe archive variant"
```

---

## Task 4: Migrate sibling cards (ProjectCard, SeriesCard)

**Goal:** Apply the same migration pattern to `ProjectCard.astro` and `SeriesCard.astro`. They use `PUBLIC_HOVER_CARD_CLASS` + `PUBLIC_MEDIA_FRAME_CLASS` + raw `border-white/80 bg-slate-100/88` chips — identical shape.

**Files:**
- Modify: `apps/web/src/components/ProjectCard.astro`
- Modify: `apps/web/src/components/SeriesCard.astro`

**Acceptance Criteria:**
- [ ] No imports from `@/lib/ui-effects` in either file.
- [ ] No raw `bg-white/N`, `border-white/N`, `bg-slate-N` in either file.
- [ ] `bun run test:ui` passes.
- [ ] Manual visual parity in `/ko/projects/` and `/ko/series/`.

**Verify:** `cd apps/web && bun run typecheck && bun run test:ui` → 0 failures

**Steps:**

- [ ] **Step 1: Migrate `ProjectCard.astro`**

Replace import block:

```astro
import {
  PUBLIC_HOVER_CARD_CLASS,
  PUBLIC_MEDIA_FRAME_CLASS,
} from "../lib/ui-effects";
```

with:

```astro
import { mediaFrame, statusBadge, surface } from "../lib/ui";
```

Replace local class derivations:

```astro
const mediaFrameClass = mediaFrame();
const anchorClass = `flex h-full flex-col p-3 ${surface({ kind: "card", interactive: true })}`;
const stackPillClass = statusBadge({ tone: "neutral", size: "sm" });
```

Replace inline stack pill `<span class="rounded-full border border-white/80 bg-slate-100/88 ...">` (line 94) with `<span class={stackPillClass}>`.

- [ ] **Step 2: Migrate `SeriesCard.astro`**

Read it first (`Read apps/web/src/components/SeriesCard.astro`) to confirm structure — apply the same import + local + inline-pill replacements.

- [ ] **Step 3: Run tests**

Run: `cd apps/web && bun run typecheck && bun run test:ui`
Expected: 0 failures.

- [ ] **Step 4: Manual check**

Dev server: load `/ko/projects/` and `/ko/series/`, both light + dark.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ProjectCard.astro apps/web/src/components/SeriesCard.astro
git commit -m "refactor(ui): migrate ProjectCard and SeriesCard to recipe layer"
```

---

## Task 5: Migrate header/footer chrome

**Goal:** Migrate the site chrome (`Header.astro`, `Footer.astro`, `HeaderLink.astro`, `FooterIconLink.astro`, `MobileNavSheet.astro`, `LanguageToggle.astro`, `FloatingUtilityButtons.astro`, `FooterAdminModal.astro`) — these account for ~20 `PUBLIC_*` occurrences and contain the admin "DANGER_PILL" buttons in the header.

**Files (modify):**
- `apps/web/src/components/Header.astro`
- `apps/web/src/components/Footer.astro`
- `apps/web/src/components/HeaderLink.astro`
- `apps/web/src/components/FooterIconLink.astro`
- `apps/web/src/components/public/MobileNavSheet.astro`
- `apps/web/src/components/public/LanguageToggle.astro`
- `apps/web/src/components/public/FloatingUtilityButtons.astro`
- `apps/web/src/components/public/FooterAdminModal.astro`

**Acceptance Criteria:**
- [ ] No `PUBLIC_*` or `DANGER_PILL_ACTION_CLASS` imports in these 8 files.
- [ ] All raw `bg-white/N`, `border-white/N` removed (except where intentional translucent header surface — keep `bg-white/78 supports-[backdrop-filter]:bg-white/64` ONLY if no token-driven equivalent exists; in that case, add `--header-surface` token).
- [ ] `bun run test:ui` passes.

**Verify:** `cd apps/web && bun run typecheck && bun run test:ui` → 0 failures

**Steps:**

- [ ] **Step 1: Survey usages**

Run: `cd apps/web && grep -n 'PUBLIC_\|DANGER_PILL\|bg-white/\|border-white/' src/components/Header.astro src/components/Footer.astro src/components/HeaderLink.astro src/components/FooterIconLink.astro src/components/public/MobileNavSheet.astro src/components/public/LanguageToggle.astro src/components/public/FloatingUtilityButtons.astro src/components/public/FooterAdminModal.astro 2>&1`

Note each occurrence so the replacements below are exhaustive.

- [ ] **Step 2: Header.astro**

Replace `import { DANGER_PILL_ACTION_CLASS } from "../lib/ui-effects";` with `import { action } from "../lib/ui";`

Replace `class={DANGER_PILL_ACTION_CLASS}` (2 occurrences in admin/logout buttons) with `class={action({ variant: "dangerOutline", size: "pill" })}`.

The header surface line `class="site-header-surface sticky top-0 z-40 border-b border-white/60 bg-white/78 backdrop-blur-xl supports-[backdrop-filter]:bg-white/64"` — leave as-is; this is page chrome with its own dark-mode override in `base.css` (`.site-header-surface`). Document it as out-of-scope for this PR.

- [ ] **Step 3: Other 7 files**

Apply the recipe mapping table from `semantic-ui-design.md`. Use:
- `surface({ kind: "panel" })` for `PUBLIC_PANEL_SURFACE_CLASS`
- `pill({ active: true })` for `PUBLIC_NAV_ACTIVE_PILL_CLASS`
- `action({ variant: "surface", size: "icon" })` for `PUBLIC_ICON_ACTION_CLASS`
- `overlay({ kind: "popover" })` for `PUBLIC_POPOVER_SURFACE_CLASS`
- `overlay({ kind: "modal-overlay" })` / `overlay({ kind: "modal-surface" })` for the `MODAL_*` constants

For each file, run the same 3-step pattern: replace imports → replace local class derivations → replace inline raw utilities.

- [ ] **Step 4: Run tests + dev**

Run: `cd apps/web && bun run typecheck && bun run test:ui`
Expected: 0 failures.

Dev server: navigate `/`, mobile menu, language toggle, floating utility buttons. Verify both themes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/Header.astro apps/web/src/components/Footer.astro apps/web/src/components/HeaderLink.astro apps/web/src/components/FooterIconLink.astro apps/web/src/components/public/MobileNavSheet.astro apps/web/src/components/public/LanguageToggle.astro apps/web/src/components/public/FloatingUtilityButtons.astro apps/web/src/components/public/FooterAdminModal.astro
git commit -m "refactor(ui): migrate site chrome (header/footer/nav) to recipe layer"
```

---

## Task 6: Migrate layouts and 404

**Goal:** Migrate the layouts (`BlogPost.astro`, `BaseLayout.astro`) and the 404 page. These are large files (BlogPost is 328 lines) and have ~7 `PUBLIC_*` references plus inline color utilities.

**Files (modify):**
- `apps/web/src/layouts/BlogPost.astro`
- `apps/web/src/layouts/BaseLayout.astro`
- `apps/web/src/pages/404.astro`

**Acceptance Criteria:**
- [ ] No `PUBLIC_*` imports in these 3 files.
- [ ] No raw `bg-white/N`, `border-white/N`, `text-{red,amber,sky}-N` in these files.
- [ ] `bun run test:ui` passes.
- [ ] Manual: blog post page renders correctly (cover image, title, body, comments link).

**Verify:** `cd apps/web && bun run typecheck && bun run test:ui` → 0 failures

**Steps:**

- [ ] **Step 1: Survey + migrate `BlogPost.astro`**

Run: `cd apps/web && grep -n 'PUBLIC_\|bg-white/\|border-white/\|text-amber\|text-red\|text-sky' src/layouts/BlogPost.astro`

Apply recipe mapping per surveyed lines. The cover panel uses `PUBLIC_TOP_MEDIA_SURFACE_CLASS` → `surface({ kind: "media" })`. Comment/meta panels use `PUBLIC_PANEL_SURFACE_CLASS` → `surface({ kind: "panel" })`.

- [ ] **Step 2: Migrate `BaseLayout.astro` and `404.astro`**

Same pattern. `404.astro` has ~7 `PUBLIC_*` references — likely empty-state + action.

- [ ] **Step 3: Run tests + dev**

Run: `cd apps/web && bun run typecheck && bun run test:ui`

Dev: load `/ko/blog/<slug>/` for any post, and a deliberate 404 (`/ko/does-not-exist`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/layouts/BlogPost.astro apps/web/src/layouts/BaseLayout.astro apps/web/src/pages/404.astro
git commit -m "refactor(ui): migrate layouts and 404 page to recipe layer"
```

---

## Task 7: Migrate public pages

**Goal:** Migrate `[locale]/index.astro` (680L, 22 `PUBLIC_*` refs), `[locale]/projects/[slug].astro` (337L, 18 refs), `[locale]/series/[slug].astro` (278L, 10 refs), `[locale]/projects/index.astro` (2 refs), `[locale]/series/index.astro` (1 ref).

**Files (modify):**
- `apps/web/src/pages/[locale]/index.astro`
- `apps/web/src/pages/[locale]/projects/[slug].astro`
- `apps/web/src/pages/[locale]/series/[slug].astro`
- `apps/web/src/pages/[locale]/projects/index.astro`
- `apps/web/src/pages/[locale]/series/index.astro`

**Acceptance Criteria:**
- [ ] No `PUBLIC_*` imports in any of these files.
- [ ] `bun run test:ui` passes.
- [ ] Manual: home, project detail, series detail render correctly in both themes.

**Verify:** `cd apps/web && bun run typecheck && bun run test:ui` → 0 failures

**Steps:**

- [ ] **Step 1: `[locale]/index.astro`**

22 `PUBLIC_*` refs — survey with `grep -n 'PUBLIC_' src/pages/[locale]/index.astro`.

For each `topMediaShellClass`, `topMediaCopyPanelClass`, `sectionShellClass`, `panelSurfaceClass`, `pillClass`, `primaryOutlineActionClass`, `surfaceActionClass` derivation in the frontmatter (lines 77-85 of current file), swap the constant for the recipe call. The local var names can stay so the JSX body doesn't change.

Example:
```astro
const topMediaShellClass = `${surface({ kind: "media" })} p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] lg:p-6`;
const sectionShellClass = `${surface({ kind: "section" })} p-6`;
const panelSurfaceClass = `${surface({ kind: "panel" })} p-5`;
const pillClass = pill();
const primaryOutlineActionClass = action({ variant: "primaryOutline", size: "md" });
const surfaceActionClass = action({ variant: "surface", size: "md" });
```

- [ ] **Step 2: `projects/[slug].astro` (18 refs)**

Same pattern. Watch for raw `text-amber-700` or similar that should become `text-warning`.

- [ ] **Step 3: `series/[slug].astro` (10 refs) + the two index pages**

- [ ] **Step 4: Run tests + dev**

Run: `cd apps/web && bun run typecheck && bun run test:ui`

Dev: `/ko/`, `/en/`, `/ko/projects/<slug>/`, `/ko/series/<slug>/`, both themes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/[locale]/
git commit -m "refactor(ui): migrate public pages to recipe layer"
```

---

## Task 8: Migrate admin React widgets

**Goal:** Migrate the 14 React widgets in `src/components/public/*.tsx` that import `PUBLIC_*` constants. These are admin/dashboard panels (comments, imports, backup, archive filters, etc.).

**Files (modify):**
- `apps/web/src/components/public/AdminCommentsPanel.tsx` (10 refs)
- `apps/web/src/components/public/AdminImportsPanel.tsx` (4 refs)
- `apps/web/src/components/public/AdminCredentialDialogs.tsx` (6 refs)
- `apps/web/src/components/public/AdminSiteProfileSection.tsx` (12 refs)
- `apps/web/src/components/public/BackupRestoreSection.tsx` (12 refs)
- `apps/web/src/components/public/BlogArchiveFilters.tsx` (9 refs)
- `apps/web/src/components/public/CollectionOrderDialog.tsx` (2 refs)
- `apps/web/src/components/public/CollectionOrderList.tsx` (5 refs)
- `apps/web/src/components/public/PdfUploadCard.tsx` (6 refs)
- `apps/web/src/components/public/PostAdminActions.tsx` (8 refs)
- `apps/web/src/components/public/PostCommentComposer.tsx` (7 refs)
- `apps/web/src/components/public/PostCommentPasswordDialog.tsx` (4 refs)
- `apps/web/src/components/public/PostCommentThread.tsx` (12 refs)
- `apps/web/src/components/public/SeriesAdminPanel.tsx` (3 refs)

Plus shadcn primitives that re-export `PUBLIC_*`:
- `apps/web/src/components/ui/dialog.tsx` (6 refs)
- `apps/web/src/components/ui/alert-dialog.tsx` (4 refs)
- `apps/web/src/components/ui/sheet.tsx` (6 refs)
- `apps/web/src/components/ui/select.tsx` (4 refs)
- `apps/web/src/components/ui/input.tsx` (2 refs)

**Acceptance Criteria:**
- [ ] No `PUBLIC_*` imports anywhere in `src/components/`.
- [ ] All UI tests pass (these widgets have test coverage in `tests/ui/`).
- [ ] Comment thread, post composer, archive filters, admin panels behave identically in dev.

**Verify:** `cd apps/web && bun run typecheck && bun run test:ui` → 0 failures, all 31+ tests green.

**Steps:**

- [ ] **Step 1: Migrate `ui/dialog.tsx`, `ui/alert-dialog.tsx`, `ui/sheet.tsx`, `ui/select.tsx`, `ui/input.tsx`**

These primitives use `PUBLIC_MODAL_OVERLAY_CLASS`, `PUBLIC_MODAL_SURFACE_CLASS`, `PUBLIC_MODAL_CLOSE_CLASS`, `PUBLIC_POPOVER_SURFACE_CLASS`, `PUBLIC_FIELD_SURFACE_CLASS` etc. internally. Replace with `overlay()` / `field()` calls. Migrate primitives FIRST so widgets that use them (dialogs/sheets) don't see double-style for one commit.

- [ ] **Step 2: Batch-migrate widgets in 3 groups**

Group A — comments (4 files): `PostCommentComposer`, `PostCommentThread`, `PostCommentPasswordDialog`, `AdminCommentsPanel`. Commit: "refactor(ui): migrate comment widgets to recipe layer".

Group B — admin panels (5 files): `AdminImportsPanel`, `AdminCredentialDialogs`, `AdminSiteProfileSection`, `BackupRestoreSection`, `PostAdminActions`. Commit: "refactor(ui): migrate admin panels to recipe layer".

Group C — collection/archive (5 files): `CollectionOrderDialog`, `CollectionOrderList`, `BlogArchiveFilters`, `PdfUploadCard`, `SeriesAdminPanel`. Commit: "refactor(ui): migrate collection/archive widgets to recipe layer".

For each file: replace `PUBLIC_*` import → replace usage → check existing test coverage (`grep -l <ComponentName> tests/ui/`) → run targeted test → fix any failures.

- [ ] **Step 3: Confirm all `PUBLIC_*` references gone**

Run: `cd apps/web && grep -rn 'PUBLIC_\|DANGER_PILL_ACTION' src/`
Expected: only `src/lib/ui-effects.ts` definitions remain (Task 10 deletes them).

- [ ] **Step 4: Run full test suite**

Run: `cd apps/web && bun run test`
Expected: typecheck + guards + ui + auth all pass.

- [ ] **Step 5 — already committed in Step 2 (3 commits)**

---

## Task 9: Remove dark-mode attribute-selector hack

**Goal:** Delete `src/styles/base.css:271-301` — the `[class*='bg-white/96']` etc. block that patches dark mode on top of hardcoded surfaces. With all consumers now using token-driven utilities, this block has nothing to match.

**Files:**
- Modify: `apps/web/src/styles/base.css`

**Acceptance Criteria:**
- [ ] No `[class*='bg-white/'...]` selectors in `base.css`.
- [ ] No `[class*='shadow-[0_'...]` selectors in `base.css`.
- [ ] Dark mode still renders correctly across home, blog, projects, series, admin panels.
- [ ] `bun run test:ui` passes.

**Verify:** Run dev server, toggle dark mode (`document.documentElement.dataset.theme = 'dark'` in console), navigate all main routes — surfaces should remain visible.

**Steps:**

- [ ] **Step 1: Final check that no consumer relies on the hack**

Run: `cd apps/web && grep -rn 'bg-white/\(7[0-9]\|8[0-9]\|9[0-9]\|100\)\|shadow-\[0_' src/ --include='*.astro' --include='*.tsx'`

Expected output: only matches in `tokens.css` definitions (HSL alphas) and possibly `Header.astro`'s `site-header-surface` line which has its own override. If anything else surfaces, fix the leftover before deleting the block.

- [ ] **Step 2: Delete the override block**

Edit `apps/web/src/styles/base.css`. Remove lines 271-301 (the entire `html[data-theme='dark'] [class*='bg-white/96']`, `[class*='bg-white/95']`, `[class*='bg-slate-100']`, `.blog-filter-chip[data-active='true']`, `[class*='shadow-[0_28px_80px']` group of selectors).

Keep:
- `html[data-theme='dark'] { color-scheme: dark; }` (line 251-253)
- `html[data-theme='dark'] .site-header-surface` block (lines 255-258)
- `html[data-theme='dark'] .site-footer-surface` block (lines 260-263)
- `html[data-theme='dark'] .site-footer-dock` block (lines 265-269)

These are component-class-specific (not utility-attribute-selector) and remain valid.

- [ ] **Step 3: Manual dark-mode QA**

Dev server: `bun run dev`. In browser console:

```js
document.documentElement.dataset.theme = 'dark';
```

Navigate `/ko/`, `/ko/blog/`, `/ko/blog/<any-slug>/`, `/ko/projects/`, `/ko/series/`, `/admin` if accessible.

For each surface (cards, panels, modal, popovers, badges) confirm:
- Background visible (not invisible against dark page)
- Border visible
- Text readable
- Shadows present

- [ ] **Step 4: Run tests**

Run: `cd apps/web && bun run test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/styles/base.css
git commit -m "refactor(ui): remove dark-mode attribute-selector hack"
```

---

## Task 10: Delete `ui-effects.ts` + final verification

**Goal:** Delete `src/lib/ui-effects.ts`. Run the full test suite. Manual end-to-end browser verification.

**Files:**
- Delete: `apps/web/src/lib/ui-effects.ts`

**Acceptance Criteria:**
- [ ] `apps/web/src/lib/ui-effects.ts` no longer exists.
- [ ] `cd apps/web && grep -rn 'ui-effects' src/` returns nothing.
- [ ] `bun run test` (typecheck + guards + ui + auth) passes.
- [ ] `bun run build` succeeds.
- [ ] Manual: home, blog list, blog post, project list, project detail, series list, series detail, 404 — all render correctly in light + dark.

**Verify:** `cd apps/web && bun run test && bun run build` → all green

**Steps:**

- [ ] **Step 1: Confirm zero remaining references**

Run: `cd apps/web && grep -rn 'from.*ui-effects\|PUBLIC_[A-Z_]*_CLASS\|DANGER_PILL_ACTION_CLASS' src/`
Expected: empty output.

If non-empty: do NOT delete the file; finish migrating those references first (return to whichever Task 5–8 owns that file).

- [ ] **Step 2: Delete the file**

```bash
rm apps/web/src/lib/ui-effects.ts
```

- [ ] **Step 3: Run full pipeline**

```bash
cd apps/web
bun run typecheck
bun run test:guards
bun run test:ui
bun run test:auth
bun run build
```

Expected: each command exits 0.

- [ ] **Step 4: Manual e2e**

Dev server: navigate all main routes in light AND dark mode:
- `/` (root redirect)
- `/ko/`, `/en/`
- `/ko/blog/`, `/ko/blog/<slug>/`
- `/ko/projects/`, `/ko/projects/<slug>/`
- `/ko/series/`, `/ko/series/<slug>/`
- `/ko/does-not-exist` (404)
- Mobile nav sheet (resize < 768px)
- Language toggle dropdown
- If admin cookie present: `/admin`, comment composer, archive filters

For each page in dark mode, verify card surfaces, badges, pills, modals, popovers all render correctly.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(ui): delete ui-effects.ts after migration to recipe layer"
```

- [ ] **Step 6: Branch summary**

Run: `git log --oneline main..HEAD`
Expected: ~12 commits, one per task plus the 3 admin-widget batches.

The branch is now ready for review/merge per the user's preferred completion flow (don't merge to main without explicit confirmation per branch-autonomy rule).

---

## Self-Review Checklist

- [x] **Spec coverage** — Every section of `semantic-ui-design.md` has a task: tokens (Task 0), recipes (Task 1), wrappers (Task 2), pilot (Task 3), migration (Tasks 4-8), dark-mode hack removal (Task 9), final cleanup (Task 10).
- [x] **No placeholders** — Every step has exact file paths, code blocks, and verify commands. Migration tasks for which exact line numbers can't be predicted (because they depend on the result of earlier edits) include a `grep` command to locate the targets first.
- [x] **Type consistency** — `surface()`, `pill()`, `action()`, etc. names match between design doc, recipes.ts implementation, wrapper files, and migration callsites.
- [x] **TDD where useful** — Tasks 0–2 follow red-green: failing test first → implementation. Tasks 3–8 are mechanical refactors guarded by the existing test suite (UI smoke tests already cover each migrated widget); writing new tests per refactor adds noise.
