# Writer And Import Seams Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce the remaining complexity in the admin writer bootstrap and import service by extracting bounded coordinators/adapters while preserving behavior.

**Architecture:** Keep the public entrypoints stable. On the web side, `initNewPostAdminPage()` remains the bootstrap and delegates loader/media behavior to helper modules. On the API side, `ImportService` remains the entrypoint and delegates backup archive and restore details to import submodules.

**Tech Stack:** Astro, TypeScript, Node test runner, Python, pytest, SQLAlchemy

---

### Task 1: Extract writer loader/query coordinator

**Files:**
- Create: `apps/web/src/lib/admin/new-post-page/loaders.ts`
- Modify: `apps/web/src/lib/admin/new-post-page.ts`
- Test: `apps/web/tests/admin-writer-script.test.mjs`

**Step 1: Write the failing test**

- Assert `new-post-page.ts` imports `createWriterLoaders`.
- Assert the source no longer owns `loadTagSuggestions`, `loadSeriesSuggestions`, and `loadDraftList` inline.

**Step 2: Run test to verify it fails**

Run: `node --test apps/web/tests/admin-writer-script.test.mjs`

**Step 3: Write minimal implementation**

- Create a loader factory that receives DOM/state dependencies.
- Move tag/series/draft/post loading code behind that factory.
- Keep the existing `initNewPostAdminPage()` call flow intact.

**Step 4: Run test to verify it passes**

Run: `node --test apps/web/tests/admin-writer-script.test.mjs`

### Task 2: Extract writer media/drag coordinator

**Files:**
- Create: `apps/web/src/lib/admin/new-post-page/media-controller.ts`
- Modify: `apps/web/src/lib/admin/new-post-page.ts`
- Test: `apps/web/tests/admin-writer-script.test.mjs`

**Step 1: Write the failing test**

- Assert `new-post-page.ts` imports `bindWriterMediaInteractions`.
- Assert the direct drag/drop and upload event wiring moves out of the top-level bootstrap.

**Step 2: Run test to verify it fails**

Run: `node --test apps/web/tests/admin-writer-script.test.mjs`

**Step 3: Write minimal implementation**

- Move body/cover upload flows and global drag/drop listeners into the new module.
- Return a teardown function so the existing bootstrap cleanup remains explicit.

**Step 4: Run test to verify it passes**

Run: `node --test apps/web/tests/admin-writer-script.test.mjs`

### Task 3: Extract backup archive and restore seams

**Files:**
- Create: `apps/api/src/app/services/imports/backup_archive.py`
- Create: `apps/api/src/app/services/imports/backup_restore.py`
- Modify: `apps/api/src/app/services/import_service.py`
- Test: `apps/api/tests/services/test_import_archive_modules.py`
- Test: `apps/api/tests/services/test_backup_restore.py`

**Step 1: Write the failing test**

- Assert backup archive parsing can be tested directly through the extracted module.
- Assert restore coordination can be tested without routing through the full service.

**Step 2: Run test to verify it fails**

Run: `apps/api/.venv/Scripts/python -m pytest tests/services/test_import_archive_modules.py tests/services/test_backup_restore.py -q`

**Step 3: Write minimal implementation**

- Move backup ZIP build/read into `backup_archive.py`.
- Move destructive restore coordination into `backup_restore.py`.
- Keep `ImportService` as a thin backup-only entrypoint.

**Step 4: Run test to verify it passes**

Run: `apps/api/.venv/Scripts/python -m pytest tests/services/test_import_archive_modules.py tests/services/test_backup_restore.py -q`

### Task 4: Verify full refactor surface

**Files:**
- Modify: only if required by broken tests

**Step 1: Run focused web tests**

Run: `cd apps/web && node --test tests/admin-writer-script.test.mjs tests/admin-writer-page.test.mjs tests/admin-writer-tags.test.mjs tests/admin-writer-upload-proxy.test.mjs`

**Step 2: Run focused API tests**

Run: `cd apps/api && .venv\\Scripts\\python -m pytest tests/services/test_import_archive_modules.py tests/services/test_backup_restore.py tests/api/test_imports_api.py`

**Step 3: Run UI/build verification**

Run:
- `cd apps/web && npm run test:ui -- admin-imports-panel`
- `cd apps/web && npm run build`

**Step 4: Review residual follow-up**

- Note whether `new-post-page.ts` and `import_service.py` still need one more split after this pass.
