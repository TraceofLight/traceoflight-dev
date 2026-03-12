# Post Comments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement post-scoped guest/admin comments with flat replies, private/deleted masking, and a scrollable admin review panel inside the existing admin imports console.

**Architecture:** Add a dedicated `post_comments` backend domain in FastAPI, expose post-scoped comment and admin review APIs, then wire Astro public routes and the admin imports panel through internal API proxies and React islands. Keep public rendering server-safe by masking private/deleted bodies in backend response serializers instead of relying on frontend conditionals alone.

**Tech Stack:** FastAPI 0.115 + SQLAlchemy 2 + Alembic + Pydantic v2, Astro SSR + TypeScript, React islands, node test + Vitest, existing admin auth and internal API proxy pattern.

---

### Task 1: Freeze Comment Contract and Architecture Notes

**Files:**
- Create: `docs/api/post-comments-contract-v1.md`
- Modify: `docs/architecture/backend-fastapi.md`
- Modify: `docs/architecture/frontend-astro.md`

**Step 1: Write the failing contract checks**

- Define canonical request/response examples for:
  - `GET /api/v1/posts/{slug}/comments`
  - `POST /api/v1/posts/{slug}/comments`
  - `PATCH /api/v1/comments/{id}`
  - `DELETE /api/v1/comments/{id}`
  - `GET /api/v1/admin/comments`
- Document viewer differences:
  - public viewer
  - admin viewer
  - guest writer edit/delete

**Step 2: Run verification to confirm the contract file exists**

Run:

```bash
rg -n "posts/.*/comments|admin/comments|비공개된 댓글입니다|삭제된 댓글입니다" docs/api/post-comments-contract-v1.md docs/architecture/backend-fastapi.md docs/architecture/frontend-astro.md
```

Expected: all contract terms appear in the new contract file and both architecture docs.

**Step 3: Write the minimal implementation**

- Add the contract file.
- Record that visitor counters are deferred.
- Record that deleted comments cannot receive new replies.

**Step 4: Re-run verification**

Run:

```bash
rg -n "deleted comments cannot receive new replies|@TraceofLight|root_comment_id|reply_to_comment_id" docs/api/post-comments-contract-v1.md
```

Expected: all core comment structure rules are present.

**Step 5: Commit**

```bash
git add docs/api/post-comments-contract-v1.md docs/architecture/backend-fastapi.md docs/architecture/frontend-astro.md
git commit -m "docs: freeze post comments contract and architecture notes"
```

### Task 2: Add Backend Comment Persistence and Migration

**Files:**
- Create: `apps/api/src/app/models/post_comment.py`
- Modify: `apps/api/src/app/models/__init__.py`
- Modify: `apps/api/src/app/models/post.py`
- Create: `apps/api/alembic/versions/20260313_0010_add_post_comments.py`
- Modify: `apps/api/tests/api/test_model_enum_mapping.py`

**Step 1: Write the failing tests**

- Add tests asserting:
  - comment visibility/status enums map correctly
  - root comments allow `root_comment_id = null`
  - replies require `root_comment_id`
  - post-to-comments relationship is exposed

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api
pytest tests/api/test_model_enum_mapping.py -q
```

Expected: FAIL because the comment model and migration are missing.

**Step 3: Write minimal implementation**

- Define `PostCommentAuthorType`, `PostCommentVisibility`, `PostCommentStatus`.
- Add `PostComment` model with:
  - `post_id`
  - `root_comment_id`
  - `reply_to_comment_id`
  - `author_name`
  - `author_type`
  - `password_hash`
  - `body`
  - `visibility`
  - `status`
  - `deleted_at`
  - `last_edited_at`
- Add `Post.comments` relationship.
- Add migration indexes for post, root, reply, status, visibility, created time.

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/api
pytest tests/api/test_model_enum_mapping.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/app/models/post_comment.py apps/api/src/app/models/__init__.py apps/api/src/app/models/post.py apps/api/alembic/versions/20260313_0010_add_post_comments.py apps/api/tests/api/test_model_enum_mapping.py
git commit -m "feat(api): add post comment persistence model"
```

### Task 3: Build Backend Comment Schemas, Repository, Service, and Password Flow

**Files:**
- Create: `apps/api/src/app/schemas/post_comment.py`
- Create: `apps/api/src/app/repositories/post_comment_repository.py`
- Create: `apps/api/src/app/services/post_comment_service.py`
- Modify: `apps/api/src/app/api/deps.py`
- Create: `apps/api/tests/services/test_post_comment_service.py`

**Step 1: Write the failing tests**

