# Optimization And Structural Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce public SSR and hydration cost while preserving the existing UX, using server-driven archive loading and lighter public data paths.

**Architecture:** Split public summary reads from admin-sensitive reads, move the blog archive to batched server-driven loading, shrink unconditional public hydration, and push writer-only runtime loading later. Maintain route shape and visible layout while changing data flow and bundle boundaries underneath.

**Tech Stack:** Astro, React islands, Node test runner, Vitest, TypeScript, Astro server routes

---

### Task 1: Document The Target Architecture

**Files:**
- Create: `docs/plans/optimization-refactor-design.md`
- Create: `docs/plans/optimization-refactor.md`

**Step 1: Write the design doc**

- Capture decisions for server-driven archive loading, public/admin fetch separation, layout hydration reduction, and writer lazy boundaries.

**Step 2: Write the implementation plan**

- Break the work into test-first, verifiable steps.

**Step 3: Verify docs exist**

Run: `Get-ChildItem docs/plans/optimization-refactor*`
Expected: both design and plan files are listed

### Task 2: Split Public Summary Data Paths

**Files:**
- Modify: `apps/web/src/lib/backend-api.ts`
- Modify: `apps/web/src/lib/blog-db.ts`
- Modify: `apps/web/src/lib/series-db.ts`
- Modify: `apps/web/src/pages/index.astro`
- Test: `apps/web/tests/home-page-layout.test.mjs`
- Test: `apps/web/tests/blog-archive-ui.test.mjs`

**Step 1: Write failing guard tests**

- Add tests that assert:
  - home no longer imports and uses `getSeriesBySlug`
  - home uses a summary-only featured-series path
  - archive no longer relies on full-body list loading for initial page data

**Step 2: Run targeted tests to confirm failure**

Run: `node --test tests/home-page-layout.test.mjs tests/blog-archive-ui.test.mjs`
Expected: failures showing missing summary-path markers

**Step 3: Implement minimal public-summary fetch split**

- Introduce a public read helper that is safe for cacheable summary reads.
- Add summary-shaped series and post list helpers for public pages.
- Update home to use summary data without per-series detail fetches.

**Step 4: Re-run targeted tests**

Run: `node --test tests/home-page-layout.test.mjs tests/blog-archive-ui.test.mjs`
Expected: updated tests pass

### Task 3: Move Blog Archive To Server-Driven Infinite Loading

**Files:**
- Modify: `apps/web/src/pages/blog/index.astro`
- Modify: `apps/web/src/components/public/BlogArchiveFilters.tsx`
- Modify: `apps/web/src/lib/blog-db.ts`
- Create or modify: `apps/web/src/pages/internal-api/posts/index.ts` or matching archive route file
- Test: `apps/web/tests/blog-archive-ui.test.mjs`
- Test: `apps/web/tests/ui/blog-archive-filters.test.tsx`

**Step 1: Write failing tests**

- Add tests asserting:
  - archive page passes only initial batch data plus next-cursor metadata
  - filter island requests more posts on scroll instead of assuming full in-memory dataset
  - appended results preserve current UX and avoid duplicates

**Step 2: Run targeted tests to confirm failure**

Run: `npm run test:guards -- tests/blog-archive-ui.test.mjs`
Run: `npm run test:ui -- tests/ui/blog-archive-filters.test.tsx`
Expected: failures around missing server-driven batching markers

**Step 3: Implement minimal server-driven batching**

- Add a summary list helper with `limit`, `offset` or cursor-like batch semantics.
- Update the archive page to render initial batch only.
- Update the island to replace local full-list filtering with server-driven refetch and infinite append.
- Preserve the existing visible controls and URL behavior.

**Step 4: Re-run targeted tests**

Run: `node --test tests/blog-archive-ui.test.mjs`
Run: `vitest run tests/ui/blog-archive-filters.test.tsx`
Expected: both pass

### Task 4: Reduce Eager Public Layout Hydration

**Files:**
- Modify: `apps/web/src/layouts/BaseLayout.astro`
- Modify: `apps/web/src/components/Header.astro`
- Modify: `apps/web/src/components/Footer.astro`
- Modify: related public components under `apps/web/src/components/public/`
- Test: `apps/web/tests/layout-shell.test.mjs`
- Test: `apps/web/tests/react-ui-setup.test.mjs`

**Step 1: Write failing tests**

- Add assertions that the shared layout no longer eagerly hydrates all public controls on every page.

**Step 2: Run targeted tests to confirm failure**

Run: `node --test tests/layout-shell.test.mjs tests/react-ui-setup.test.mjs`
Expected: failures reflecting old hydration markers

**Step 3: Implement minimal hydration reduction**

- Delay or replace hydration for mobile nav, footer login, and utility controls where practical.

**Step 4: Re-run targeted tests**

Run: `node --test tests/layout-shell.test.mjs tests/react-ui-setup.test.mjs`
Expected: pass

### Task 5: Push Writer Runtime Loading Later

**Files:**
- Modify: `apps/web/src/layouts/AdminWriterLayout.astro`
- Modify: `apps/web/src/lib/admin/new-post-page.ts`
- Modify: `apps/web/src/lib/markdown-renderer-lazy.ts`
- Test: `apps/web/tests/admin-writer-page.test.mjs`
- Test: `apps/web/tests/admin-writer-preview.test.ts`
- Test: `apps/web/tests/admin-writer-markdown-renderer.test.mjs`

**Step 1: Write failing tests**

- Add assertions for later preview runtime loading and preserved fallback/boot flow.

**Step 2: Run targeted tests to confirm failure**

Run: `node --test tests/admin-writer-page.test.mjs tests/admin-writer-markdown-renderer.test.mjs`
Run: `node --import tsx --test tests/admin-writer-preview.test.ts`
Expected: failures around old eager-loading assumptions

**Step 3: Implement minimal writer lazy-boundary changes**

- Load preview renderer only when preview is actually needed.
- Keep editor lazy behavior intact and preserve fallback handling.

**Step 4: Re-run targeted tests**

Run: `node --test tests/admin-writer-page.test.mjs tests/admin-writer-markdown-renderer.test.mjs`
Run: `node --import tsx --test tests/admin-writer-preview.test.ts`
Expected: pass

### Task 6: Full Verification

**Files:**
- Verify current workspace changes only

**Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites pass

**Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds and chunk warnings are reduced or at minimum unchanged with documented reasoning

**Step 3: Review diff**

Run: `git diff -- docs/plans/optimization-refactor-design.md docs/plans/optimization-refactor.md apps/web`
Expected: only intended files changed
