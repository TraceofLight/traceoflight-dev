# Media Orphan Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Delete media objects and `media_assets` rows that have not been referenced anywhere in saved content for more than 7 days.

**Architecture:** Compute a global set of referenced internal media object keys from posts, project profiles, and series rows, then purge unreferenced `media_assets` older than the configured retention period. Run this purge inside the existing draft cleanup maintenance loop.

**Tech Stack:** FastAPI, SQLAlchemy, MinIO storage client, pytest

---

### Task 1: Add failing orphan cleanup tests

**Files:**
- Modify: `apps/api/tests/services/test_draft_cleanup_scheduler.py`
- Create: `apps/api/tests/services/test_media_cleanup_service.py`

**Step 1: Write failing tests**

Add tests for:

- referenced media survives cleanup
- orphan media older than 7 days is deleted from storage and DB
- orphan media newer than 7 days is kept
- markdown/project/series references all count
- scheduler loop invokes orphan cleanup alongside draft cleanup

**Step 2: Run tests to verify failure**

Run:

```bash
cd apps/api
.venv\Scripts\python -m pytest tests/services/test_media_cleanup_service.py tests/services/test_draft_cleanup_scheduler.py -q
```

Expected: failures for missing cleanup service / missing scheduler integration.

### Task 2: Implement reference scanning and orphan cleanup

**Files:**
- Create: `apps/api/src/app/services/media_cleanup_service.py`
- Modify: `apps/api/src/app/core/config.py`

**Step 1: Implement reference scanning**

Collect internal media object keys from:

- post cover image
- post top image/video
- post body markdown
- project card image
- series cover image

**Step 2: Implement retention-based purge**

Delete only assets older than `MEDIA_ORPHAN_RETENTION_DAYS`.

**Step 3: Remove storage object then DB row**

Treat missing storage objects as cleanup success for DB row removal.

### Task 3: Integrate with scheduler

**Files:**
- Modify: `apps/api/src/app/services/draft_cleanup_scheduler.py`

**Step 1: Wire orphan cleanup into maintenance loop**

Run orphan cleanup after draft cleanup in the same window.

**Step 2: Preserve current schedule semantics**

Do not change `_next_run_at()` behavior.

### Task 4: Verify

**Files:**
- Test: `apps/api/tests/services/test_media_cleanup_service.py`
- Test: `apps/api/tests/services/test_draft_cleanup_scheduler.py`

**Step 1: Run focused tests**

```bash
cd apps/api
.venv\Scripts\python -m pytest tests/services/test_media_cleanup_service.py tests/services/test_draft_cleanup_scheduler.py -q
```

Expected: all pass.

**Step 2: Run wider regression**

```bash
cd apps/api
.venv\Scripts\python -m pytest tests/services/test_backup_restore.py tests/services/test_import_archive_modules.py -q
```

Expected: all pass.
