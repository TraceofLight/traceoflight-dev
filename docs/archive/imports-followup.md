# Imports Follow-up Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore mobile admin access, make backup restore object promotion rollback-safe, and further clean up the admin imports client boundary.

**Architecture:** Add the missing mobile navigation entry on the web side, then strengthen the API restore coordinator so object storage and DB state stay aligned across failure paths. Finish by extracting admin imports client-side request helpers to reduce component responsibility without changing behavior.

**Tech Stack:** Astro, React, TypeScript, FastAPI, SQLAlchemy, MinIO, node:test, Vitest, pytest

---

## Task 1: Lock Missing Mobile/Admin And Restore Safety Cases

**Files:**
- Modify: `apps/web/tests/public-surface-states.test.mjs`
- Modify: `apps/api/tests/services/test_backup_restore.py`

**Steps**

1. Add a source test that requires mobile admin viewers to see an `/admin/imports` entry in `MobileNavSheet`.
2. Run the web source test and confirm it fails for the expected missing link.
3. Add a restore service test proving final object keys are rolled back when DB replacement fails after promotion.
4. Run the API restore test and confirm it fails for the expected missing rollback.

## Task 2: Implement Mobile Entry And Restore Rollback

**Files:**
- Modify: `apps/web/src/components/public/MobileNavSheet.tsx`
- Modify: `apps/api/src/app/services/imports/backup_restore.py`
- Modify: `apps/api/src/app/storage/minio_client.py`

**Steps**

1. Add the admin imports link to the mobile sheet for admin viewers.
2. Add storage helpers needed for rollback-safe restore if the current client surface is insufficient.
3. Update `BackupRestoreCoordinator` to snapshot overwritten objects, promote staged objects, and restore/delete final keys on failure.
4. Re-run the targeted failing tests until both are green.

## Task 3: Refactor Admin Imports Client Logic

**Files:**
- Create: `apps/web/src/lib/admin/imports-client.ts`
- Modify: `apps/web/src/components/public/AdminImportsPanel.tsx`
- Modify: `apps/web/tests/admin-imports-page.test.mjs`
- Modify: `apps/web/tests/ui/admin-imports-panel.test.tsx`

**Steps**

1. Add a small helper module for safe JSON reads, error extraction, and backup requests.
2. Update `AdminImportsPanel` to use the helper module while keeping UI behavior stable.
3. Extend tests just enough to lock the new boundary.
4. Re-run targeted web tests to keep the refactor behavior-neutral.

## Task 4: Verify End-To-End

**Files:**
- Verify only

**Steps**

1. Run API tests:
   - `.venv\Scripts\python -m pytest tests/services/test_backup_restore.py tests/services/test_import_archive_modules.py tests/api/test_imports_api.py`
2. Run web source tests:
   - `node --test tests/public-surface-states.test.mjs tests/footer-admin-modal.test.mjs tests/admin-imports-page.test.mjs tests/internal-api-imports-route.test.mjs`
3. Run web UI tests:
   - `npm run test:ui -- admin-imports-panel footer-admin-modal theme-toggle`
4. Run web build:
   - `npm run build`
