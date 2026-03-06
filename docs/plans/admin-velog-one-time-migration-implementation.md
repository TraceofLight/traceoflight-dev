# Admin Velog One-Time Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a two-stage migration system where Velog data is first captured as reusable snapshots, then imported into the blog from selected snapshots in `dry_run` or `apply` mode without recrawling.

**Architecture:** Freeze a snapshot-first contract, add snapshot and import persistence, build Velog and ZIP snapshot producers, and execute import jobs only from snapshot artifacts. Frontend admin UI follows explicit Step 1 (snapshot) and Step 2 (import) flow with polling and failure inspection.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic + Pydantic v2 + pytest, Astro SSR + TypeScript + node tests, MinIO object storage.

---

### Task 1: Freeze Two-Stage Contract (Sequential Design Anchor)

**Files:**
- Modify: `docs/api/import-contract-v1.md`
- Modify: `docs/architecture/admin-velog-one-time-migration.md`

**Step 1: Write failing contract checklist**

- Ensure direct execution endpoints are removed:
  - no `POST /api/v1/imports/velog/jobs`
  - no `POST /api/v1/imports/zip/jobs`
- Ensure two-stage endpoints exist:
  - snapshot create/read/download
  - import job from `snapshot_id`.

**Step 2: Verify red state**

Run:

```bash
rg -n "/imports/velog/jobs|/imports/zip/jobs|/imports/snapshots/.*/jobs|snapshot" docs/api/import-contract-v1.md docs/architecture/admin-velog-one-time-migration.md
```

Expected: direct-job references are missing, snapshot-first references are present.

**Step 3: Minimal implementation**

- Lock enum and payload names for:
  - `SnapshotStatus`
  - `ImportJobStatus`
  - `ImportMode`
- Lock `dry_run` behavior: no post/media/mapping writes.

**Step 4: Verify green state**

Run:

```bash
rg -n "SnapshotStatus|ImportMode|dry_run|post_source_mappings" docs/api/import-contract-v1.md
```

Expected: all required anchors are present.

**Step 5: Commit**

```bash
git add docs/api/import-contract-v1.md docs/architecture/admin-velog-one-time-migration.md
git commit -m "docs: freeze snapshot-first two-stage import contract"
```

### Task 2: Add Persistence for Snapshots, Jobs, and Source Mappings

**Files:**
- Create: `apps/api/src/app/models/import_snapshot.py`
- Create: `apps/api/src/app/models/import_job.py`
- Modify: `apps/api/src/app/models/__init__.py`
- Create: `apps/api/alembic/versions/add_import_snapshots_jobs_and_source_mappings.py`
- Create: `apps/api/src/app/repositories/import_snapshot_repository.py`
- Create: `apps/api/src/app/repositories/import_job_repository.py`
- Create: `apps/api/src/app/repositories/source_mapping_repository.py`
- Create: `apps/api/tests/api/test_import_persistence.py`

**Step 1: Write failing tests**

- Snapshot tables persist status and artifact metadata.
- Import jobs reference `snapshot_id`.
- Source mapping enforces unique `(source_provider, external_post_id)`.

**Step 2: Verify red state**

Run:

```bash
cd apps/api
pytest tests/api/test_import_persistence.py -q
```

Expected: FAIL because models and migrations are missing.

**Step 3: Minimal implementation**

- Add snapshot, snapshot-item, job, and job-item persistence.
- Keep fields minimal but sufficient for replay and auditing.

**Step 4: Verify green state**

Run:

```bash
cd apps/api
pytest tests/api/test_import_persistence.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/app/models/import_snapshot.py apps/api/src/app/models/import_job.py apps/api/src/app/models/__init__.py apps/api/alembic/versions/add_import_snapshots_jobs_and_source_mappings.py apps/api/src/app/repositories/import_snapshot_repository.py apps/api/src/app/repositories/import_job_repository.py apps/api/src/app/repositories/source_mapping_repository.py apps/api/tests/api/test_import_persistence.py
git commit -m "feat(api): add snapshot and import job persistence"
```

### Task 3: Implement Snapshot Builders (Velog Crawl + ZIP Upload)

**Files:**
- Create: `apps/api/src/app/importing/types.py`
- Create: `apps/api/src/app/importing/velog_client.py`
- Create: `apps/api/src/app/importing/velog_snapshot_builder.py`
- Create: `apps/api/src/app/importing/zip_snapshot_builder.py`
- Create: `apps/api/src/app/importing/snapshot_packager.py`
- Create: `apps/api/tests/services/test_velog_snapshot_builder.py`
- Create: `apps/api/tests/services/test_zip_snapshot_builder.py`

**Step 1: Write failing tests**

- Velog builder crawls and emits normalized ordered bundles.
- ZIP builder validates package and emits normalized bundles.
- Packager creates snapshot artifact and checksum metadata.

**Step 2: Verify red state**

Run:

```bash
cd apps/api
pytest tests/services/test_velog_snapshot_builder.py tests/services/test_zip_snapshot_builder.py -q
```

