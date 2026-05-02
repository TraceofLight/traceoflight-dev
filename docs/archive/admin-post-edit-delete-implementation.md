# Admin Post Edit/Delete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let admin users edit or delete a post directly from post detail page, using existing backend `PUT/DELETE` contracts and current internal API proxy.

**Architecture:** Keep backend API shape unchanged, add admin controls to `/blog/{slug}` only for authenticated admin viewers, add writer edit route `/admin/posts/{slug}/edit`, and confirm delete via modal before destructive action.

**Tech Stack:** Astro SSR + TypeScript + node guard tests, FastAPI + pytest regression, internal proxy routes (`/internal-api/posts*`).

---

### Task 1: Update Contract Docs for Detail-Page Admin Actions

**Files:**
- Modify: `docs/architecture/admin-post-edit-delete.md`
- Modify: `docs/plans/admin-post-edit-delete-implementation.md`

**Step 1: Write failing checklist**

- Ensure docs no longer reference dedicated admin post list page.
- Ensure docs specify detail-page action buttons + confirmation modal.

**Step 2: Verify red state**

Run:

```bash
rg -n "admin posts management|/admin/posts$|관리 페이지" docs/architecture/admin-post-edit-delete.md docs/plans/admin-post-edit-delete-implementation.md
```

Expected: legacy references exist before rewrite.

**Step 3: Minimal implementation**

- Rewrite docs with:
  - `/blog/{slug}` admin actions.
  - edit route `/admin/posts/{slug}/edit`.
  - delete modal and status handling (`204/404/401/503`).

**Step 4: Verify green**

Run:

```bash
rg -n "post detail|/admin/posts/\\{slug\\}/edit|confirmation modal|DELETE /internal-api/posts/\\{slug\\}" docs/architecture/admin-post-edit-delete.md
```

Expected: required anchors found.

**Step 5: Commit**

```bash
git add docs/architecture/admin-post-edit-delete.md docs/plans/admin-post-edit-delete-implementation.md
git commit -m "docs: switch admin post edit delete architecture to detail-page controls"
```

### Task 2: Add Backend Regression Tests for Edit/Delete Semantics

**Files:**
- Create: `apps/api/tests/api/test_posts_admin_edit_delete.py`

**Step 1: Write failing tests**

- Cases:
  - update/delete unauthorized without internal header -> `401`.
  - update with valid header -> `200`.
  - update slug conflict -> `409`.
  - delete missing slug -> `404`.

**Step 2: Verify red state**

Run:

```bash
cd apps/api
pytest tests/api/test_posts_admin_edit_delete.py -q
```

Expected: fail first (test introduced before implementation hardening).

**Step 3: Minimal implementation**

- Patch endpoint/service only if tests expose mismatch.

**Step 4: Verify green**

Run:

```bash
cd apps/api
pytest tests/api/test_posts_admin_edit_delete.py tests/api/test_posts_access_guard.py -q
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/api/tests/api/test_posts_admin_edit_delete.py apps/api/src/app/api/v1/endpoints/posts.py apps/api/src/app/services/post_service.py apps/api/src/app/repositories/post_repository.py
git commit -m "test(api): cover admin post update delete contract"
```

### Task 3: Add Edit Route (`/admin/posts/{slug}/edit`) Using Writer Edit Mode

**Files:**
- Create: `apps/web/src/pages/admin/posts/[slug]/edit.astro`
- Modify: `apps/web/src/pages/admin/posts/new.astro`
- Modify: `apps/web/src/lib/admin/new-post-page.ts`
- Modify: `apps/web/src/lib/admin/new-post-page/posts-api.ts`
- Modify: `apps/web/src/lib/admin/new-post-page/submit.ts`
- Create: `apps/web/tests/admin-post-edit-page.test.mjs`
- Modify: `apps/web/tests/admin-writer-script.test.mjs`

**Step 1: Write failing tests**

- Edit page exists with slug bootstrap.
- Writer edit mode preloads post by slug.
- Edit submit uses `PUT /internal-api/posts/{originalSlug}`.

