# Blog Tag Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement end-to-end blog post tag management across FastAPI backend and Astro frontend, while reusing existing `visibility` semantics and showing visibility together with tags in admin metadata UI.

**Architecture:** Freeze one FE/BE contract first, then add normalized `tags` + `post_tags` backend model and tagged post APIs. After contract freeze, backend and frontend implementation can run in parallel, followed by one in-flow integration checkpoint before final verification.

**Tech Stack:** FastAPI 0.115 + SQLAlchemy 2 + Alembic + Pydantic v2, Astro SSR + TypeScript, node test guards, pytest.

---

### Task 1: Freeze API Contract (Sequential Design Anchor)

**Files:**
- Create: `docs/api/tag-management-contract-v1.md`
- Modify: `docs/architecture/blog-tag-management.md`

**Step 1: Write failing contract checks (doc-driven)**

- Define canonical request/response examples for:
  - `POST /api/v1/posts` with `tags`
  - `PUT /api/v1/posts/{slug}` with `tags`
  - `GET /api/v1/posts?tag=...&tag_match=...`
  - `GET|POST|PATCH|DELETE /api/v1/tags`
- Mark FE/BE ownership per field and endpoint.

**Step 2: Verify mismatch is visible**

Run:

```bash
rg -n "tags|/api/v1/tags|tag_match" docs/api/tag-management-contract-v1.md docs/architecture/blog-tag-management.md
```

Expected: newly defined contract terms are present in both files.

**Step 3: Minimal implementation**

- Add strict encoding rules:
  - query tags use repeatable `tag` params (`?tag=fastapi&tag=astro`)
  - `tag_match` enum: `any | all`
- Add error payload examples for `401`, `404`, `409`.

**Step 4: Verify contract file is self-consistent**

Run:

```bash
rg -n "tag_match|x-internal-api-secret|409" docs/api/tag-management-contract-v1.md
```

Expected: all required contract constraints appear exactly once per endpoint section.

**Step 5: Commit**

```bash
git add docs/api/tag-management-contract-v1.md docs/architecture/blog-tag-management.md
git commit -m "docs: freeze v1 tag management api contract and ownership boundaries"
```

### Task 2: Add Backend Persistence Layer for Tags

**Files:**
- Create: `apps/api/src/app/models/tag.py`
- Modify: `apps/api/src/app/models/post.py`
- Create: `apps/api/alembic/versions/20260305_0003_add_tags_and_post_tags.py`
- Modify: `apps/api/tests/api/test_model_enum_mapping.py`

**Step 1: Write failing tests**

- Add DB/model tests asserting:
  - `tags.slug` is unique.
  - `post_tags` enforces unique `(post_id, tag_id)`.
  - post model exposes relationship collection for tags.

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api
pytest tests/api/test_model_enum_mapping.py -q
```

Expected: FAIL because tag tables/models are missing.

**Step 3: Write minimal implementation**

- Define `Tag` SQLAlchemy model.
- Define association table/model for post-tag links.
- Wire relationships from `Post` to `Tag`.
- Add Alembic migration for new tables/indexes/constraints.

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/api
pytest tests/api/test_model_enum_mapping.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/app/models/tag.py apps/api/src/app/models/post.py apps/api/alembic/versions/20260305_0003_add_tags_and_post_tags.py apps/api/tests/api/test_model_enum_mapping.py
git commit -m "feat(api): add tag and post_tag persistence model"
```

### Task 3: Extend Backend Schemas, Repository, and Service for Tagged Posts

**Files:**
- Create: `apps/api/src/app/schemas/tag.py`
- Modify: `apps/api/src/app/schemas/post.py`
- Modify: `apps/api/src/app/repositories/post_repository.py`
- Create: `apps/api/src/app/repositories/tag_repository.py`
- Modify: `apps/api/src/app/services/post_service.py`
- Create: `apps/api/src/app/services/tag_service.py`
- Modify: `apps/api/src/app/api/deps.py`
- Create: `apps/api/tests/api/test_post_tags_repository.py`

**Step 1: Write failing tests**

- Add tests for:
  - create/update post with tags.
  - slug normalization and duplicate elimination.
  - `tag_match=all` filtering semantics.

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api
pytest tests/api/test_post_tags_repository.py -q
```

Expected: FAIL because repositories/services do not handle tags yet.

**Step 3: Write minimal implementation**

- Add `TagRead`, `TagCreate`, `TagUpdate` schemas.
- Extend `PostCreate` and `PostRead` with `tags`.
- Implement tag upsert and post-tag synchronization in repository/service.
- Keep existing visibility/status behavior unchanged.

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/api
pytest tests/api/test_post_tags_repository.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/app/schemas/tag.py apps/api/src/app/schemas/post.py apps/api/src/app/repositories/post_repository.py apps/api/src/app/repositories/tag_repository.py apps/api/src/app/services/post_service.py apps/api/src/app/services/tag_service.py apps/api/src/app/api/deps.py apps/api/tests/api/test_post_tags_repository.py
git commit -m "feat(api): support post tag assignment and tag-aware filtering"
```

