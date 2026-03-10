# Writer Lazy Runtime Design

**Date:** 2026-03-10

## Goal

Reduce the admin writer client bundle by moving the heavy editor and markdown preview runtime behind lazy boundaries, without changing the public writer behavior.

## Context

- `apps/web/src/lib/admin/new-post-page.ts` is no longer the main structural problem.
- The remaining build warning comes from the writer runtime bundle itself.
- The heaviest direct dependencies in the writer path are:
  - `@milkdown/crepe`
  - its theme CSS imports
  - `markdown-it`
  - `highlight.js`

## Options

### 1. Vite `manualChunks` only

- Pros: minimal code changes.
- Cons: mostly changes file grouping, not load timing. The writer page would still eagerly download the same runtime.

### 2. Route-level lazy bootstrap

- Pros: can reduce initial work further.
- Cons: requires more page-script restructuring and adds risk around writer startup timing.

### 3. Lazy-load heavy editor/runtime dependencies inside the writer modules

- Pros: best cost/benefit for the current codebase, keeps entrypoints stable, targets the actual heavy libraries.
- Cons: introduces async initialization paths that need test coverage.

## Decision

Use option 3, with a small optional `manualChunks` assist if the resulting split needs naming stability.

## Design

### Editor runtime

- `createEditorBridge()` will stop importing Milkdown at module evaluation time.
- It will dynamically import:
  - `@milkdown/crepe`
  - `@milkdown/utils`
  - the Crepe theme CSS files
- The fallback textarea behavior remains the same if lazy init fails.

### Preview runtime

- `createMarkdownRenderer()` becomes async.
- `markdown-it` and `highlight.js/lib/common` are loaded only when preview rendering is first needed.
- The renderer instance is cached after first load.

### Writer bootstrap

- `new-post-page.ts` will cache the lazy preview renderer promise and reuse it.
- Preview refresh keeps the same public behavior, but the first refresh waits for the renderer once.
- Existing empty-preview and fallback behavior stay intact.

### Build behavior

- If needed, add a narrow writer-specific `manualChunks` rule in `apps/web/astro.config.mjs` so the lazy runtime is emitted into stable separate chunks.

## Testing

- Source tests first:
  - assert dynamic imports exist in `editor-bridge.ts`
  - assert markdown renderer is async and lazy
- Then run writer source tests, type/build verification, and compare build output for separated chunks.
