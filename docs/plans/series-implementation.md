# Series Feature Unified Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver FE/BE series functionality end-to-end, with FE and BE implementation running in parallel and one final integration session to resolve API awkwardness/mismatch before completion.

**Architecture:** Use unified architecture doc (`docs/architecture/series.md`) as the source of truth, execute FE/BE tracks in parallel after contract freeze, then run one unified reconciliation checkpoint against a shared API contract fixture. Final acceptance requires both stacks green together.

**Tech Stack:** Astro + internal proxy routes + node tests, FastAPI + SQLAlchemy + Alembic + pytest.

---

### Task 1: Freeze Shared Contract for Parallel Work

**Files:**
- Create: `docs/api/series-contract-v1.md`
- Modify: `docs/architecture/series.md`

**Step 1: Write failing contract checks**

- Define canonical payloads for:
  - list/detail series read,
  - admin series CRUD,
  - bulk reorder assignment,
  - post `series_context` shape.

**Step 2: Run check to verify it fails before file exists**

Run:

```bash
rg -n "series_context|order_index|/api/v1/series|/internal-api/series" docs/api/series-contract-v1.md
```

Expected: FAIL before contract file creation.

**Step 3: Write minimal implementation**

- Add request/response examples and error semantics (`400/401/404/409/503`).

**Step 4: Run check to verify it passes**

Run:

```bash
rg -n "series_context|order_index|409|503" docs/api/series-contract-v1.md
```

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/api/series-contract-v1.md docs/architecture/series.md
git commit -m "docs: freeze shared series api contract for parallel implementation"
```

### Task 2: Execute Backend Track

**Files:**
- Backend series domain files under `apps/api`:
  - models/migration
  - schemas/repositories/services
  - `/api/v1/series` endpoints
  - post `series_context` extension

**Step 1: Run backend task batch (TDD)**

- Implement backend baseline in order:
  - persistence model + migration,
  - schema/repository/service,
  - series endpoints and auth guards.

**Step 2: Run verification**

Run:

```bash
cd apps/api
pytest tests/api/test_series_model_mapping.py tests/api/test_series_repository.py tests/api/test_series_service.py tests/api/test_series_api.py -q
```

Expected: PASS.

**Step 3: Continue backend extensions**

- Implement backend extensions:
  - post `series_context`,
  - OpenAPI contract tests,
  - backend docs sync.

**Step 4: Re-run backend verification**

Run:

```bash
cd apps/api
pytest -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): complete series backend track"
```

### Task 3: Execute Frontend Track

**Files:**
- Frontend series files under `apps/web`:
  - internal proxy routes (`/internal-api/series*`)
  - public pages (`/series`, `/series/[slug]`)
  - admin pages (`/admin/series*`)
  - blog detail series navigation UI

**Step 1: Run frontend task batch (TDD)**

- Implement frontend baseline in order:
  - contract fixture + proxy routes,
  - public series pages.

**Step 2: Run verification**

Run:

```bash
cd apps/web
node --test tests/series-contract-shape.test.mjs tests/internal-api-series-route.test.mjs tests/series-page.test.mjs tests/series-detail-page.test.mjs
```

Expected: PASS.

**Step 3: Continue frontend extensions**

- Implement frontend extensions:
  - blog detail series navigation,
  - admin series management pages,
  - frontend docs sync.

**Step 4: Re-run frontend verification**

Run:

```bash
cd apps/web
npm run test:guards
npm run build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): complete series frontend track"
```

### Task 4: One-Session API Reconciliation (Required)

**Files:**
- Modify: `docs/api/series-contract-v1.md`
- Modify: `apps/web/tests/internal-api-series-route.test.mjs`
- Modify: `apps/api/tests/api/test_series_api.py`
- Modify: `apps/api/tests/api/test_post_series_context_api.py`
- Modify: `apps/web/tests/blog-series-navigation.test.mjs`

**Step 1: Write mismatch regression tests first**

- Add tests that catch:
  - query parameter mismatch,
  - nullability mismatch,
  - response key mismatch (`snake_case` vs expected),
  - no-body response proxy edge cases.

**Step 2: Run both stacks to surface mismatch**

Run:

```bash
cd apps/api
pytest tests/api/test_series_api.py tests/api/test_post_series_context_api.py -q

cd ../../apps/web
node --test tests/internal-api-series-route.test.mjs tests/blog-series-navigation.test.mjs
```

Expected: at least one FAIL if contract drift exists.

**Step 3: Apply minimal cross-fixes in one session**

- Fix FE serializer/parser and BE response/query handling to match contract.
- Update contract doc only after both sides agree.

**Step 4: Re-run both stack checks**

Run:

```bash
cd apps/api
pytest tests/api/test_series_api.py tests/api/test_post_series_context_api.py tests/api/test_openapi_series_docs.py -q

cd ../../apps/web
npm run test:guards
```

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/api/series-contract-v1.md apps/api/tests/api/test_series_api.py apps/api/tests/api/test_post_series_context_api.py apps/web/tests/internal-api-series-route.test.mjs apps/web/tests/blog-series-navigation.test.mjs apps/api/src/app apps/web/src
git commit -m "test: reconcile series api contract between frontend and backend"
```

### Task 5: Final Unified Verification and Documentation Sync

**Files:**
- Modify: `docs/architecture/series.md`
- Modify: `apps/api/README.md`
- Modify: `apps/web/README.md`

**Step 1: Write final verification checklist**

- Add exact end-to-end checks for:
  - `/series` render,
  - `/series/{slug}` render,
  - blog post series navigation,
  - admin series CRUD + reorder.

**Step 2: Run full verification**

Run:

```bash
cd apps/api
pytest -q

cd ../../apps/web
npm test
npm run build
```

Expected: PASS.

**Step 3: Update docs with final routes/contracts**

- Confirm docs reflect reconciled API shape only.

**Step 4: Run smoke checks**

Run:

```bash
cd apps/web
node --test tests/series-page.test.mjs tests/series-detail-page.test.mjs tests/admin-series-page.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/architecture/series.md apps/api/README.md apps/web/README.md
git commit -m "docs: finalize unified series architecture and verification"
```

---

Execution order:

1. Task 1 (contract freeze) first.
2. Tasks 2 and 3 in parallel.
3. Task 4 one-session reconciliation.
4. Task 5 final verification and docs sync.

Use `@superpowers/test-driven-development` and `@superpowers/verification-before-completion` before completion claims.
