# Writer Preview Renderer Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the admin writer preview so repeated body edits preserve heavy media nodes instead of remounting them on every preview refresh.

**Architecture:** Introduce a dedicated preview renderer module that owns stable top-media and body containers. The writer page script will build a preview state object and ask that renderer to update incrementally, while tests verify that identical iframe/video elements are reused across successive renders.

**Tech Stack:** Astro, TypeScript, DOM APIs, JSDOM, Node test runner

---

### Task 1: Lock preview media preservation with failing tests

**Files:**
- Create: `apps/web/tests/admin-writer-preview-renderer.test.ts`

**Step 1: Write the failing tests**

- Assert top-media YouTube iframe nodes are reused when body text changes but the media URL stays the same.
- Assert body-embedded iframe and video nodes are reused when surrounding HTML changes but the media sources stay the same.

**Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/admin-writer-preview-renderer.test.ts`

Expected: FAIL because the current preview implementation rebuilds media DOM from HTML strings.

### Task 2: Add the preview renderer module

**Files:**
- Create: `apps/web/src/lib/admin/new-post-page/preview-renderer.ts`

**Step 1: Write minimal implementation**

- Create a renderer factory that owns preview DOM slots.
- Preserve top-media nodes when media signature is unchanged.
- Preserve body iframe/video nodes by moving matching existing nodes into the next parsed tree before swapping body children.

**Step 2: Run test to verify it passes**

Run: `node --import tsx --test tests/admin-writer-preview-renderer.test.ts`

Expected: PASS

### Task 3: Wire the writer page to the renderer

**Files:**
- Modify: `apps/web/src/lib/admin/new-post-page.ts`

**Step 1: Write minimal implementation**

- Replace `previewContent.innerHTML` usage with preview renderer calls.
- Keep title, metadata, and cover preview updates as-is.

**Step 2: Run focused writer tests**

Run: `node --import tsx --test tests/admin-writer-preview-renderer.test.ts tests/admin-writer-preview.test.ts`

Expected: PASS

### Task 4: Run focused regression coverage

**Files:**
- Verify: `apps/web/tests/admin-writer-page.test.mjs`
- Verify: `apps/web/tests/modularization.test.mjs`

**Step 1: Run focused checks**

Run: `node --import tsx --test tests/admin-writer-preview-renderer.test.ts tests/admin-writer-preview.test.ts`
Run: `node --test tests/admin-writer-page.test.mjs tests/modularization.test.mjs`

Expected: PASS
