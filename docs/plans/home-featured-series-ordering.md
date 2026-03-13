# Home Featured Series Ordering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align home `Featured Series` with the `/series` page ordering so the home section simply shows the first three series from the canonical series list.

**Architecture:** Lock the expected ordering with source-level regression tests, then remove the redundant `updatedAt` re-sort/slice logic from `listFeaturedSeries()` and the home page loader so the backend series order flows through unchanged.

**Tech Stack:** Astro, TypeScript, Node test runner

---

### Task 1: Lock the ordering contract with failing tests

**Files:**
- Modify: `apps/web/tests/home-page-layout.test.mjs`

**Step 1: Write the failing tests**

- Assert `listFeaturedSeries()` no longer sorts by `updatedAt`.
- Assert the home page does not re-sort featured series by `updatedAt` after loading.

**Step 2: Run test to verify it fails**

Run: `node --test apps/web/tests/home-page-layout.test.mjs`

Expected: FAIL because both files currently re-sort by `updatedAt`.

### Task 2: Implement the minimal ordering cleanup

**Files:**
- Modify: `apps/web/src/lib/series-db.ts`
- Modify: `apps/web/src/pages/index.astro`

**Step 1: Write minimal implementation**

- Make `listFeaturedSeries()` fetch `limit` rows and return them as-is.
- Remove the home page re-sort/slice and map the loaded series directly.

**Step 2: Run test to verify it passes**

Run: `node --test apps/web/tests/home-page-layout.test.mjs`

Expected: PASS
