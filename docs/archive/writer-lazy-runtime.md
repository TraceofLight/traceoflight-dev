# Writer Lazy Runtime Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split the admin writer's heaviest editor and preview runtime out of the initial client bundle by lazy-loading them on demand.

**Architecture:** Keep the public writer entrypoints intact. Make the editor bridge and markdown renderer async runtime factories, then adapt the writer bootstrap to cache and reuse those lazy-loaded runtimes. Keep the server/blog renderer on full `highlight.js`, but load `highlight.js/lib/common` for the admin preview to trim the lazy chunk. Add only minimal bundler config if the emitted split needs stabilization.

**Tech Stack:** Astro, TypeScript, Vite, Node test runner

---

### Task 1: Lock lazy editor expectations with tests

**Files:**
- Modify: `apps/web/tests/admin-writer-script.test.mjs`
- Test: `apps/web/tests/admin-writer-script.test.mjs`

**Step 1: Write the failing test**

- Assert `editor-bridge.ts` uses dynamic `import(...)` for Milkdown runtime.
- Assert top-level static imports for `@milkdown/crepe` are gone.

**Step 2: Run test to verify it fails**

Run: `cd apps/web && node --test tests/admin-writer-script.test.mjs`

**Step 3: Write minimal implementation**

- Lazy-load Milkdown and related CSS inside `createEditorBridge()`.

**Step 4: Run test to verify it passes**

Run: `cd apps/web && node --test tests/admin-writer-script.test.mjs`

### Task 2: Lock lazy markdown preview expectations with tests

**Files:**
- Modify: `apps/web/tests/admin-writer-markdown-renderer.test.mjs`
- Modify: `apps/web/tests/admin-writer-script.test.mjs`
- Test: `apps/web/tests/admin-writer-markdown-renderer.test.mjs`

**Step 1: Write the failing test**

- Assert the writer lazy renderer exists separately from the sync blog renderer.
- Assert `markdown-it` and `highlight.js/lib/common` are loaded via dynamic import.

**Step 2: Run test to verify it fails**

Run: `cd apps/web && node --test tests/admin-writer-markdown-renderer.test.mjs tests/admin-writer-script.test.mjs`

**Step 3: Write minimal implementation**

- Add a lazy preview renderer module that loads `markdown-it` and `highlight.js/lib/common`.
- Adapt `new-post-page.ts` to await and cache the renderer during preview refresh.

**Step 4: Run test to verify it passes**

Run: `cd apps/web && node --test tests/admin-writer-markdown-renderer.test.mjs tests/admin-writer-script.test.mjs`

### Task 3: Stabilize emitted writer chunks only if needed

**Files:**
- Modify: `apps/web/astro.config.mjs`
- Test: `apps/web` build output

**Step 1: Write the failing expectation**

- Use build inspection to confirm whether the lazy split still collapses into one large writer chunk.

**Step 2: Run build to verify the need**

Run: `cd apps/web && npm run build`

**Step 3: Write minimal implementation**

- Add a narrow `manualChunks` rule only for writer runtime libraries if necessary.

**Step 4: Run build to verify**

Run: `cd apps/web && npm run build`

### Task 4: Full verification

**Files:**
- Modify only if broken tests require it

**Step 1: Run focused source tests**

Run: `cd apps/web && node --test tests/admin-writer-script.test.mjs tests/admin-writer-markdown-renderer.test.mjs tests/admin-writer-page.test.mjs tests/admin-writer-tags.test.mjs tests/admin-writer-upload-proxy.test.mjs`

**Step 2: Run UI regression tests**

Run: `cd apps/web && npm run test:ui -- footer-admin-modal admin-imports-panel`

**Step 3: Run build verification**

Run: `cd apps/web && npm run build`

**Step 4: Inspect result**

- Confirm whether the original large `new-post-page` bundle shrank.
- Note any remaining large chunk warnings and their new source.
