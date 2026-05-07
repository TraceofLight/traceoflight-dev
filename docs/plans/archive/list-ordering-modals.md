# List Ordering Modals Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `/admin/projects` with admin-only ordering modals on `/projects` and `/series`, backed by persisted project and series list order.

**Architecture:** Add explicit list order fields in the API, expose internal reorder endpoints, and render admin-only ordering modals directly on the public list pages. Remove detail-page ordering controls and the standalone admin projects page.

**Tech Stack:** Astro, React islands, FastAPI, SQLAlchemy, Alembic, node:test, Vitest

---

### Task 1: Add failing tests for order persistence and page wiring

**Files:**
- Modify: `apps/api/tests/api/test_projects_api.py`
- Modify: `apps/api/tests/api/test_series_api.py`
- Modify: `apps/web/tests/project-pages.test.mjs`
- Modify: `apps/web/tests/series-page.test.mjs`
- Modify: `apps/web/tests/series-detail-page.test.mjs`
- Delete: `apps/web/tests/admin-projects-page.test.mjs`

**Step 1: Write failing tests**

- Add API tests for `PUT /api/v1/projects/order`
- Add API tests for `PUT /api/v1/series/order`
- Update page tests to expect modal trigger wiring on `/projects` and `/series`
- Update project detail test to assert old inline panel is gone

**Step 2: Run tests to verify failure**

Run:

```bash
cd apps/api; .venv\Scripts\python -m pytest tests/api/test_projects_api.py tests/api/test_series_api.py -q
cd apps/web; node --test tests/project-pages.test.mjs tests/series-page.test.mjs tests/series-detail-page.test.mjs
```

Expected: failing tests for missing reorder endpoints and missing page wiring.

### Task 2: Implement backend ordering model and endpoints

**Files:**
- Modify: `apps/api/src/app/models/post.py`
- Modify: `apps/api/src/app/models/series.py`
- Modify: `apps/api/src/app/repositories/post_repository.py`
- Modify: `apps/api/src/app/repositories/series_repository.py`
- Modify: `apps/api/src/app/api/v1/endpoints/projects.py`
- Modify: `apps/api/src/app/api/v1/endpoints/series.py`
- Modify: `apps/api/src/app/schemas/project.py`
- Modify: `apps/api/src/app/schemas/series.py`
- Create: `apps/api/alembic/versions/20260312_0009_add_list_order_indexes.py`

**Step 1: Implement minimal model changes**

- Add `project_order_index` to `Post`
- Add `list_order_index` to `Series`
- Order list queries by explicit order first, legacy fallback second
- Add reorder repository methods and API endpoints

**Step 2: Run focused tests**

Run:

```bash
cd apps/api; .venv\Scripts\python -m pytest tests/api/test_projects_api.py tests/api/test_series_api.py -q
```

Expected: passing reorder API tests.

### Task 3: Implement web internal API routes and ordering modals

**Files:**
- Create: `apps/web/src/components/public/CollectionOrderModal.tsx`
- Create: `apps/web/src/components/public/ProjectOrderPanel.tsx`
- Create: `apps/web/src/components/public/SeriesOrderPanel.tsx`
- Create: `apps/web/src/pages/internal-api/projects/order.ts`
- Create: `apps/web/src/pages/internal-api/series/order.ts`
- Modify: `apps/web/src/pages/projects/index.astro`
- Modify: `apps/web/src/pages/series/index.astro`
- Modify: `apps/web/src/lib/projects.ts`
- Modify: `apps/web/src/lib/series-db.ts`
- Delete: `apps/web/src/pages/admin/projects.astro`

**Step 1: Write UI behavior**

- Add admin-only `순서 조정` button on `/series`
- Replace `/projects` admin manage link with modal trigger
- Render ordering modal with list reordering and save action
- Remove `/admin/projects` route

**Step 2: Run focused web tests**

Run:

```bash
cd apps/web; node --test tests/project-pages.test.mjs tests/series-page.test.mjs tests/series-detail-page.test.mjs
```

Expected: page tests pass with new modal wiring.

### Task 4: Remove inline detail ordering and add UI tests

**Files:**
- Modify: `apps/web/src/pages/projects/[slug].astro`
- Create: `apps/web/tests/ui/project-order-panel.test.tsx`
- Create: `apps/web/tests/ui/series-order-panel.test.tsx`

**Step 1: Remove old detail-page panel**

- Delete inline `SeriesAdminPanel` from project detail
- Keep related series list only

**Step 2: Add panel tests**

- Cover move up/down, save pending state, success/error feedback

**Step 3: Run UI tests**

Run:

```bash
cd apps/web; npm run test:ui -- project-order-panel series-order-panel
```

Expected: panel tests pass.

### Task 5: Verify full flow

**Files:**
- Verify only

**Step 1: Run API and web verification**

Run:

```bash
cd apps/api; .venv\Scripts\python -m pytest tests/api/test_projects_api.py tests/api/test_series_api.py -q
cd apps/web; node --test tests/project-pages.test.mjs tests/series-page.test.mjs tests/series-detail-page.test.mjs
cd apps/web; npm run test:ui -- project-order-panel series-order-panel
cd apps/web; npm run build
```

Expected: all pass.
