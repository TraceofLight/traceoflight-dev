# Remove Velog Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the obsolete Velog snapshot and snapshot-job flow from API, web proxy, tests, and docs while keeping DB backup import support intact.

**Architecture:** Treat the old snapshot model as dead product surface. First lock the expected absence in focused tests, then remove the API routes, schema, and service wiring, followed by the web proxy routes and stale documentation references.

**Tech Stack:** FastAPI, Python, Astro, TypeScript, Node test runner, pytest

---

### Task 1: Lock the removal in tests

**Files:**
- Modify: `apps/api/tests/api/test_imports_api.py`
- Modify: `apps/web/tests/internal-api-imports-route.test.mjs`
- Test: `apps/api/tests/api/test_imports_api.py`
- Test: `apps/web/tests/internal-api-imports-route.test.mjs`

**Step 1: Write the failing test**

- Assert the API tests only target backup endpoints and treat snapshot paths as removed.
- Assert the internal-api imports route test only expects backup proxy files.

**Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/api/test_imports_api.py -q`
Run: `cd apps/web && node --test tests/internal-api-imports-route.test.mjs`

**Step 3: Write minimal implementation**

- Remove the stale Velog expectations from the tests only after confirming they fail against the current code.

**Step 4: Run test to verify it passes**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/api/test_imports_api.py -q`
Run: `cd apps/web && node --test tests/internal-api-imports-route.test.mjs`

### Task 2: Remove API snapshot support

**Files:**
- Modify: `apps/api/src/app/api/v1/endpoints/imports.py`
- Modify: `apps/api/src/app/schemas/imports.py`
- Modify: `apps/api/src/app/services/import_service.py`
- Modify: `apps/api/src/app/services/imports/__init__.py`
- Delete: `apps/api/src/app/services/imports/snapshot_archive.py`
- Delete: `apps/api/src/app/services/imports/velog_client.py`
- Delete: `apps/api/src/app/services/imports/velog_source.py`
- Delete: `apps/api/tests/services/test_import_service_series.py`
- Modify: `apps/api/tests/services/test_import_archive_modules.py`
- Test: `apps/api/tests/api/test_imports_api.py`

**Step 1: Write the failing test**

- Assert the imports API no longer exposes snapshot create or snapshot job paths.

**Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/api/test_imports_api.py -q`

**Step 3: Write minimal implementation**

- Delete the snapshot endpoints, schema payloads, and service methods.
- Remove snapshot-related imports/exports and delete the now-unused modules and service tests.

**Step 4: Run test to verify it passes**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/api/test_imports_api.py -q`

### Task 3: Remove the web snapshot proxy paths

**Files:**
- Delete: `apps/web/src/pages/internal-api/imports/snapshots/velog.ts`
- Delete: `apps/web/src/pages/internal-api/imports/snapshots/[snapshotId]/jobs.ts`
- Modify: `apps/web/tests/internal-api-imports-route.test.mjs`
- Test: `apps/web/tests/internal-api-imports-route.test.mjs`

**Step 1: Write the failing test**

- Assert only backup proxy files remain part of the imports route test.

**Step 2: Run test to verify it fails**

Run: `cd apps/web && node --test tests/internal-api-imports-route.test.mjs`

**Step 3: Write minimal implementation**

- Delete the snapshot proxy files.

**Step 4: Run test to verify it passes**

Run: `cd apps/web && node --test tests/internal-api-imports-route.test.mjs`

### Task 4: Rewrite stale docs and verify

**Files:**
- Modify: `docs/api/import-contract-v1.md`
- Delete: `docs/architecture/admin-velog-one-time-migration.md`
- Modify: `docs/architecture/admin-post-backup-load.md`
- Modify: `docs/plans/imports-backup-refactor.md`
- Modify: `docs/plans/writer-import-seams-design.md`
- Modify: `docs/plans/writer-import-seams.md`

**Step 1: Update docs**

- Remove descriptions of Velog snapshot creation as a supported path.
- Keep only references that remain historically necessary and reframe them as deprecated/removed if needed.

**Step 2: Run focused verification**

Run: `cd apps/api && .venv\Scripts\python -m pytest tests/api/test_imports_api.py tests/services/test_backup_restore.py tests/services/test_import_archive_modules.py -q`
Run: `cd apps/web && node --test tests/internal-api-imports-route.test.mjs tests/admin-imports-page.test.mjs tests/footer-admin-modal.test.mjs`

**Step 3: Run build verification**

Run: `cd apps/web && npm run build`
