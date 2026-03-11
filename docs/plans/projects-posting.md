# Projects Posting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert `/projects` from static mock data to admin-authored DB-backed project posts while preserving the current public card/detail UI and reusing the existing post writer.

**Architecture:** Extend `posts` with a `content_kind` discriminator and add a `project_profiles` 1:1 table for project-only metadata. Reuse the current admin post writer, list/detail APIs, and series ordering model, then layer project-specific validation and rendering on top. Add shared markdown support for `:::youtube` directives so both blog and project posts can embed YouTube players in body content.

**Tech Stack:** Astro, React, FastAPI, SQLAlchemy, Alembic, Node test runner, pytest

---

### Task 1: Add failing backend model and repository tests for project posts

**Files:**
- Create: `apps/api/tests/repositories/test_project_posts_repository.py`
- Modify: `apps/api/tests/conftest.py` if shared fixtures are needed

**Step 1: Write the failing tests**

- Add tests that prove:
  - project posts sort and query independently from blog posts
  - project detail joins post + project profile
  - blog queries exclude `content_kind=project`
  - series ordering can be returned for a project detail page

**Step 2: Run test to verify it fails**

Run:
```bash
cd apps/api && .venv\Scripts\python -m pytest tests/repositories/test_project_posts_repository.py -q
```

Expected: FAIL because `content_kind` and project profile queries do not exist yet.

**Step 3: Write minimal implementation**

- Add the smallest schema/model/repository support needed to satisfy the first test slice.

**Step 4: Run test to verify it passes**

Run:
```bash
cd apps/api && .venv\Scripts\python -m pytest tests/repositories/test_project_posts_repository.py -q
```

**Step 5: Commit**

```bash
git add apps/api/tests/repositories/test_project_posts_repository.py apps/api/src/app/models apps/api/src/app/repositories
git commit -m "feat: add project post repository model support"
```

### Task 2: Implement backend schema, migration, and service support

**Files:**
- Modify: `apps/api/src/app/models/post.py`
- Create: `apps/api/src/app/models/project_profile.py`
- Modify: `apps/api/src/app/models/__init__.py`
- Create: `apps/api/alembic/versions/<timestamp>_add_project_profiles.py`
- Modify: `apps/api/src/app/repositories/post_repository.py`
- Modify: `apps/api/src/app/services/post_service.py`
- Modify: `apps/api/src/app/schemas/post.py`

**Step 1: Write the failing tests**

- Extend repository/service tests to cover:
  - `content_kind`
  - required project profile fields
  - validation for `image` vs `youtube`

**Step 2: Run test to verify it fails**

Run:
```bash
cd apps/api && .venv\Scripts\python -m pytest tests/repositories/test_project_posts_repository.py tests/api/test_posts_access_guard.py -q
```

Expected: FAIL with missing fields/relationships/validation.

**Step 3: Write minimal implementation**

- Add enum/discriminator
- Add `ProjectProfile`
- Add migration
- Update repository/service/schema code for create, update, list, and detail

**Step 4: Run test to verify it passes**

Run:
```bash
cd apps/api && .venv\Scripts\python -m pytest tests/repositories/test_project_posts_repository.py tests/api/test_posts_access_guard.py -q
```

**Step 5: Commit**

```bash
git add apps/api/src/app/models/post.py apps/api/src/app/models/project_profile.py apps/api/src/app/repositories/post_repository.py apps/api/src/app/services/post_service.py apps/api/src/app/schemas/post.py apps/api/alembic/versions
git commit -m "feat: add backend support for project posts"
```

### Task 3: Add failing API tests for project create/update/list/detail behavior

**Files:**
- Modify: `apps/api/tests/api/test_posts_api.py`
- Create: `apps/api/tests/api/test_projects_api.py`

**Step 1: Write the failing tests**

- Cover:
  - admin create/update project post
  - `/projects` list response only contains project posts
  - project detail response includes profile metadata and related series posts

**Step 2: Run test to verify it fails**

Run:
```bash
cd apps/api && .venv\Scripts\python -m pytest tests/api/test_projects_api.py tests/api/test_posts_api.py -q
```

Expected: FAIL because project-specific endpoints/response shapes do not exist yet.

**Step 3: Write minimal implementation**

- Add project-aware endpoint behavior and DTO shaping using current posts API surfaces where possible.

**Step 4: Run test to verify it passes**

Run:
```bash
cd apps/api && .venv\Scripts\python -m pytest tests/api/test_projects_api.py tests/api/test_posts_api.py -q
```

**Step 5: Commit**

```bash
git add apps/api/tests/api/test_projects_api.py apps/api/tests/api/test_posts_api.py apps/api/src/app/api apps/api/src/app/schemas apps/api/src/app/services
git commit -m "feat: expose project post api behavior"
```

### Task 4: Add failing web tests for projects list/detail rendering

**Files:**
- Modify: `apps/web/tests/project-pages.test.mjs`
- Create: `apps/web/tests/project-db-rendering.test.mjs`
- Modify: `apps/web/tests/internal-api-posts-route.test.mjs` if needed

**Step 1: Write the failing tests**

- Cover:
  - `/projects` still shows period/title/summary/tags card shape
  - `/projects/[slug]` still shows top detail/media/highlights/link box shape
  - project detail renders related series posts list
  - static `projects.ts` is no longer the primary data source

**Step 2: Run test to verify it fails**

Run:
```bash
cd apps/web && node --test tests/project-pages.test.mjs tests/project-db-rendering.test.mjs
```

Expected: FAIL because pages still read static project data.

**Step 3: Write minimal implementation**