- Add tests for:
  - create root comment
  - create reply under root
  - reply-to-reply resolves to the same root thread
  - deleted target rejects new replies
  - guest password hash is stored, raw password is not
  - guest edit/delete succeeds only with correct password
  - admin-authored comment is saved as `@TraceofLight`
  - private body is masked for public viewers and visible for admin viewers

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api
pytest tests/services/test_post_comment_service.py -q
```

Expected: FAIL because schemas, repository, service, and password handling do not exist.

**Step 3: Write minimal implementation**

- Add create/update/delete/read schemas.
- Add serializer schema for:
  - root comments
  - flat replies
  - admin review rows
- Add password helper using Argon2id or bcrypt.
- Add service rules:
  - guest create requires name/password
  - admin create uses `@TraceofLight`
  - deleted/private placeholders applied at response mapping time
  - deleted comments cannot receive new replies

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/api
pytest tests/services/test_post_comment_service.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/app/schemas/post_comment.py apps/api/src/app/repositories/post_comment_repository.py apps/api/src/app/services/post_comment_service.py apps/api/src/app/api/deps.py apps/api/tests/services/test_post_comment_service.py
git commit -m "feat(api): add post comment service and password verification flow"
```

### Task 4: Expose Backend Comment APIs and Admin Review Endpoint

**Files:**
- Create: `apps/api/src/app/api/v1/endpoints/comments.py`
- Modify: `apps/api/src/app/api/v1/endpoints/posts.py`
- Modify: `apps/api/src/app/api/v1/router.py`
- Create: `apps/api/tests/api/test_post_comments_api.py`
- Modify: `apps/api/tests/api/test_openapi_docs.py`

**Step 1: Write the failing tests**

- Add API tests covering:
  - list comments for a post as public viewer
  - list comments for a post as admin viewer
  - create guest comment
  - create admin comment with admin auth
  - patch comment with password
  - delete comment as soft delete
  - list admin comments newest first
  - rate-limited write attempt

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/api
pytest tests/api/test_post_comments_api.py tests/api/test_openapi_docs.py -q
```

Expected: FAIL because the routes are not registered yet.

**Step 3: Write minimal implementation**

- Add nested post route for comment list/create.
- Add top-level comment route for patch/delete.
- Add admin review route.
- Reuse existing internal admin request/auth conventions.
- Return public-safe masking for non-admin calls.

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/api
pytest tests/api/test_post_comments_api.py tests/api/test_openapi_docs.py -q
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/app/api/v1/endpoints/comments.py apps/api/src/app/api/v1/endpoints/posts.py apps/api/src/app/api/v1/router.py apps/api/tests/api/test_post_comments_api.py apps/api/tests/api/test_openapi_docs.py
git commit -m "feat(api): expose post comment and admin review endpoints"
```

### Task 5: Add Web Internal API Proxies and Shared Comment Types

**Files:**
- Create: `apps/web/src/pages/internal-api/posts/[slug]/comments.ts`
- Create: `apps/web/src/pages/internal-api/comments/[id].ts`
- Create: `apps/web/src/pages/internal-api/admin/comments.ts`
- Create: `apps/web/src/lib/post-comments.ts`
- Create: `apps/web/tests/internal-api-post-comments-route.test.mjs`

**Step 1: Write the failing tests**

- Add route tests asserting:
  - post comments proxy forwards GET/POST
  - comment proxy forwards PATCH/DELETE
  - admin comments proxy rejects non-admin requests
  - proxy preserves error payloads from backend

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web
node --test tests/internal-api-post-comments-route.test.mjs
```

Expected: FAIL because the internal API proxies and shared types are missing.

**Step 3: Write minimal implementation**

- Add internal API routes using `requestBackend`.
- Add shared TS types for:
  - public comment thread
  - reply row
  - admin review row
  - create/update payloads

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/web
node --test tests/internal-api-post-comments-route.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/pages/internal-api/posts/[slug]/comments.ts apps/web/src/pages/internal-api/comments/[id].ts apps/web/src/pages/internal-api/admin/comments.ts apps/web/src/lib/post-comments.ts apps/web/tests/internal-api-post-comments-route.test.mjs
git commit -m "feat(web): add post comments internal api proxies"
```

### Task 6: Build Public Blog Comment UI

**Files:**
- Create: `apps/web/src/components/public/PostComments.tsx`
- Create: `apps/web/src/components/public/PostCommentComposer.tsx`
- Create: `apps/web/src/components/public/PostCommentThread.tsx`
- Create: `apps/web/src/components/public/PostCommentPasswordDialog.tsx`
- Modify: `apps/web/src/layouts/BlogPost.astro`
- Modify: `apps/web/src/pages/blog/[...slug].astro`
- Create: `apps/web/tests/ui/post-comments.test.tsx`
- Modify: `apps/web/tests/blog-post-navigation.test.mjs`

