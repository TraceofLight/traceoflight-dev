# Writer Submit Guard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop accidental publish submits from the writer so `published_at` cannot change unless the user explicitly presses the publish submit button.

**Architecture:** Tighten the writer submit state machine in `submit.ts` so only explicit publish actions resolve to `published`, then add a UI guard in `new-post-page.ts` so pressing Enter inside the series input never submits the form. Lock both rules with focused source-level regression tests.

**Tech Stack:** Astro, TypeScript, Node test runner

---

### Task 1: Lock the broken behavior with tests

**Files:**
- Modify: `apps/web/tests/admin-writer-script.test.mjs`

**Step 1: Write the failing test**

- Add a test that asserts `resolveSubmitStatus()` no longer promotes `submitterIsNull` submits to `published`.
- Add a test that asserts the series input registers a `keydown` Enter guard with `preventDefault()`.

**Step 2: Run test to verify it fails**

Run: `node --test apps/web/tests/admin-writer-script.test.mjs`

Expected: FAIL because the current source still contains the `submitterIsNull && publishLayerOpen` publish promotion and has no Enter guard on `seriesInput`.

### Task 2: Implement the minimal submit guards

**Files:**
- Modify: `apps/web/src/lib/admin/new-post-page/submit.ts`
- Modify: `apps/web/src/lib/admin/new-post-page.ts`

**Step 1: Write minimal implementation**

- Remove the implicit publish promotion for `submitterIsNull`.
- Add a `seriesInput` `keydown` handler that blocks Enter from submitting the form.

**Step 2: Run focused test to verify it passes**

Run: `node --test apps/web/tests/admin-writer-script.test.mjs`

Expected: PASS

### Task 3: Run broader regression coverage

**Files:**
- Verify: `apps/web/tests/content-provider-runtime.test.mjs`

**Step 1: Run related regression tests**

Run: `node --test apps/web/tests/admin-writer-script.test.mjs apps/web/tests/content-provider-runtime.test.mjs`

Expected: PASS