### Task 4: Add Backend Tag Endpoints and OpenAPI Contract Tests

**Files:**
- Create: `apps/api/src/app/api/v1/endpoints/tags.py`
- Modify: `apps/api/src/app/api/v1/router.py`
- Modify: `apps/api/tests/api/test_openapi_docs.py`
- Create: `apps/api/tests/api/test_tags_api.py`

**Step 1: Write failing tests**

- `test_tags_api.py`:
  - create/list/update/delete tag scenarios.
  - conflict and unauthorized checks.
- Extend `test_openapi_docs.py`:
  - tags endpoint summaries/responses.
  - posts schema includes `tags` property.

**Step 2: Run tests to verify failures**

Run:

```bash
cd apps/api
pytest tests/api/test_tags_api.py tests/api/test_openapi_docs.py -q
```

Expected: FAIL because tags router and schema docs are not exposed yet.

**Step 3: Write minimal implementation**

- Implement `/api/v1/tags` routes.
- Register router with `tags=['tags']`.
- Apply internal-secret guard to mutating operations.
- Add OpenAPI metadata (`summary`, `description`, `responses`).

**Step 4: Run tests to verify passes**

Run:

```bash
cd apps/api
pytest tests/api/test_tags_api.py tests/api/test_openapi_docs.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/app/api/v1/endpoints/tags.py apps/api/src/app/api/v1/router.py apps/api/tests/api/test_tags_api.py apps/api/tests/api/test_openapi_docs.py
git commit -m "feat(api): expose tag management endpoints with openapi contracts"
```

### Task 5: Build Frontend Internal API Proxies and Shared Types

**Files:**
- Create: `apps/web/src/pages/internal-api/tags.ts`
- Create: `apps/web/src/pages/internal-api/tags/[slug].ts`
- Modify: `apps/web/src/pages/internal-api/posts.ts`
- Modify: `apps/web/src/pages/internal-api/posts/[slug].ts`
- Modify: `apps/web/src/lib/admin/new-post-page/types.ts`
- Modify: `apps/web/src/lib/blog-db.ts`
- Create: `apps/web/tests/internal-api-tags-route.test.mjs`
- Modify: `apps/web/tests/internal-api-posts-route.test.mjs`

**Step 1: Write failing tests**

- Add route tests asserting:
  - tags proxy exposes GET/POST/PATCH/DELETE.
  - posts proxies preserve repeated `tag` query params.
- Add type-level guard checks for new `tags` fields.

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web
node --test tests/internal-api-posts-route.test.mjs tests/internal-api-tags-route.test.mjs
```

Expected: FAIL because tag proxies and tag query forwarding are missing.

**Step 3: Write minimal implementation**

- Implement tag proxy routes using `requestBackend`.
- Keep backend-unavailable behavior consistent with existing proxies.
- Extend TS interfaces (`AdminPostPayload`, `DbPost`, `DbBlogPost`) with tags.

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/web
node --test tests/internal-api-posts-route.test.mjs tests/internal-api-tags-route.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/pages/internal-api/tags.ts apps/web/src/pages/internal-api/tags/[slug].ts apps/web/src/pages/internal-api/posts.ts apps/web/src/pages/internal-api/posts/[slug].ts apps/web/src/lib/admin/new-post-page/types.ts apps/web/src/lib/blog-db.ts apps/web/tests/internal-api-tags-route.test.mjs apps/web/tests/internal-api-posts-route.test.mjs
git commit -m "feat(web): add internal api tag proxies and tag-aware post types"
```

### Task 6: Implement Admin Writer Tag UX and Payload Wiring

**Files:**
- Modify: `apps/web/src/pages/admin/posts/new.astro`
- Modify: `apps/web/src/lib/admin/new-post-page/dom.ts`
- Modify: `apps/web/src/lib/admin/new-post-page/submit.ts`
- Modify: `apps/web/src/lib/admin/new-post-page/submit-events.ts`
- Modify: `apps/web/src/lib/admin/new-post-page.ts`
- Create: `apps/web/src/lib/admin/new-post-page/tags.ts`
- Modify: `apps/web/tests/admin-writer-page.test.mjs`
- Modify: `apps/web/tests/admin-writer-script.test.mjs`
- Create: `apps/web/tests/admin-writer-tags.test.mjs`

**Step 1: Write failing tests**

- Verify writer has:
  - tag input + chip list + remove actions,
  - visibility system chip rendered in same metadata rail,
  - submit payload includes `tags`.

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web
node --test tests/admin-writer-page.test.mjs tests/admin-writer-script.test.mjs tests/admin-writer-tags.test.mjs
```

Expected: FAIL because writer currently has no tag controls.

**Step 3: Write minimal implementation**

- Add writer tag UI controls.
- Parse/normalize tag chips.
- Fetch tag suggestions from `/internal-api/tags`.
- Include `tags` in submit payload for draft/publish/update.
- Render visibility chip in same metadata rail as requested.

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/web
node --test tests/admin-writer-page.test.mjs tests/admin-writer-script.test.mjs tests/admin-writer-tags.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/pages/admin/posts/new.astro apps/web/src/lib/admin/new-post-page/dom.ts apps/web/src/lib/admin/new-post-page/submit.ts apps/web/src/lib/admin/new-post-page/submit-events.ts apps/web/src/lib/admin/new-post-page.ts apps/web/src/lib/admin/new-post-page/tags.ts apps/web/tests/admin-writer-page.test.mjs apps/web/tests/admin-writer-script.test.mjs apps/web/tests/admin-writer-tags.test.mjs
git commit -m "feat(web): add writer tag chips and visibility metadata rail"
```