**Step 1: Write the failing tests**

- Add tests for:
  - comments section renders below `모든 글 보기`
  - guest form shows name/password/visibility/body
  - admin form shows only body plus admin identity label
  - replies render flat under root comments
  - deleted comment shows placeholder
  - private comment shows placeholder for non-admin
  - reply action to deleted comment is disabled

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web
vitest run tests/ui/post-comments.test.tsx
node --test tests/blog-post-navigation.test.mjs
```

Expected: FAIL because the public comment UI does not exist yet.

**Step 3: Write minimal implementation**

- Pass initial comment payload from `blog/[...slug].astro` into a hydrated React island.
- Render comment composer and thread list.
- Reuse existing public UI surface classes.
- Keep reply rendering flat with reply target metadata.
- Use password dialog for guest edit/delete.

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/web
vitest run tests/ui/post-comments.test.tsx
node --test tests/blog-post-navigation.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/public/PostComments.tsx apps/web/src/components/public/PostCommentComposer.tsx apps/web/src/components/public/PostCommentThread.tsx apps/web/src/components/public/PostCommentPasswordDialog.tsx apps/web/src/layouts/BlogPost.astro apps/web/src/pages/blog/[...slug].astro apps/web/tests/ui/post-comments.test.tsx apps/web/tests/blog-post-navigation.test.mjs
git commit -m "feat(web): add public post comments and flat replies"
```

### Task 7: Add Admin Comment Review Panel to Admin Imports Console

**Files:**
- Modify: `apps/web/src/components/public/AdminImportsPanel.tsx`
- Create: `apps/web/src/components/public/AdminCommentsPanel.tsx`
- Create: `apps/web/src/lib/admin/comments-client.ts`
- Create: `apps/web/tests/ui/admin-comments-panel.test.tsx`
- Modify: `apps/web/tests/admin-imports-page.test.mjs`

**Step 1: Write the failing tests**

- Add tests asserting:
  - comments panel renders below the portfolio PDF section
  - panel has a fixed-height scroll area
  - newest-first rows render with admin and guest comments together
  - delete action is present for admin rows
  - post link is present

**Step 2: Run test to verify it fails**

Run:

```bash
cd apps/web
vitest run tests/ui/admin-comments-panel.test.tsx
node --test tests/admin-imports-page.test.mjs
```

Expected: FAIL because the admin comments panel is missing.

**Step 3: Write minimal implementation**

- Create a dedicated admin comments panel component.
- Fetch `/internal-api/admin/comments`.
- Insert the panel below the existing portfolio PDF section in `AdminImportsPanel.tsx`.
- Keep the review list scrollable and newest first.

**Step 4: Run test to verify it passes**

Run:

```bash
cd apps/web
vitest run tests/ui/admin-comments-panel.test.tsx
node --test tests/admin-imports-page.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/components/public/AdminImportsPanel.tsx apps/web/src/components/public/AdminCommentsPanel.tsx apps/web/src/lib/admin/comments-client.ts apps/web/tests/ui/admin-comments-panel.test.tsx apps/web/tests/admin-imports-page.test.mjs
git commit -m "feat(web): add admin comment review panel"
```

### Task 8: Final Verification and Runbook Updates

**Files:**
- Modify: `apps/api/README.md`
- Modify: `apps/web/README.md`
- Modify: `docs/plans/2026-03-13-post-comments-design.md`

**Step 1: Add verification checklist**

- Record exact local commands for backend, frontend, and route/UI checks.
- Record moderation behavior for:
  - private comments
  - deleted comments
  - admin-authored comments

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

- Update runbooks with:
  - guest password rules
  - admin comment review location
  - deleted-comment reply rejection behavior

**Step 4: Re-run smoke verification**

Run:

```bash
cd apps/api
python -c "from app.main import app; print(bool(app.openapi()))"
```

Expected: `True`.

**Step 5: Commit**

```bash
git add apps/api/README.md apps/web/README.md docs/plans/2026-03-13-post-comments-design.md
git commit -m "docs: finalize post comments verification and runbook"
```

---

Execution order recommendation:

1. Complete Task 1 first to freeze the exact API/viewer contract.
2. Finish backend tasks 2 through 4 before building the public React island.
3. Build public UI in Task 6 after proxy types from Task 5 are stable.
4. Add the admin imports review panel in Task 7 once the admin comments endpoint is available.
5. Close with Task 8 full verification.

Use `@superpowers/test-driven-development` for each implementation task and `@superpowers/verification-before-completion` before any completion claim.
