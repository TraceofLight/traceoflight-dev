# Public UI shadcn Migration Design

## Context

`apps/web` is currently an Astro application with:

- Astro routes and layouts for all public pages
- global CSS imports in [`src/components/BaseHead.astro`](../../apps/web/src/components/BaseHead.astro)
- large public style files such as `src/styles/layout.css`, `src/styles/components/blog.css`, and `src/styles/components/home.css`
- vanilla DOM scripts embedded in Astro files for public interactions such as:
  - footer admin modal
  - blog archive search/sort/tag filtering
  - blog detail admin delete confirmation
  - series detail admin controls rendered on the public route

The desired end state for phase 1 is:

- keep Astro as the content-first framework
- adopt React + Tailwind + `shadcn/ui` inside Astro where it materially improves the public UI
- restyle the entire public site close to the default `shadcn/ui` look
- keep `Pretendard` as the site font
- exclude the dedicated admin writer workspace under `/admin/posts/*`

This design treats the public site as a single migration phase, even if execution is sequenced internally for safety.

## Goals

- Rebuild all public routes around a shared Tailwind + `shadcn/ui` design system.
- Keep Astro in charge of routing, server data loading, and content rendering.
- Move public interactive behavior from DOM-selector scripts to typed React islands.
- Preserve existing backend and internal API contracts.
- Isolate writer-specific styles so the public rewrite does not destabilize `/admin/posts/new` and `/admin/posts/[slug]/edit`.

## Non-Goals

- Rewrite the site to Next.js.
- Rewrite or restyle the dedicated writer workspace in this phase.
- Change backend API contracts or database models.
- Preserve the current dark-green visual language exactly.

## Options Considered

### Option 1: Astro shell + React islands + Tailwind + `shadcn/ui`

- Keep Astro pages, layouts, and server-side data loading.
- Add React integration for interactive public surfaces and shared UI primitives.
- Rebuild static public markup with Tailwind and `shadcn`-aligned primitives or variant helpers.
- Best fit for a content-first site.

### Option 2: Astro shell + mostly React page trees

- Keep Astro routing, but move most page content trees into React components.
- Improves React consistency, but weakens Astro's value and complicates image/content interop.
- Not necessary for the current product shape.

### Option 3: Full Next.js rewrite

- Most uniform React architecture.
- Highest rewrite cost and largest risk surface.
- Not justified for a content-first portfolio/blog where Astro already fits the product.

## Selected Design

Use Option 1.

Astro remains the page and content layer. React is introduced as a UI and interaction layer, not as the new application shell.

That means:

- Astro routes continue to fetch posts, projects, and series data.
- Static content-heavy sections can remain Astro templates with Tailwind classes.
- Interactive public UI moves to React islands using `shadcn/ui`.
- Shared variants such as buttons and badges are standardized through the `shadcn` component set and utility helpers.

## Architecture

### 1. Platform Foundation

Add the current official Astro-compatible `shadcn/ui` stack to `apps/web`:

- `@astrojs/react`
- `react`
- `react-dom`
- `tailwindcss`
- current `shadcn/ui` Astro setup files such as `components.json`
- supporting utilities used by generated components
- `vitest` + Testing Library for actual React UI behavior tests

Astro stays the framework entry point. React is enabled only for components and islands.

### 2. Styling Model

Public UI styling moves to Tailwind and CSS variables that follow the default `shadcn` theme direction.

Theme rules:

- prefer a light, neutral `shadcn`-style base theme
- keep `Pretendard` as the primary font
- use `shadcn`-style radii, borders, spacing, and surface hierarchy
- remove custom public gradients, dense bespoke surface treatments, and page-specific CSS where possible

CSS file strategy:

- keep `src/styles/global.css` as the global entry imported by `BaseHead.astro`
- move shared font-face, reset, and theme variable definitions into the global entry
- keep writer-only CSS imported and namespaced separately
- remove public legacy CSS imports once each surface has been migrated

The practical target is:

- public UI: Tailwind + `shadcn` tokens
- writer UI: existing writer CSS until phase 2

### 3. Component Boundaries

Use three layers:

1. `src/components/ui/*`
- generated or adapted `shadcn/ui` primitives
- examples: `button`, `badge`, `card`, `dialog`, `alert-dialog`, `input`, `label`, `select`, `sheet`, `separator`

2. `src/components/public/*`
- public site components built on top of the UI primitives and shared helpers
- examples: site header, footer modal, blog archive controls, series admin panel

3. Astro pages/layouts/components
- still own page composition, data loading, and content mapping
- static content sections may stay in Astro with Tailwind classes
- React islands are inserted only where stateful interaction is needed

