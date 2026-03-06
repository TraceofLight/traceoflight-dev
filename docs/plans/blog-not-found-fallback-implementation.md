# Blog Not Found Fallback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the deleted/missing blog post fallback page with a real user-facing empty state and remove remaining non-project lorem ipsum from shared site copy.

**Architecture:** Keep the change local to the web app. Extract a small shared empty-state section component so the blog fallback page stops hardcoding placeholder copy, then update shared site metadata copy in `consts.ts`. Lock the behavior with one focused web test.

**Tech Stack:** Astro, Node test guards, shared Astro components

---

### Task 1: Lock the desired fallback behavior with a failing test

**Files:**
- Modify: `apps/web/tests/footer-copy.test.mjs`

**Step 1: Write the failing test**

Add assertions that:
- `apps/web/src/consts.ts` no longer contains `Lorem ipsum`
- `apps/web/src/pages/blog/[...slug].astro` renders:
  - `게시글을 찾을 수 없습니다`
  - `삭제되었거나 비공개로 전환된 글일 수 있습니다.`
  - `블로그로 돌아가기`

**Step 2: Run test to verify it fails**

Run: `npm --prefix apps/web run test:guards -- footer-copy.test.mjs`
Expected: FAIL because the current fallback page and `SITE_DESCRIPTION` still contain lorem ipsum.

### Task 2: Replace placeholder fallback UI with a shared component

**Files:**
- Create: `apps/web/src/components/EmptyStateNotice.astro`
- Modify: `apps/web/src/pages/blog/[...slug].astro`
- Modify: `apps/web/src/consts.ts`

**Step 1: Write minimal implementation**

- Create a small reusable Astro component with props for `title`, `description`, `href`, and `actionLabel`
- Replace the blog fallback page’s lorem text with the shared component
- Replace `SITE_DESCRIPTION` with real TraceofLight copy

**Step 2: Run the targeted test**

Run: `npm --prefix apps/web run test:guards -- footer-copy.test.mjs`
Expected: PASS

### Task 3: Verify the web app still builds cleanly

**Files:**
- No additional code changes expected

**Step 1: Run the web guard suite**

Run: `npm --prefix apps/web run test:guards`
Expected: PASS

**Step 2: Run production build**

Run: `npm --prefix apps/web run build`
Expected: PASS, with only pre-existing warnings if any.
