# Blog Visibility Counts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix blog archive visibility chip counts so `전체`, `공개`, and `비공개` all use backend-wide counts instead of mixing server totals with the currently loaded client page.

**Architecture:** Extend the post summary API response with `visibility_counts` aggregated on the backend using the active query/tag/content filters but ignoring the current visibility chip selection. Thread that metadata through the Astro internal API and initial page props, then render the chip labels from those backend counts.

**Tech Stack:** FastAPI, SQLAlchemy, Astro, React, Vitest, Node test runner

---

### Task 1: Lock the response/UI contract with failing tests

**Files:**
- Modify: `apps/api/tests/api/test_post_summaries_api.py`
- Modify: `apps/web/tests/ui/blog-archive-filters.test.tsx`

**Step 1: Write the failing tests**

- API test asserts `visibility_counts` is returned with `all`, `public`, and `private`.
- UI test asserts admin visibility chips render backend-provided counts instead of deriving counts from the loaded post slice.

**Step 2: Run tests to verify they fail**

Run: `python -m pytest apps/api/tests/api/test_post_summaries_api.py -q`
Run: `pnpm vitest run apps/web/tests/ui/blog-archive-filters.test.tsx`

Expected: FAIL because the current response has no visibility-count metadata and the UI still counts from `posts`.

### Task 2: Implement backend visibility-count aggregation

**Files:**
- Modify: `apps/api/src/app/repositories/post_repository.py`
- Modify: `apps/api/src/app/schemas/post.py`

**Step 1: Add minimal implementation**

- Add `visibility_counts` to the summary response schema.
- Aggregate `all/public/private` counts from the filtered summary base query while ignoring the current visibility selection.

**Step 2: Run API test**

Run: `python -m pytest apps/api/tests/api/test_post_summaries_api.py -q`

Expected: PASS

### Task 3: Thread visibility counts through web summary parsing

**Files:**
- Modify: `apps/web/src/lib/blog-db.ts`
- Modify: `apps/web/src/pages/internal-api/posts/summary.ts`
- Modify: `apps/web/src/pages/blog/index.astro`
- Modify: `apps/web/src/components/public/BlogArchiveFilters.tsx`

**Step 1: Add minimal implementation**

- Parse and forward `visibilityCounts` in web summary types.
- Pass initial counts into the archive island.
- Render visibility chips from backend counts.

**Step 2: Run UI test**

Run: `pnpm vitest run apps/web/tests/ui/blog-archive-filters.test.tsx`

Expected: PASS

### Task 4: Run focused regression coverage

**Files:**
- Verify: `apps/web/tests/blog-archive-ui.test.mjs`

**Step 1: Run focused checks**

Run: `python -m pytest apps/api/tests/api/test_post_summaries_api.py -q`
Run: `pnpm vitest run apps/web/tests/ui/blog-archive-filters.test.tsx`
Run: `node --test apps/web/tests/blog-archive-ui.test.mjs apps/web/tests/content-provider-runtime.test.mjs`

Expected: PASS
