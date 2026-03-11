# Backup V2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve current post/project metadata in app-level ZIP backups while keeping legacy ZIP restore compatibility.

**Architecture:** Extend backup serialization to a new `backup-v2` schema, keep parser compatibility for `backup-v1`, and restore new post/project fields into `Post` and `ProjectProfile` models. Media inclusion rules stay the same, but internal media references for top media and project card images are added to the archive payload.

**Tech Stack:** Python, SQLAlchemy ORM, pytest, ZIP archive metadata

---

### Task 1: Lock backup-v2 roundtrip behavior with tests

**Files:**
- Modify: `apps/api/tests/services/test_import_archive_modules.py`
- Test: `apps/api/tests/services/test_import_archive_modules.py`

**Step 1: Write the failing test**

Assert that ZIP roundtrip preserves:

- `content_kind`
- `top_media_*`
- nested `project_profile`
- `schema_version = backup-v2`

**Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/services/test_import_archive_modules.py -q`

Expected: failure because `SnapshotBundle` and archive parser do not expose the new fields.

**Step 3: Write minimal implementation**

Update archive build/parse helpers and snapshot bundle fields.

**Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/services/test_import_archive_modules.py -q`

Expected: pass.

### Task 2: Lock restore behavior for project/top-media fields

**Files:**
- Modify: `apps/api/tests/services/test_backup_restore.py`
- Modify: `apps/api/src/app/services/imports/backup_restore.py`

**Step 1: Write the failing test**

Create a ZIP with:

- `content_kind = project`
- `top_media_kind = youtube`
- `project_profile`

Assert that restore recreates:

- `Post.content_kind`
- `Post.top_media_*`
- `ProjectProfile`

**Step 2: Run test to verify it fails**

Run: `.venv\Scripts\python -m pytest tests/services/test_backup_restore.py -q`

Expected: restored row still defaults to blog/basic fields.

**Step 3: Write minimal implementation**

Restore the new fields into ORM objects while keeping old ZIP compatibility.

**Step 4: Run test to verify it passes**

Run: `.venv\Scripts\python -m pytest tests/services/test_backup_restore.py -q`

Expected: pass.

### Task 3: Include new media references during ZIP creation

**Files:**
- Modify: `apps/api/src/app/services/import_service.py`

**Step 1: Add media reference support**

Include internal object keys referenced by:

- `top_media_image_url`
- `top_media_video_url`
- `project_profile.card_image_url`

**Step 2: Add serialized metadata**

Emit root post media fields and nested `project_profile` in `meta.json`.

**Step 3: Run focused tests**

Run: `.venv\Scripts\python -m pytest tests/services/test_import_archive_modules.py tests/services/test_backup_restore.py -q`

Expected: pass.

### Task 4: Document and smoke test imports API

**Files:**
- Create: `docs/plans/backup-v2-design.md`
- Create: `docs/plans/backup-v2.md`
- Test: `apps/api/tests/api/test_imports_api.py`

**Step 1: Save design and implementation notes**

Document:

- why `backup-v2` is needed
- what fields are preserved
- `backup-v1` compatibility policy

**Step 2: Run API regression**

Run: `.venv\Scripts\python -m pytest tests/api/test_imports_api.py tests/services/test_import_archive_modules.py tests/services/test_backup_restore.py -q`

Expected: pass.