### Task 7: Add Blog Tag Display and Filtering UX

**Files:**
- Modify: `apps/web/src/components/PostCard.astro`
- Modify: `apps/web/src/pages/blog/index.astro`
- Modify: `apps/web/src/styles/components/blog.css`
- Modify: `apps/web/tests/blog-archive-ui.test.mjs`
- Create: `apps/web/tests/blog-tag-filter.test.mjs`

**Step 1: Write failing tests**

- Verify archive page:
  - renders tag filter controls,
  - combines visibility and tag filters correctly,
  - keeps URL query in sync (`?tag=...`).
- Verify post card renders tag chips.

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web
node --test tests/blog-archive-ui.test.mjs tests/blog-tag-filter.test.mjs
```

Expected: FAIL because blog UI currently lacks tag filtering/display.

**Step 3: Write minimal implementation**

- Surface tags from `DbBlogPost` to card rendering.
- Add tag chips in archive filter panel.
- Update filter script to compose:
  - search
  - sort
  - visibility
  - tag
- Keep admin/private behavior intact.

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/web
node --test tests/blog-archive-ui.test.mjs tests/blog-tag-filter.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/PostCard.astro apps/web/src/pages/blog/index.astro apps/web/src/styles/components/blog.css apps/web/tests/blog-archive-ui.test.mjs apps/web/tests/blog-tag-filter.test.mjs
git commit -m "feat(web): add blog tag chips and archive tag filtering"
```

### Task 8: Integration Checkpoint for FE-BE Contract Mismatches

**Files:**
- Modify: `docs/api/tag-management-contract-v1.md`
- Modify: `apps/api/tests/api/test_tags_api.py`
- Modify: `apps/web/tests/internal-api-tags-route.test.mjs`
- Modify: `apps/web/tests/admin-writer-tags.test.mjs`

**Step 1: Write mismatch regression tests first**

- Add test cases for:
  - repeated query params (`tag=a&tag=b`) exact forwarding.
  - error payload shape compatibility (`detail` vs `message`).
  - optional fields normalization (`tags: []` not `null`).

**Step 2: Run both stacks tests to confirm mismatch**

Run:

```bash
cd apps/api
pytest tests/api/test_tags_api.py -q

cd ../../apps/web
node --test tests/internal-api-tags-route.test.mjs tests/admin-writer-tags.test.mjs
```

Expected: at least one FAIL when contract is out of sync.

**Step 3: Apply minimal cross-fixes**

- Adjust FE serializer/parser and BE request parsing to exact contract.
- Update contract doc examples only when both implementations agree.

**Step 4: Re-run both stacks**

Run:

```bash
cd apps/api
pytest tests/api/test_tags_api.py tests/api/test_openapi_docs.py -q

cd ../../apps/web
npm run test:guards
```

Expected: PASS on both.

**Step 5: Commit**

```bash
git add docs/api/tag-management-contract-v1.md apps/api/tests/api/test_tags_api.py apps/web/tests/internal-api-tags-route.test.mjs apps/web/tests/admin-writer-tags.test.mjs
git commit -m "test: reconcile frontend-backend tag api contract mismatches"
```

### Task 9: Final Verification and Documentation Sync

**Files:**
- Modify: `apps/api/README.md`
- Modify: `apps/web/README.md`
- Modify: `docs/architecture/blog-tag-management.md`

**Step 1: Add failing verification checklist**

- Document exact verify commands and expected pass criteria for both apps.

**Step 2: Run full verification**

Run:

```bash
cd apps/api
pytest -q

cd ../../apps/web
npm test
npm run build
```

Expected: all PASS.

**Step 3: Minimal docs implementation**

- Add runbook section:
  - how to create tags
  - how visibility chip and tags coexist in admin UI
  - how to troubleshoot contract mismatch.

**Step 4: Re-run smoke checks**

Run:

```bash
cd apps/api
python -c "from app.main import app; print(bool(app.openapi()))"
```

Expected: `True`.

**Step 5: Commit**

```bash
git add apps/api/README.md apps/web/README.md docs/architecture/blog-tag-management.md
git commit -m "docs: finalize tag management verification and runbook"
```

---

Execution order recommendation:

1. Complete Task 1 first (sequential design freeze).
2. Run backend implementation (Tasks 2-4) and frontend implementation (Tasks 5-7) in parallel.
3. Run Task 8 as one in-flow integration checkpoint (not separate planning session).
4. Close with Task 9 global verification.

Use `@superpowers/test-driven-development` for each task and `@superpowers/verification-before-completion` before any completion claim.
