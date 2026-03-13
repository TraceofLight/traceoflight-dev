# Blog Published-At Ordering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore public blog chronology to `published_at` and prevent published post edits or visibility toggles from reassigning `published_at`.

**Architecture:** Update backend repository ordering and update semantics so `published_at` is only set on first publish, then map DB blog surfaces back to `published_at` in the web layer while removing public `updated_at` display. Cover the change with focused repository and source-mapping tests.

**Tech Stack:** Python, FastAPI, SQLAlchemy, Astro, Node test runner

---

### Task 1: Lock backend chronology and edit semantics with failing tests

**Files:**
- Modify: `apps/api/tests/api/test_post_tags_repository.py`

**Steps:**
1. Add a failing repository test asserting published blog lists sort by `created_at` even when `published_at` would imply a different order.
2. Add a failing repository test asserting `update_by_slug` preserves `published_at` for an already-published post edit.
3. Add a failing repository test asserting a published visibility toggle preserves `published_at`.
4. Run the focused pytest command and verify the new assertions fail for the expected reason.

### Task 2: Implement minimal backend changes

**Files:**
- Modify: `apps/api/src/app/repositories/post_repository.py`

**Steps:**
1. Change published blog ordering to use `created_at` for `latest`, `oldest`, and title tie-breaks.
2. Preserve existing `published_at` when updating an already-published post or toggling visibility.
3. Re-run the focused pytest command and verify it passes.

### Task 3: Lock web mapping with failing tests

**Files:**
- Modify: `apps/web/tests/content-provider-runtime.test.mjs`

**Steps:**
1. Change the source assertions to require DB-backed blog pages to map card dates from `createdAt`.
2. Add a failing source assertion requiring the public detail layout to stop rendering `updatedDate`.
3. Run the focused Node test and verify it fails.

### Task 4: Implement minimal web mapping changes

**Files:**
- Modify: `apps/web/src/lib/blog-db.ts`
- Modify: `apps/web/src/pages/index.astro`
- Modify: `apps/web/src/pages/blog/index.astro`
- Modify: `apps/web/src/pages/blog/[...slug].astro`

**Steps:**
1. Keep `publishedAt` as the public-facing DB blog date mapping.
2. Use `publishedAt` for public blog `pubDate` wiring in homepage, archive, and detail routes.
3. Remove public `updated_at` display from the blog detail layout.
4. Re-run the focused Node test and verify it passes.

### Task 5: Verify

**Files:**
- None

**Steps:**
1. Run the focused backend and web verification commands.
2. Report any remaining deployment or production-data follow-up separately from code verification.
