# Public UI shadcn Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the entire public Astro site around Tailwind + `shadcn/ui` while keeping Astro for routing/content, preserving `Pretendard`, and leaving the dedicated admin writer workspace untouched.

**Architecture:** Astro remains the server-rendered content shell. Tailwind and `shadcn/ui` become the public design system. Interactive public features move into React islands, while static content-heavy surfaces remain Astro templates styled with Tailwind utilities and shared variant helpers. Writer-specific CSS and scripts remain in place during this phase.

**Tech Stack:** Astro, React, Tailwind CSS, `shadcn/ui`, Vitest, Testing Library, node:test

---

### Task 1: Add React, Tailwind, shadcn, and UI test foundations

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/package-lock.json`
- Modify: `apps/web/astro.config.mjs`
- Modify: `apps/web/tsconfig.json`
- Modify: `apps/web/src/components/BaseHead.astro`
- Modify: `apps/web/src/styles/global.css`
- Modify: `apps/web/src/styles/tokens.css`
- Modify: `apps/web/src/styles/base.css`
- Create: `apps/web/components.json`
- Create: `apps/web/src/lib/utils.ts`
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/badge.tsx`
- Create: `apps/web/src/components/ui/card.tsx`
- Create: `apps/web/src/components/ui/dialog.tsx`
- Create: `apps/web/src/components/ui/alert-dialog.tsx`
- Create: `apps/web/src/components/ui/input.tsx`
- Create: `apps/web/src/components/ui/label.tsx`
- Create: `apps/web/src/components/ui/select.tsx`
- Create: `apps/web/src/components/ui/separator.tsx`
- Create: `apps/web/src/components/ui/sheet.tsx`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest.setup.ts`
- Create: `apps/web/tests/react-ui-setup.test.mjs`

**Step 1: Write the failing setup guard**
- Add `apps/web/tests/react-ui-setup.test.mjs`.
- Assert that:
  - `package.json` includes React, Tailwind, `shadcn` dependencies, and a `test:ui` script
  - `astro.config.mjs` includes React integration
  - `components.json` exists
  - `global.css` exposes the public theme entry point

**Step 2: Run the failing guard**
- `cd apps/web && node --test tests/react-ui-setup.test.mjs`
- Expected: FAIL because the React/Tailwind/shadcn stack is not configured yet.

**Step 3: Add platform dependencies and config**
- Add the current official Astro-compatible React + Tailwind + `shadcn/ui` dependencies.
- Update `astro.config.mjs` with React integration and Tailwind support.
- Add `components.json`.
- Add `src/lib/utils.ts` and the initial `shadcn` primitives listed above.
- Add `vitest` configuration and a `test:ui` script.

**Step 4: Convert global styling to the new foundation**
- Keep `Pretendard` in `tokens.css`.
- Move the public global theme to a `shadcn`-style variable set in `global.css` and `tokens.css`.
- Keep only reset/base rules in `base.css`.
- Do not remove writer CSS yet.

**Step 5: Re-run setup verification**
- `cd apps/web && node --test tests/react-ui-setup.test.mjs`
- `cd apps/web && npm run test:guards`
- Expected: setup guard passes; existing guard tests may still fail for public markup changes not yet implemented.

**Step 6: Commit**
- `git add apps/web/package.json apps/web/package-lock.json apps/web/astro.config.mjs apps/web/tsconfig.json apps/web/src/components/BaseHead.astro apps/web/src/styles/global.css apps/web/src/styles/tokens.css apps/web/src/styles/base.css apps/web/components.json apps/web/src/lib/utils.ts apps/web/src/components/ui apps/web/vitest.config.ts apps/web/vitest.setup.ts apps/web/tests/react-ui-setup.test.mjs`
- `git commit -m "feat(web): add shadcn public ui foundation"`

### Task 2: Rebuild the public shell and footer admin modal

**Files:**
- Modify: `apps/web/src/layouts/BaseLayout.astro`
- Modify: `apps/web/src/components/Header.astro`
- Modify: `apps/web/src/components/Footer.astro`
- Modify: `apps/web/src/components/HeaderLink.astro`
- Modify: `apps/web/src/components/FooterIconLink.astro`
- Create: `apps/web/src/components/public/FooterAdminModal.tsx`
- Create: `apps/web/src/components/public/MobileNavSheet.tsx`
- Create: `apps/web/tests/ui/footer-admin-modal.test.tsx`
- Modify: `apps/web/tests/layout-shell.test.mjs`
- Modify: `apps/web/tests/footer-admin-modal.test.mjs`
- Modify: `apps/web/tests/footer-copy.test.mjs`
- Modify: `apps/web/tests/home-page-layout.test.mjs`

**Step 1: Write failing shell and modal tests**
- In `layout-shell.test.mjs`, assert the public shell no longer depends on legacy `site-header` / `site-footer` class structure and instead imports the new shell arrangement.
- In `footer-admin-modal.test.mjs` and `footer-copy.test.mjs`, assert the footer mounts the new React modal entry point.
- Add `tests/ui/footer-admin-modal.test.tsx` to validate:
  - login view renders when `isAdminViewer` is false
  - backup controls render when `isAdminViewer` is true
  - dialog open/close behavior works

**Step 2: Run targeted failing tests**
- `cd apps/web && node --test tests/layout-shell.test.mjs tests/footer-admin-modal.test.mjs tests/footer-copy.test.mjs`
- `cd apps/web && npm run test:ui -- footer-admin-modal`
- Expected: FAIL because the shell and modal are still Astro markup plus inline DOM script.

**Step 3: Implement the new shell**
- Rewrite `Header.astro` with Tailwind classes and `shadcn`-aligned button/link styling.
- Add a responsive mobile navigation sheet if needed.
- Rewrite `Footer.astro` to a Tailwind shell and mount `FooterAdminModal.tsx` as the interactive island.
- Keep the auth and backup flows pointing to the current internal API routes.
- Keep the current viewer split: login form for anonymous users, backup panel for admin viewers.

**Step 4: Update layout wiring**
- Ensure `BaseLayout.astro` continues to provide skip-link, main container, and page transition wiring.
- Keep global metadata and head behavior unchanged.

**Step 5: Verify shell and modal**
- `cd apps/web && node --test tests/layout-shell.test.mjs tests/footer-admin-modal.test.mjs tests/footer-copy.test.mjs`
- `cd apps/web && npm run test:ui -- footer-admin-modal`
- Expected: PASS

**Step 6: Commit**
- `git add apps/web/src/layouts/BaseLayout.astro apps/web/src/components/Header.astro apps/web/src/components/Footer.astro apps/web/src/components/HeaderLink.astro apps/web/src/components/FooterIconLink.astro apps/web/src/components/public/FooterAdminModal.tsx apps/web/src/components/public/MobileNavSheet.tsx apps/web/tests/layout-shell.test.mjs apps/web/tests/footer-admin-modal.test.mjs apps/web/tests/footer-copy.test.mjs apps/web/tests/home-page-layout.test.mjs apps/web/tests/ui/footer-admin-modal.test.tsx`
- `git commit -m "feat(web): migrate public shell and footer modal to shadcn"`

### Task 3: Replace blog archive and blog detail interactions with React islands

**Files:**
- Modify: `apps/web/src/components/PostCard.astro`
- Modify: `apps/web/src/layouts/BlogPost.astro`
- Modify: `apps/web/src/pages/blog/index.astro`
- Modify: `apps/web/src/pages/blog/[...slug].astro`
- Create: `apps/web/src/components/public/BlogArchiveFilters.tsx`
- Create: `apps/web/src/components/public/PostAdminActions.tsx`
- Create: `apps/web/src/lib/format-date.ts`
- Create: `apps/web/tests/ui/blog-archive-filters.test.tsx`
- Create: `apps/web/tests/ui/post-admin-actions.test.tsx`
- Modify: `apps/web/tests/blog-archive-ui.test.mjs`
- Modify: `apps/web/tests/blog-tag-filter.test.mjs`
- Modify: `apps/web/tests/blog-post-admin-actions.test.mjs`
- Modify: `apps/web/tests/blog-post-navigation.test.mjs`
- Modify: `apps/web/tests/blog-series-navigation.test.mjs`
- Modify: `apps/web/tests/blog-visibility.test.mjs`
- Modify: `apps/web/tests/reading-time.test.mjs`

**Step 1: Write failing blog tests**
- Update guard tests so they assert:
  - `blog/index.astro` mounts a React filter island instead of inline filtering script
  - `BlogPost.astro` mounts a React admin-actions island instead of inline delete modal script
  - `PostCard.astro` uses the new Tailwind-based public card structure
- Add React UI tests for:
  - search, sort, visibility, and tag filtering
  - delete confirmation open/close/submit states

**Step 2: Run targeted failing tests**
- `cd apps/web && node --test tests/blog-archive-ui.test.mjs tests/blog-tag-filter.test.mjs tests/blog-post-admin-actions.test.mjs tests/blog-post-navigation.test.mjs tests/blog-series-navigation.test.mjs tests/blog-visibility.test.mjs tests/reading-time.test.mjs`
- `cd apps/web && npm run test:ui -- blog-archive-filters post-admin-actions`
- Expected: FAIL because blog surfaces still use legacy markup and inline scripts.

**Step 3: Implement archive and detail islands**
- Replace the inline archive script with `BlogArchiveFilters.tsx`.
- Keep Astro responsible for fetching posts and passing the list into the island.
- Replace the blog detail admin delete flow with `PostAdminActions.tsx` using `AlertDialog`.
- Keep series navigation rendered in the detail layout, but restyle it to the new Tailwind system.

**Step 4: Rebuild the blog presentation layer**
- Rewrite `PostCard.astro` to the new public card style.
- Rewrite the archive introduction/control layout to `shadcn`-style controls.
- Rewrite blog detail layout classes to Tailwind utilities and typography utilities.

**Step 5: Verify blog migration**
- `cd apps/web && node --test tests/blog-archive-ui.test.mjs tests/blog-tag-filter.test.mjs tests/blog-post-admin-actions.test.mjs tests/blog-post-navigation.test.mjs tests/blog-series-navigation.test.mjs tests/blog-visibility.test.mjs tests/reading-time.test.mjs`
- `cd apps/web && npm run test:ui -- blog-archive-filters post-admin-actions`
- Expected: PASS

**Step 6: Commit**
- `git add apps/web/src/components/PostCard.astro apps/web/src/layouts/BlogPost.astro apps/web/src/pages/blog/index.astro apps/web/src/pages/blog/[...slug].astro apps/web/src/components/public/BlogArchiveFilters.tsx apps/web/src/components/public/PostAdminActions.tsx apps/web/src/lib/format-date.ts apps/web/tests/ui/blog-archive-filters.test.tsx apps/web/tests/ui/post-admin-actions.test.tsx apps/web/tests/blog-archive-ui.test.mjs apps/web/tests/blog-tag-filter.test.mjs apps/web/tests/blog-post-admin-actions.test.mjs apps/web/tests/blog-post-navigation.test.mjs apps/web/tests/blog-series-navigation.test.mjs apps/web/tests/blog-visibility.test.mjs apps/web/tests/reading-time.test.mjs`
- `git commit -m "feat(web): migrate blog public surfaces to shadcn"`

### Task 4: Rebuild projects, series, and home with the new public system

**Files:**
- Modify: `apps/web/src/components/ProjectCard.astro`
- Modify: `apps/web/src/pages/index.astro`
- Modify: `apps/web/src/pages/projects/index.astro`
- Modify: `apps/web/src/pages/projects/[slug].astro`
- Modify: `apps/web/src/pages/series/index.astro`
- Modify: `apps/web/src/pages/series/[slug].astro`
- Create: `apps/web/src/components/public/SeriesAdminPanel.tsx`
- Create: `apps/web/src/components/public/SeriesReorderList.tsx`
- Create: `apps/web/tests/ui/series-admin-panel.test.tsx`
- Modify: `apps/web/tests/home-page-layout.test.mjs`
- Modify: `apps/web/tests/series-page.test.mjs`
- Modify: `apps/web/tests/series-detail-page.test.mjs`
- Modify: `apps/web/tests/top-media-support.test.mjs`
- Modify: `apps/web/tests/modularization.test.mjs`

**Step 1: Write failing page and series admin tests**
- Update home/projects/series guard tests to assert the new public layout structure rather than legacy CSS class names.
- Add `series-admin-panel.test.tsx` covering:
  - metadata save action
  - cover image upload trigger wiring
  - reorder save action state

**Step 2: Run targeted failing tests**
- `cd apps/web && node --test tests/home-page-layout.test.mjs tests/series-page.test.mjs tests/series-detail-page.test.mjs tests/top-media-support.test.mjs tests/modularization.test.mjs`
- `cd apps/web && npm run test:ui -- series-admin-panel`
- Expected: FAIL because home/projects/series surfaces are still on legacy markup and inline series logic.

**Step 3: Rebuild static public pages**
- Rewrite `ProjectCard.astro`, `projects/index.astro`, and `projects/[slug].astro` with the new Tailwind public card/detail styling.
- Rewrite `index.astro` section by section to the new public layout while preserving the current data and content.
- Rewrite `series/index.astro` and the non-admin parts of `series/[slug].astro` to the new public card/list/detail styling.

**Step 4: Replace public-route series admin behavior**
- Move the inline admin logic on `series/[slug].astro` into `SeriesAdminPanel.tsx` and `SeriesReorderList.tsx`.
- Keep the internal API routes and permissions model unchanged.

**Step 5: Verify home/projects/series migration**
- `cd apps/web && node --test tests/home-page-layout.test.mjs tests/series-page.test.mjs tests/series-detail-page.test.mjs tests/top-media-support.test.mjs tests/modularization.test.mjs`
- `cd apps/web && npm run test:ui -- series-admin-panel`
- Expected: PASS

**Step 6: Commit**
- `git add apps/web/src/components/ProjectCard.astro apps/web/src/pages/index.astro apps/web/src/pages/projects/index.astro apps/web/src/pages/projects/[slug].astro apps/web/src/pages/series/index.astro apps/web/src/pages/series/[slug].astro apps/web/src/components/public/SeriesAdminPanel.tsx apps/web/src/components/public/SeriesReorderList.tsx apps/web/tests/ui/series-admin-panel.test.tsx apps/web/tests/home-page-layout.test.mjs apps/web/tests/series-page.test.mjs apps/web/tests/series-detail-page.test.mjs apps/web/tests/top-media-support.test.mjs apps/web/tests/modularization.test.mjs`
- `git commit -m "feat(web): migrate remaining public pages to shadcn"`

### Task 5: Remove legacy public CSS and dead public wrappers

**Files:**
- Modify: `apps/web/src/styles/global.css`
- Modify: `apps/web/src/styles/components.css`
- Modify: `apps/web/src/styles/layout.css`
- Modify: `apps/web/src/styles/components/blog.css`
- Modify: `apps/web/src/styles/components/common.css`
- Modify: `apps/web/src/styles/components/home.css`
- Modify: `apps/web/src/styles/components/admin.css`
- Modify: `apps/web/src/components/HeaderLink.astro`
- Modify: `apps/web/src/components/FooterIconLink.astro`
- Modify only if now-unused: `apps/web/src/components/TopMediaImage.astro`
- Modify only if now-unused: `apps/web/src/components/FormattedDate.astro`

**Step 1: Write failing cleanup guards**
- Add or update guard assertions so public files no longer depend on the old public CSS imports and class-only architecture.
- Ensure there is still an explicit path for writer CSS to load.

**Step 2: Run failing cleanup checks**
- `cd apps/web && node --test tests/react-ui-setup.test.mjs tests/layout-shell.test.mjs tests/modularization.test.mjs`
- Expected: FAIL until public CSS imports and dead wrappers are cleaned up.

**Step 3: Remove or shrink legacy public CSS**
- Stop importing old public CSS from `global.css` / `components.css`.
- Delete or reduce public-only CSS rules that are no longer referenced.
- Keep writer CSS imports and any shared reset/font tokens still required by the writer pages.
- Remove dead wrapper components only after imports have been updated.

**Step 4: Re-run cleanup checks**
- `cd apps/web && node --test tests/react-ui-setup.test.mjs tests/layout-shell.test.mjs tests/modularization.test.mjs`
- Expected: PASS

**Step 5: Commit**
- `git add apps/web/src/styles/global.css apps/web/src/styles/components.css apps/web/src/styles/layout.css apps/web/src/styles/components/blog.css apps/web/src/styles/components/common.css apps/web/src/styles/components/home.css apps/web/src/styles/components/admin.css apps/web/src/components/HeaderLink.astro apps/web/src/components/FooterIconLink.astro apps/web/src/components/TopMediaImage.astro apps/web/src/components/FormattedDate.astro`
- `git commit -m "refactor(web): remove legacy public css after shadcn migration"`

### Task 6: Final verification and script tightening

**Files:**
- Modify: `apps/web/package.json`
- Modify only if verification exposes issues: relevant source or test files

**Step 1: Fold UI tests into the regular web test flow**
- Update `package.json` so the default test flow covers both guard tests and React UI tests.

**Step 2: Run the full web verification set**
- `cd apps/web && npm run test`
- `cd apps/web && npm run build`
- Expected: PASS

**Step 3: Run targeted sanity checks for excluded writer pages**
- `cd apps/web && node --test tests/admin-writer-page.test.mjs tests/admin-post-edit-page.test.mjs tests/admin-writer-script.test.mjs`
- Expected: PASS, proving the public rewrite did not destabilize the excluded writer workspace.

**Step 4: Stage final adjustments**
- `git add apps/web/package.json apps/web/package-lock.json apps/web/src apps/web/tests`

**Step 5: Commit**
- `git commit -m "test(web): finalize public shadcn migration verification"`