- Adjust page loaders and card/detail components to read DB-backed project data while keeping current markup shape.

**Step 4: Run test to verify it passes**

Run:
```bash
cd apps/web && node --test tests/project-pages.test.mjs tests/project-db-rendering.test.mjs
```

**Step 5: Commit**

```bash
git add apps/web/tests/project-pages.test.mjs apps/web/tests/project-db-rendering.test.mjs apps/web/src/pages/projects apps/web/src/components/ProjectCard.astro apps/web/src/lib
git commit -m "feat: render projects from db-backed project posts"
```

### Task 5: Add failing writer tests for project mode

**Files:**
- Modify: `apps/web/tests/admin-writer-page.test.mjs`
- Modify: `apps/web/tests/admin-writer-script.test.mjs`
- Create: `apps/web/tests/ui/admin-project-writer.test.tsx`

**Step 1: Write the failing tests**

- Cover:
  - content kind selection
  - project-only fields visibility
  - series single-select behavior
  - project payload submission shape

**Step 2: Run test to verify it fails**

Run:
```bash
cd apps/web && node --test tests/admin-writer-page.test.mjs tests/admin-writer-script.test.mjs
cd apps/web && npm run test:ui -- admin-project-writer
```

Expected: FAIL because writer has no project mode yet.

**Step 3: Write minimal implementation**

- Extend existing writer types, loaders, submit logic, and form rendering with a project mode.

**Step 4: Run test to verify it passes**

Run:
```bash
cd apps/web && node --test tests/admin-writer-page.test.mjs tests/admin-writer-script.test.mjs
cd apps/web && npm run test:ui -- admin-project-writer
```

**Step 5: Commit**

```bash
git add apps/web/tests/admin-writer-page.test.mjs apps/web/tests/admin-writer-script.test.mjs apps/web/tests/ui/admin-project-writer.test.tsx apps/web/src/lib/admin/new-post-page apps/web/src/pages/admin/posts
git commit -m "feat: add project mode to admin writer"
```

### Task 6: Add failing markdown tests for YouTube directive

**Files:**
- Modify: `apps/web/tests/admin-writer-markdown-renderer.test.mjs`
- Modify: `apps/web/tests/blog-archive-ui.test.mjs` only if shared renderer assertions are needed
- Create: `apps/web/tests/project-markdown-embed.test.mjs`

**Step 1: Write the failing tests**

- Cover:
  - `:::youtube ... :::` renders an embed block
  - invalid directive falls back safely
  - blog and project rendering both use the same directive handler

**Step 2: Run test to verify it fails**

Run:
```bash
cd apps/web && node --test tests/admin-writer-markdown-renderer.test.mjs tests/project-markdown-embed.test.mjs
```

Expected: FAIL because `:::youtube` is not supported yet.

**Step 3: Write minimal implementation**

- Extend shared markdown rendering logic and preview rendering to support the directive.

**Step 4: Run test to verify it passes**

Run:
```bash
cd apps/web && node --test tests/admin-writer-markdown-renderer.test.mjs tests/project-markdown-embed.test.mjs
```

**Step 5: Commit**

```bash
git add apps/web/tests/admin-writer-markdown-renderer.test.mjs apps/web/tests/project-markdown-embed.test.mjs apps/web/src/lib/markdown-renderer-core.ts apps/web/src/lib/markdown-renderer.ts apps/web/src/lib/markdown-renderer-lazy.ts
git commit -m "feat: add youtube directive for post markdown"
```

### Task 7: Remove static projects source and wire final public queries

**Files:**
- Modify: `apps/web/src/pages/projects/index.astro`
- Modify: `apps/web/src/pages/projects/[slug].astro`
- Modify: `apps/web/src/lib/projects.ts` or delete if no longer needed
- Modify: `apps/web/src/lib/blog-db.ts`
- Modify: `apps/web/src/lib/series-db.ts`

**Step 1: Write the failing tests**

- Add/extend tests to prove static lorem data is gone and empty state still works.

**Step 2: Run test to verify it fails**

Run:
```bash
cd apps/web && node --test tests/project-pages.test.mjs tests/project-db-rendering.test.mjs
```

Expected: FAIL because static fallback still exists.

**Step 3: Write minimal implementation**

- Switch all live project rendering to DB-backed helpers.
- Remove static lorem seed source if it is no longer needed.

**Step 4: Run test to verify it passes**

Run:
```bash
cd apps/web && node --test tests/project-pages.test.mjs tests/project-db-rendering.test.mjs
```

**Step 5: Commit**

```bash
git add apps/web/src/pages/projects apps/web/src/lib/projects.ts apps/web/src/lib/blog-db.ts apps/web/src/lib/series-db.ts apps/web/tests/project-pages.test.mjs apps/web/tests/project-db-rendering.test.mjs
git commit -m "refactor: remove static projects source"
```

### Task 8: Full verification

**Files:**
- No code changes expected

**Step 1: Run API tests**

```bash
cd apps/api && .venv\Scripts\python -m pytest tests/repositories/test_project_posts_repository.py tests/api/test_projects_api.py tests/api/test_posts_api.py -q
```

**Step 2: Run web source tests**

```bash
cd apps/web && node --test tests/project-pages.test.mjs tests/project-db-rendering.test.mjs tests/admin-writer-page.test.mjs tests/admin-writer-script.test.mjs tests/admin-writer-markdown-renderer.test.mjs tests/project-markdown-embed.test.mjs
```

**Step 3: Run web UI tests**

```bash
cd apps/web && npm run test:ui -- admin-project-writer
```

**Step 4: Run build**

```bash
cd apps/web && npm run build
```