Expected: FAIL because snapshot builders are missing.

**Step 3: Minimal implementation**

- Build canonical bundles and write snapshot ZIP artifact.
- Persist snapshot item metadata and set snapshot status transitions.

**Step 4: Verify green state**

Run:

```bash
cd apps/api
pytest tests/services/test_velog_snapshot_builder.py tests/services/test_zip_snapshot_builder.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/app/importing/types.py apps/api/src/app/importing/velog_client.py apps/api/src/app/importing/velog_snapshot_builder.py apps/api/src/app/importing/zip_snapshot_builder.py apps/api/src/app/importing/snapshot_packager.py apps/api/tests/services/test_velog_snapshot_builder.py apps/api/tests/services/test_zip_snapshot_builder.py
git commit -m "feat(api): implement snapshot builders for velog and zip sources"
```

### Task 4: Expose Snapshot APIs

**Files:**
- Create: `apps/api/src/app/schemas/import_snapshot.py`
- Create: `apps/api/src/app/api/v1/endpoints/import_snapshots.py`
- Modify: `apps/api/src/app/api/v1/router.py`
- Modify: `apps/api/src/app/api/deps.py`
- Create: `apps/api/tests/api/test_import_snapshots_api.py`
- Modify: `apps/api/tests/api/test_openapi_docs.py`

**Step 1: Write failing tests**

- API tests for:
  - `POST /imports/snapshots/velog`
  - `POST /imports/snapshots/zip`
  - `GET /imports/snapshots/{id}`
  - `GET /imports/snapshots/{id}/items`
  - `GET /imports/snapshots/{id}/download`.

**Step 2: Verify red state**

Run:

```bash
cd apps/api
pytest tests/api/test_import_snapshots_api.py tests/api/test_openapi_docs.py -q
```

Expected: FAIL because snapshot endpoints are not registered.

**Step 3: Minimal implementation**

- Add snapshot endpoint router with existing internal-secret guard.
- Implement status and artifact lookup responses.

**Step 4: Verify green state**

Run:

```bash
cd apps/api
pytest tests/api/test_import_snapshots_api.py tests/api/test_openapi_docs.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/app/schemas/import_snapshot.py apps/api/src/app/api/v1/endpoints/import_snapshots.py apps/api/src/app/api/v1/router.py apps/api/src/app/api/deps.py apps/api/tests/api/test_import_snapshots_api.py apps/api/tests/api/test_openapi_docs.py
git commit -m "feat(api): expose snapshot creation and retrieval endpoints"
```

### Task 5: Implement Import Executor from Snapshot

**Files:**
- Create: `apps/api/src/app/importing/import_executor.py`
- Create: `apps/api/src/app/importing/media_ingest.py`
- Create: `apps/api/src/app/importing/markdown_rewrite.py`
- Modify: `apps/api/src/app/storage/minio_client.py`
- Modify: `apps/api/src/app/repositories/media_repository.py`
- Create: `apps/api/src/app/schemas/import_job.py`
- Create: `apps/api/src/app/api/v1/endpoints/import_jobs.py`
- Modify: `apps/api/src/app/api/v1/router.py`
- Create: `apps/api/tests/services/test_import_executor.py`
- Create: `apps/api/tests/services/test_import_media_ingest.py`
- Create: `apps/api/tests/api/test_import_jobs_api.py`

**Step 1: Write failing tests**

- Import runs only from snapshot artifact, never directly from Velog.
- `dry_run` writes no posts/media/mappings.
- `apply` internalizes media and rewrites markdown.
- Per-item failures do not abort whole job.

**Step 2: Verify red state**

Run:

```bash
cd apps/api
pytest tests/services/test_import_executor.py tests/services/test_import_media_ingest.py tests/api/test_import_jobs_api.py -q
```

Expected: FAIL because executor and import job endpoints are missing.

**Step 3: Minimal implementation**

- Load snapshot artifact by `snapshot_id`.
- Execute ordered import in `dry_run` or `apply`.
- Persist job and item results with counters and summaries.

**Step 4: Verify green state**

Run:

```bash
cd apps/api
pytest tests/services/test_import_executor.py tests/services/test_import_media_ingest.py tests/api/test_import_jobs_api.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/app/importing/import_executor.py apps/api/src/app/importing/media_ingest.py apps/api/src/app/importing/markdown_rewrite.py apps/api/src/app/storage/minio_client.py apps/api/src/app/repositories/media_repository.py apps/api/src/app/schemas/import_job.py apps/api/src/app/api/v1/endpoints/import_jobs.py apps/api/src/app/api/v1/router.py apps/api/tests/services/test_import_executor.py apps/api/tests/services/test_import_media_ingest.py apps/api/tests/api/test_import_jobs_api.py
git commit -m "feat(api): execute imports from reusable snapshots with dry-run and apply"
```

### Task 6: Add Frontend Proxies and Two-Step Admin UI

