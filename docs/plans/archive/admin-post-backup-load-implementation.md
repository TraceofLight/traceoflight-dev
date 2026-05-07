# Admin Post Backup Save/Load Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the admin Velog migration flow with a DB-backed ZIP save/load backup workflow including media binaries and series cover override restoration.

**Architecture:** The backend exports a self-contained ZIP from current DB posts and media. Restore validates ZIP content, stages media back to object storage with preserved object keys, clears current posts only after validation passes, recreates posts from the ZIP, rebuilds series projection, and reapplies series cover overrides. The frontend admin footer modal switches from snapshot controls to download/upload controls.

**Tech Stack:** FastAPI, Astro, MinIO, pytest, node:test

---

### Task 1: Define backup API contracts and regression tests

**Files:**
- Modify: `apps/api/tests/api/test_imports_api.py`
- Modify: `apps/api/tests/services/test_import_service_series.py`
- Modify: `apps/web/tests/footer-admin-modal.test.mjs`

**Step 1: Write failing backend API tests**
- Add test for backup download endpoint contract.
- Add test for backup load endpoint contract.

**Step 2: Write failing backup service tests**
- Assert save path builds ZIP with post meta, content, media payloads, and series override payload.
- Assert load path clears posts only after ZIP validation and media staging succeed.

**Step 3: Write failing frontend tests**
- Assert footer modal no longer references Velog snapshot UI.
- Assert save/load button labels and file upload control exist.

**Step 4: Run targeted tests and verify failure**
- `cd apps/api && .\.venv\Scripts\python.exe -m pytest -q tests/api/test_imports_api.py tests/services/test_import_service_series.py`
- `npm --prefix apps/web run test:guards -- footer-admin-modal.test.mjs`

### Task 2: Implement backend backup export/import service

**Files:**
- Modify: `apps/api/src/app/services/import_service.py`
- Modify: `apps/api/src/app/schemas/imports.py`
- Modify: `apps/api/src/app/services/post_service.py`
- Modify: `apps/api/src/app/repositories/post_repository.py`
- Modify: `apps/api/src/app/storage/minio_client.py`
- Modify: `apps/api/src/app/api/v1/endpoints/imports.py`
- Check: `apps/api/src/app/services/series_projection_cache.py`
- Check: `apps/api/src/app/repositories/series_repository.py`

**Step 1: Add save/load schemas**
- Add response schema for backup save metadata.
- Add response schema for backup load summary.

**Step 2: Add storage helpers**
- Add object-read helper for binary download if missing.
- Add file/path-safe ZIP media staging helpers.

**Step 3: Implement ZIP export**
- Read all posts.
- Collect internal media refs from cover image and markdown.
- Export binaries with preserved object keys and URLs.
- Export series cover overrides.

**Step 4: Implement ZIP load**
- Validate manifest and entry completeness.
- Stage media binaries first.
- Clear current posts.
- Recreate posts with preserved `/media/...` URLs.
- Trigger series rebuild and reapply series cover overrides.

**Step 5: Expose endpoints**
- `GET /api/v1/imports/backups/posts.zip`
- `POST /api/v1/imports/backups/load`

### Task 3: Replace frontend admin modal controls

**Files:**
- Modify: `apps/web/src/components/Footer.astro`
- Modify: `apps/web/src/pages/internal-api/imports/snapshots/velog.ts`
- Modify: `apps/web/src/pages/internal-api/imports/snapshots/[snapshotId]/jobs.ts`
- Create: `apps/web/src/pages/internal-api/imports/backups/posts.zip.ts`
- Create: `apps/web/src/pages/internal-api/imports/backups/load.ts`

**Step 1: Remove Velog-specific admin modal controls**
- Delete username/snapshot inputs and old feedback copy.

**Step 2: Add save control**
- Download ZIP through internal proxy route.

**Step 3: Add load control**
- File picker/upload request through internal proxy route.

**Step 4: Keep auth behavior identical**
- Only admin viewer can see and use the controls.

### Task 4: Verification and cleanup

**Files:**
- Modify only if verification reveals issue.

**Step 1: Run backend tests**
- `cd apps/api && .\.venv\Scripts\python.exe -m pytest -q`

**Step 2: Run web tests**
- `npm --prefix apps/web run test:guards`

**Step 3: Run build**
- `npm --prefix apps/web run build`

**Step 4: Stage only backup save/load files**
- `git add ...`
