# Blog Archive All Chip Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the blog archive `전체` chip count fixed to the absolute archive total and clear its active state whenever tag or search filters are applied.

**Architecture:** Preserve the server-provided initial total as a stable baseline for the archive-wide count, then separate that display value from the filter-result count used for fetched pages. Update the React archive island so the `전체` chip active state depends on visibility plus the absence of tag/query filters, and lock the behavior with UI regression tests.

**Tech Stack:** Astro, React, Vitest, Node test runner

---

### Task 1: Lock the new archive chip semantics with failing tests

**Files:**
- Modify: `apps/web/tests/ui/blog-archive-filters.test.tsx`

**Step 1: Write the failing tests**

- Assert `전체 (3)` stays visible after selecting a tag and after applying a search query.
- Assert the `전체` chip is not active when a search query is present, even if visibility remains `all`.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run apps/web/tests/ui/blog-archive-filters.test.tsx`

Expected: FAIL because the component currently overwrites the total count with filtered totals and keeps the `전체` chip active during search.

### Task 2: Implement the minimal archive filter fix

**Files:**
- Modify: `apps/web/src/components/public/BlogArchiveFilters.tsx`

**Step 1: Write minimal implementation**

- Store a stable archive-wide total separately from the mutable filtered total state.
- Use the stable total for the `전체` chip and summary line.
- Compute the `전체` active state from visibility plus the absence of tag and search filters.

**Step 2: Run test to verify it passes**

Run: `pnpm vitest run apps/web/tests/ui/blog-archive-filters.test.tsx`

Expected: PASS

### Task 3: Run focused regression coverage

**Files:**
- Verify: `apps/web/tests/blog-archive-ui.test.mjs`

**Step 1: Run focused checks**

Run: `pnpm vitest run apps/web/tests/ui/blog-archive-filters.test.tsx`
Run: `node --test apps/web/tests/blog-archive-ui.test.mjs apps/web/tests/blog-tag-filter.test.mjs`

Expected: PASS
