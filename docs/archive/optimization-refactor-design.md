# Optimization And Structural Refactor Design

Reference date: 2026-03-13

## Goal

Improve public-page performance and maintainability while preserving the current user-facing UX.

## Constraints

- Do not introduce numbered pagination UI.
- Infinite append on scroll is allowed for the blog archive.
- Existing visible layout and routes should stay substantially the same.
- Public read paths should become cheaper without weakening admin behavior.

## Decisions

### 1. Blog Archive Becomes Server-Driven

- The archive page will stop shipping the full post list with full markdown bodies.
- Initial render will receive only the first batch of card-level summary data.
- Tag and sort changes will request new batches from the server instead of re-filtering a fully loaded in-memory array.
- Infinite scroll will append additional batches with the same active filters.
- No numbered pagination UI will be added.
- URL query state may continue to represent selected tags, but the data source becomes server-driven.

### 2. Public Fetch Paths Split From Admin Fetch Paths

- Public read requests should stop defaulting to the same `no-store` behavior used for admin-sensitive flows.
- Public cards for home, archive, and series should rely on summary-shaped data rather than detail-shaped payloads.
- Home featured-series loading should remove the current N+1 pattern by loading enough metadata in one read path.
- Shared mapping helpers should normalize card-level models in one place.

### 3. Public Layout Hydration Is Reduced

- Common public layout islands should hydrate only when needed.
- Mobile navigation, footer login, and utility controls should avoid unconditional eager hydration on every page.
- If an interaction can be implemented without React, prefer Astro or lightweight browser-side code.
- Public and admin bundle boundaries should remain explicit.

### 4. Admin Writer Runtime Gets More Aggressive Lazy Boundaries

- Writer-only runtime stays isolated from public routes.
- Preview rendering should load as late as possible.
- Editor runtime should continue lazy loading and avoid pulling preview/runtime cost before needed.
- Existing writer UX should remain unchanged.

## Expected Outcomes

- Lower SSR cost on home and archive routes.
- Smaller archive payloads and less client-side filtering work.
- Fewer always-hydrated public layout islands.
- Lower admin writer chunk pressure and fewer oversized client chunks.

## Verification Strategy

- Add or update guard tests for:
  - home featured-series data path and N+1 removal markers
  - blog archive server-driven loading contract and infinite append markers
  - reduced unconditional hydration in shared layout
  - writer lazy-loading boundaries
- Run targeted tests during each step.
- Finish with full `npm test` and `npm run build`.