Important constraint:

- not every migrated surface needs to become a React island
- use React where behavior demands it
- use Astro templates plus Tailwind where content or Astro image interop makes that cleaner

### 4. Hydration Strategy

Hydrate only the interactive public surfaces:

- footer admin modal
- blog archive filtering/sorting/tag state
- blog post admin delete confirmation on the public detail route
- series detail admin panel actions on the public detail route
- optional mobile navigation sheet if adopted

Non-interactive surfaces should render server-side without hydration:

- header shell
- cards
- home sections
- project detail sections
- series listing and post listing markup
- article structure on blog detail pages

This keeps the Astro value proposition intact.

### 5. Data Flow

Data flow remains server-first:

- Astro route loads data
- Astro route serializes only the props needed by a React island
- React island owns local interaction state and calls existing internal API routes when needed
- backend and internal API route shapes stay unchanged

Examples:

- `FooterAdminModal` calls existing auth and backup internal API routes
- `BlogArchiveFilters` receives the server-fetched post list and filters client-side
- `PostAdminActions` continues to call the existing delete path through the internal API layer
- `SeriesAdminPanel` continues to use the series internal API routes already on the public page

## Route-by-Route Migration Scope

### Public Layout and Shared Shell

- `src/layouts/BaseLayout.astro`
- `src/components/Header.astro`
- `src/components/Footer.astro`
- `src/components/BaseHead.astro`

### Home

- `src/pages/index.astro`
- supporting cards and section blocks

### Blog

- `src/pages/blog/index.astro`
- `src/pages/blog/[...slug].astro`
- `src/layouts/BlogPost.astro`
- `src/components/PostCard.astro`

Includes:

- archive filter/search/sort UI
- post detail admin delete dialog shown to admin viewers
- series navigation rendered inside the post detail layout

### Projects

- `src/pages/projects/index.astro`
- `src/pages/projects/[slug].astro`
- `src/components/ProjectCard.astro`

### Series

- `src/pages/series/index.astro`
- `src/pages/series/[slug].astro`

Includes admin-only controls on the public detail route because they are part of the public route surface.

### Excluded from Phase 1

- `src/layouts/AdminWriterLayout.astro`
- `src/pages/admin/posts/new.astro`
- `src/pages/admin/posts/[slug]/edit.astro`
- `src/lib/admin/new-post-page/*`
- writer-specific CSS files

## Testing Strategy

The current `node:test` suite is mostly source-guard oriented. That is not enough once public interactions move into React islands.

Use a mixed strategy:

### Keep `node:test` for

- route structure
- import wiring
- public/internal API contract guards
- high-level page composition assertions

### Add Vitest + Testing Library for

- footer admin modal behavior
- blog archive filter/search/sort/tag behavior
- post delete confirmation behavior
- series public-route admin controls

### Verification Commands

At minimum:

- `npm --prefix apps/web run test:guards`
- `npm --prefix apps/web run test:ui`
- `npm --prefix apps/web run build`

Optionally fold `test:ui` into the main `test` script once the migration settles.

## Risks and Mitigations

### Risk: Mixed legacy CSS and Tailwind fight each other

Mitigation:

- isolate writer CSS
- stop importing public legacy CSS as each route is migrated
- keep global styles thin and token-oriented

### Risk: Astro and React boundaries become arbitrary

Mitigation:

- Astro owns data and document structure
- React owns local interaction state
- static content sections stay Astro unless there is a clear reason otherwise

### Risk: Existing source-guard tests become noise

Mitigation:

- rewrite tests to assert architecture and behavior, not old class names
- add behavioral tests where React islands replace inline scripts

### Risk: Public-route admin controls are easy to forget

Mitigation:

- explicitly include blog detail admin actions and series detail admin controls in scope
- exclude only the dedicated writer workspace

## Rollout Sequence

Even though the product goal is a single public-site rewrite, implementation should proceed in this order:

1. add React, Tailwind, `shadcn/ui`, and UI test tooling
2. rebuild shared shell and footer admin modal
3. rebuild shared public cards and interactive public islands
4. migrate blog surfaces
5. migrate projects, series, and home
6. remove public legacy CSS and dead wrappers
7. run full verification and tighten scripts/tests

## Acceptance Criteria

The migration is complete when all of the following are true:

- all public routes render with the new Tailwind + `shadcn` visual system
- `Pretendard` remains the public font
- public interactive surfaces no longer rely on inline DOM-selector scripts
- `/admin/posts/new` and `/admin/posts/[slug]/edit` still work without visual or behavioral regression
- public legacy CSS files are either removed or reduced to non-public responsibilities
- the web app builds and both guard tests and React UI tests pass