**Step 2: Verify red state**

Run:

```bash
cd apps/web
node --test tests/admin-post-edit-page.test.mjs tests/admin-writer-script.test.mjs
```

Expected: fail before implementation.

**Step 3: Minimal implementation**

- Add edit route page and initialize writer in edit mode.
- Prefill from `GET /internal-api/posts/{slug}`.
- Keep create flow unchanged.

**Step 4: Verify green**

Run:

```bash
cd apps/web
node --test tests/admin-post-edit-page.test.mjs tests/admin-writer-script.test.mjs
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/web/src/pages/admin/posts/[slug]/edit.astro apps/web/src/pages/admin/posts/new.astro apps/web/src/lib/admin/new-post-page.ts apps/web/src/lib/admin/new-post-page/posts-api.ts apps/web/src/lib/admin/new-post-page/submit.ts apps/web/tests/admin-post-edit-page.test.mjs apps/web/tests/admin-writer-script.test.mjs
git commit -m "feat(web): add writer edit mode route for existing posts"
```

### Task 4: Add Admin Edit/Delete Controls to Blog Detail Page

**Files:**
- Modify: `apps/web/src/pages/blog/[...slug].astro`
- Modify: `apps/web/src/layouts/BlogPost.astro`
- Modify: `apps/web/src/styles/components/blog.css`
- Create: `apps/web/tests/blog-post-admin-actions.test.mjs`

**Step 1: Write failing tests**

- Admin viewer path renders edit/delete controls.
- Non-admin path hides controls.
- Delete confirmation modal markup exists.

**Step 2: Verify red state**

Run:

```bash
cd apps/web
node --test tests/blog-post-admin-actions.test.mjs
```

Expected: fail before controls are added.

**Step 3: Minimal implementation**

- Pass admin-view flags + slug to `BlogPost` layout.
- Render:
  - Edit link -> `/admin/posts/{slug}/edit`
  - Delete button -> modal confirm.
- Delete API call:
  - `DELETE /internal-api/posts/{slug}`
  - `204` or `404` => redirect `/blog`.
  - other errors => inline feedback.

**Step 4: Verify green**

Run:

```bash
cd apps/web
node --test tests/blog-post-admin-actions.test.mjs
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/web/src/pages/blog/[...slug].astro apps/web/src/layouts/BlogPost.astro apps/web/src/styles/components/blog.css apps/web/tests/blog-post-admin-actions.test.mjs
git commit -m "feat(web): add admin edit delete controls on blog post detail"
```

### Task 5: Final FE/BE Alignment and Guard Verification

**Files:**
- Modify (if needed): `apps/web/src/pages/internal-api/posts/[slug].ts`
- Modify (if needed): `apps/web/tests/internal-api-posts-route.test.mjs`
- Modify (if needed): `apps/web/tests/blog-post-admin-actions.test.mjs`
- Modify (if needed): `apps/api/tests/api/test_posts_admin_edit_delete.py`

**Step 1: Add mismatch checks**

- `DELETE` no-body response handling.
- `404` delete treated as success redirect in UI.
- edit mode path slug vs payload slug behavior.

**Step 2: Run verification**

Run:

```bash
cd apps/web
npm run test:guards

cd ../../apps/api
pytest tests/api/test_posts_admin_edit_delete.py tests/api/test_posts_access_guard.py -q
```

Expected: pass or reveal mismatch.

**Step 3: Minimal cross-fixes**

- Patch only mismatched assumptions between FE and BE.

**Step 4: Re-run full target verification**

Run:

```bash
cd apps/web
npm run test:guards
npm run build
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/web/src/pages/internal-api/posts/[slug].ts apps/web/tests/internal-api-posts-route.test.mjs apps/web/tests/blog-post-admin-actions.test.mjs apps/api/tests/api/test_posts_admin_edit_delete.py
git commit -m "test: align detail-page admin edit delete flow across frontend backend"
```