**Files:**
- Create: `apps/web/src/pages/internal-api/imports/snapshots/velog.ts`
- Create: `apps/web/src/pages/internal-api/imports/snapshots/zip.ts`
- Create: `apps/web/src/pages/internal-api/imports/snapshots/[snapshotId].ts`
- Create: `apps/web/src/pages/internal-api/imports/snapshots/[snapshotId]/items.ts`
- Create: `apps/web/src/pages/internal-api/imports/snapshots/[snapshotId]/download.ts`
- Create: `apps/web/src/pages/internal-api/imports/snapshots/[snapshotId]/jobs.ts`
- Create: `apps/web/src/pages/internal-api/imports/jobs/[jobId].ts`
- Create: `apps/web/src/pages/internal-api/imports/jobs/[jobId]/items.ts`
- Create: `apps/web/src/pages/admin/imports/velog.astro`
- Create: `apps/web/src/lib/admin/velog-import-page.ts`
- Modify: `apps/web/src/pages/admin/index.astro`
- Create: `apps/web/tests/internal-api-imports-route.test.mjs`
- Create: `apps/web/tests/admin-velog-import-page.test.mjs`

**Step 1: Write failing tests**

- Proxy route tests for new snapshot and job endpoints.
- Admin page tests for explicit Step 1 and Step 2 flow:
  - create/upload snapshot,
  - select snapshot,
  - run dry-run/apply job,
  - inspect failures.

**Step 2: Verify red state**

Run:

```bash
cd apps/web
node --test tests/internal-api-imports-route.test.mjs tests/admin-velog-import-page.test.mjs
```

Expected: FAIL because new routes and UI are missing.

**Step 3: Minimal implementation**

- Add internal API proxies for snapshot and import APIs.
- Implement two-step admin console flow and polling.
- Add dashboard link to migration console.

**Step 4: Verify green state**

Run:

```bash
cd apps/web
node --test tests/internal-api-imports-route.test.mjs tests/admin-velog-import-page.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/pages/internal-api/imports/snapshots/velog.ts apps/web/src/pages/internal-api/imports/snapshots/zip.ts apps/web/src/pages/internal-api/imports/snapshots/[snapshotId].ts apps/web/src/pages/internal-api/imports/snapshots/[snapshotId]/items.ts apps/web/src/pages/internal-api/imports/snapshots/[snapshotId]/download.ts apps/web/src/pages/internal-api/imports/snapshots/[snapshotId]/jobs.ts apps/web/src/pages/internal-api/imports/jobs/[jobId].ts apps/web/src/pages/internal-api/imports/jobs/[jobId]/items.ts apps/web/src/pages/admin/imports/velog.astro apps/web/src/lib/admin/velog-import-page.ts apps/web/src/pages/admin/index.astro apps/web/tests/internal-api-imports-route.test.mjs apps/web/tests/admin-velog-import-page.test.mjs
git commit -m "feat(web): add two-step snapshot and import admin console"
```

### Task 7: Integration Reconciliation and Final Verification

**Files:**
- Modify: `docs/api/import-contract-v1.md`
- Modify: `docs/architecture/admin-velog-one-time-migration.md`
- Modify: `apps/api/tests/api/test_import_snapshots_api.py`
- Modify: `apps/api/tests/api/test_import_jobs_api.py`
- Modify: `apps/web/tests/internal-api-imports-route.test.mjs`
- Modify: `apps/api/README.md`
- Modify: `apps/web/README.md`

**Step 1: Add contract mismatch checks**

- Ensure FE/BE alignment for:
  - snapshot statuses,
  - import statuses,
  - endpoint paths,
  - error payload shape handling.

**Step 2: Run target verification**

Run:

```bash
cd apps/api
pytest tests/api/test_import_snapshots_api.py tests/api/test_import_jobs_api.py tests/services/test_import_executor.py -q

cd ../../apps/web
node --test tests/internal-api-imports-route.test.mjs tests/admin-velog-import-page.test.mjs
```

Expected: PASS or identify contract drift.

**Step 3: Minimal cross-fixes**

- Fix only drift points and update docs once both stacks agree.

**Step 4: Run full smoke verification**

Run:

```bash
cd apps/api
pytest -q

cd ../../apps/web
npm run test:guards
npm run build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/api/import-contract-v1.md docs/architecture/admin-velog-one-time-migration.md apps/api/tests/api/test_import_snapshots_api.py apps/api/tests/api/test_import_jobs_api.py apps/web/tests/internal-api-imports-route.test.mjs apps/api/README.md apps/web/README.md
git commit -m "test: reconcile two-stage snapshot-first migration flow"
```

---

Execution order recommendation:

1. Complete Task 1 and Task 2 sequentially to freeze contract and persistence.
2. Run backend build tasks (Task 3 to Task 5) and frontend task (Task 6) in parallel after Task 1 freeze.
3. Run Task 7 as a single reconciliation session for FE/BE contract alignment.
4. Merge only when snapshot reuse and no-recrawl import behavior are verified.
