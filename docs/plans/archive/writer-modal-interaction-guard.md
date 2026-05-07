# Writer Modal Interaction Guard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop modal-open background drag-and-drop mutations in the writer and keep toast feedback readable above modal blur overlays.

**Architecture:** Reuse the existing writer modal state in `new-post-page.ts` to expose a single interaction guard callback to the media controller. The media controller will suppress window-level drop fallback while any modal layer is open, except for the publish cover drop zone, and shared writer CSS will raise the toast above modal z-layers.

**Tech Stack:** Astro, TypeScript, CSS, Node test runner

---

### Task 1: Lock the desired modal behavior with failing tests

**Files:**
- Modify: `apps/web/tests/admin-writer-script.test.mjs`
- Modify: `apps/web/tests/admin-writer-page.test.mjs`

**Step 1: Write the failing test**

- Add a script test that requires `new-post-page.ts` to define a modal interaction guard and pass it into `bindWriterMediaInteractions()`.
- Add a script test that requires `media-controller.ts` to short-circuit window drag/drop fallback while a modal interaction guard is active, except for the cover drop target.
- Add a page/style test that requires the writer toast z-index to sit above the modal layer z-index.

**Step 2: Run test to verify it fails**

Run: `node --test apps/web/tests/admin-writer-script.test.mjs apps/web/tests/admin-writer-page.test.mjs`

Expected: FAIL because the current source does not pass modal-state guard wiring into `bindWriterMediaInteractions()` and the toast z-index is still below the modal layer.

### Task 2: Implement the modal-aware drag/drop guard

**Files:**
- Modify: `apps/web/src/lib/admin/new-post-page.ts`
- Modify: `apps/web/src/lib/admin/new-post-page/media-controller.ts`

**Step 1: Write minimal implementation**

- Derive a single `isModalInteractionActive()` callback from draft, publish, and reauth layer open-state helpers.
- Extend `WriterMediaBindings` and `bindWriterMediaInteractions()` to accept that callback.
- Update the window-level drag/drop handlers to suppress fallback uploads while the callback returns `true`, but keep the publish cover drop target available.

**Step 2: Run focused test to verify it passes**

Run: `node --test apps/web/tests/admin-writer-script.test.mjs`

Expected: PASS

### Task 3: Raise toast feedback above modal layers

**Files:**
- Modify: `apps/web/src/styles/components/writer/preview.css`

**Step 1: Write minimal implementation**

- Increase the shared writer toast z-index so it renders above `writer-draft-layer` and `writer-publish-layer`.

**Step 2: Run focused test to verify it passes**

Run: `node --test apps/web/tests/admin-writer-page.test.mjs`

Expected: PASS

### Task 4: Run regression verification

**Files:**
- Verify: `apps/web/tests/admin-writer-script.test.mjs`
- Verify: `apps/web/tests/admin-writer-page.test.mjs`

**Step 1: Run related regression tests**

Run: `node --test apps/web/tests/admin-writer-script.test.mjs apps/web/tests/admin-writer-page.test.mjs`

Expected: PASS
