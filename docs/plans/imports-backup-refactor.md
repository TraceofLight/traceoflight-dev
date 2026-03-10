# Imports Backup Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce coupling in the backup save/load flow so restore is safer, web admin ownership is clearer, and backup-related code stops repeating the same proxy/auth/archive logic.

**Architecture:** Keep the current backup HTTP contract stable while shrinking the monolithic `ImportService` into explicit responsibilities and moving web-side import management out of the footer over time. Start with low-risk boundary cleanup in the Astro proxy layer, then extract archive/restore orchestration in the API, and only after that move the admin UI to a dedicated surface.

**Tech Stack:** FastAPI, SQLAlchemy, MinIO, Astro, React, TypeScript, node:test, Vitest, pytest

---

## Current Baseline

- `apps/api/src/app/services/import_service.py` is still the main orchestration point for:
  - posts backup ZIP build
  - posts backup restore
  - media manifest fallback generation
- Web-side backup controls still live in `apps/web/src/components/public/FooterAdminModal.tsx`.
- Astro internal proxy routes exist at:
  - `apps/web/src/pages/internal-api/imports/backups/posts.zip.ts`
  - `apps/web/src/pages/internal-api/imports/backups/load.ts`
- Those routes currently duplicate:
  - admin-cookie authorization checks
  - backend unavailable handling
  - JSON/text passthrough response shaping
- There is no dedicated `/admin/imports` page yet.

## Constraints

- Do not change the current public/internal HTTP contract unless tests and docs move together.
- Do not mix unrelated public UI cleanup into this refactor.
- Prefer extraction over rewrite. Keep behavior stable first, then move ownership.
- Treat destructive restore behavior as the highest-risk part of the system.

## Refactor Order

### Phase 1: Web Proxy Cleanup

**Why first**

- Lowest blast radius.
- Immediately removes repeated route boilerplate.
- Creates a cleaner boundary before larger UI/admin moves.

**Target outcome**

- Shared helper module for imports proxy responses.
- Route files focus on auth, request parsing, and upstream path selection only.

**Files**

- Create: `apps/web/src/lib/server/imports-proxy.ts`
- Modify: `apps/web/src/pages/internal-api/imports/backups/posts.zip.ts`
- Modify: `apps/web/src/pages/internal-api/imports/backups/load.ts`
- Modify: `apps/web/tests/internal-api-imports-route.test.mjs`

**Notes**

- Keep `401`, `400`, `503`, and upstream content-type behavior stable.
- Prefer small helpers such as:
  - `unauthorizedImportsResponse()`
  - `backendUnavailableImportsResponse()`
  - `proxyTextResponse(response)`
  - `proxyBinaryResponse(response, fallbackType)`

### Phase 2: API Archive and Model Extraction

**Why second**

- `ImportService` is currently doing both data modeling and archive I/O.
- Shared dataclasses/helpers are already visible in the file and can move without changing endpoint contracts.

**Target outcome**

- Introduce a focused `app.services.imports` package.
- Move backup archive parsing and media-reference helpers out of `import_service.py`.

**Likely files**

- Create: `apps/api/src/app/services/imports/__init__.py`
- Create: `apps/api/src/app/services/imports/models.py`
- Create: `apps/api/src/app/services/imports/media_refs.py`
- Create: `apps/api/src/app/services/imports/backup_archive.py`
- Modify: `apps/api/src/app/services/import_service.py`
- Modify/Add tests around current snapshot/backup behavior

**Notes**

- The shared backup bundle model is a clear extraction candidate.
- `_extract_internal_object_key`, `_extract_markdown_media_object_keys`, `_fallback_media_manifest_entry` should become pure helpers.
- ZIP build/read logic should move next; orchestration stays in `ImportService` until restore is split.

### Phase 3: Fail-Safe Backup Restore Orchestration

**Why third**

- This is the highest-risk behavior and should only move once archive parsing is already isolated.

**Target outcome**

- Restore validates archive and stages data before destructive clear.
- Destructive DB changes happen in one explicit coordinator.

**Likely files**

- Create: `apps/api/src/app/services/imports/backup_restore.py`
- Modify: `apps/api/src/app/services/import_service.py`
- Modify: `apps/api/src/app/storage/minio_client.py`
- Modify/Add tests in `apps/api/tests/api/test_imports_api.py`
- Create/Add targeted restore service tests

**Safety rule**

- Invalid archive: no clear
- Staging failure: no clear
- DB failure after clear: rollback
- staged objects: cleanup in `finally`

### Phase 4: Move Backup Admin UI Out Of Footer

**Why fourth**

- The footer modal currently mixes login and import-management concerns.
- After proxy and API boundaries are cleaner, UI ownership can move without dragging protocol churn along with it.

**Target outcome**

- Footer keeps auth entry only.
- Backup/import controls move to `/admin/imports`.

**Likely files**

- Create: `apps/web/src/pages/admin/imports.astro`
- Create: `apps/web/src/lib/admin/imports-page.ts`
- Modify: `apps/web/src/components/Footer.astro`
- Modify: `apps/web/src/components/public/FooterAdminModal.tsx`
- Modify/Add tests:
  - `apps/web/tests/footer-admin-modal.test.mjs`
  - `apps/web/tests/ui/footer-admin-modal.test.tsx`
  - `apps/web/tests/admin-imports-page.test.mjs`

### Phase 5: Contract and Architecture Docs

**Target outcome**

- Docs reflect real module boundaries and current admin ownership.
- No document claims features that the code does not actually provide.

**Likely files**

- Modify: `docs/api/import-contract-v1.md`
- Modify: `docs/architecture/admin-post-backup-load.md`

## Immediate Execution Slice

The first slice to implement now is **Phase 1: Web Proxy Cleanup**.

That slice is intentionally small and gives us:

- less duplicated route code
- cleaner tests
- a better foundation for the later `/admin/imports` move

## Verification Checklist

- Web route source tests pass
- UI smoke/admin modal tests still pass
- Astro build passes
- No route path or response-code regressions

## Out Of Scope For This Pass

- public site visual refinements
- profile/blog/series/projects header styling
- cover-media rendering refactors outside imports/backup flow
- replacing the footer admin UX in the same slice as proxy extraction
