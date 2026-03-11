# Shared Top Media Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Promote `상단 미디어` to a shared post-level concept for both blog and project content, move those controls into publish settings, simplify preview metadata, and remove leftover legacy top-section terminology from code.

**Architecture:** `posts` owns both `썸네일` and `상단 미디어`. `project_profiles` keeps only project-specific descriptive metadata. The writer keeps classification and project text metadata in the persistent metadata section, while publish settings owns slug/summary/tags/thumbnail/top-media configuration. Public blog/project detail pages both render the shared top-media field.

**Tech Stack:** Astro, TypeScript, FastAPI, SQLAlchemy, Pydantic, Alembic

---

### Task 1: Lock the new shared top-media expectations in tests

**Files:**
- Modify: `apps/web/tests/admin-writer-page.test.mjs`
- Modify: `apps/web/tests/admin-writer-script.test.mjs`
- Modify: `apps/web/tests/project-pages.test.mjs`
- Modify: `apps/web/tests/home-page-layout.test.mjs`
- Modify: `apps/api/tests/api/test_posts_admin_edit_delete.py`
- Modify: `apps/api/tests/api/test_projects_api.py`
- Modify: `apps/api/tests/api/test_project_model_mapping.py`

**Steps:**
1. Add failing writer assertions for publish modal top-media controls.
2. Add failing assertions that preview no longer renders summary/tag cards.
3. Add failing assertions that preview renders a top-media block.
4. Add failing API/repository expectations for post-level top-media fields.
5. Add failing expectations that project profiles no longer carry top-media fields.
6. Add failing source expectations for renamed `PUBLIC_TOP_MEDIA_*` usage.

### Task 2: Add shared top-media columns to posts and remove project-only media fields

**Files:**
- Modify: `apps/api/src/app/models/post.py`
- Modify: `apps/api/src/app/models/project_profile.py`
- Modify: `apps/api/src/app/schemas/post.py`
- Modify: `apps/api/src/app/repositories/post_repository.py`
- Create: `apps/api/alembic/versions/20260312_0008_promote_top_media_to_posts.py`

**Steps:**
1. Add `top_media_kind`, `top_media_image_url`, `top_media_youtube_url`, `top_media_video_url` to `Post`.
2. Remove project-only media fields from `ProjectProfile`.
3. Update Pydantic schemas for shared post-level top media.
4. Backfill existing project top-media data into posts during migration.
5. Drop old project-profile media columns after the backfill.

### Task 3: Update writer payload normalization and submit flow

**Files:**
- Modify: `apps/web/src/lib/admin/new-post-page/types.ts`
- Modify: `apps/web/src/lib/admin/new-post-page/dom.ts`
- Modify: `apps/web/src/lib/admin/new-post-page/posts-api.ts`
- Modify: `apps/web/src/lib/admin/new-post-page/loaders.ts`
- Modify: `apps/web/src/lib/admin/new-post-page/submit.ts`
- Modify: `apps/web/src/lib/admin/new-post-page/submit-events.ts`
- Modify: `apps/web/src/lib/admin/new-post-page/media-controller.ts`

**Steps:**
1. Normalize shared top-media fields from the API payload.
2. Move top-media inputs and upload controls into publish settings DOM.
3. Submit shared top-media fields for both blog and project posts.
4. Keep project metadata focused on text/list fields only.
5. Reuse uploaded-video flow for shared `상단 미디어`.

### Task 4: Update writer markup and preview structure

**Files:**
- Modify: `apps/web/src/pages/admin/posts/new.astro`
- Modify: `apps/web/src/pages/admin/posts/[slug]/edit.astro`
- Modify: `apps/web/src/lib/admin/new-post-page/preview.ts`
- Modify: `apps/web/src/styles/components/writer/core.css`
- Modify: `apps/web/src/styles/components/writer/preview.css`

**Steps:**
1. Put `상단 미디어` controls in the publish modal beside existing thumbnail controls.
2. Remove summary/tag cards from preview metadata.
3. Add a persistent top-media preview block between metadata and body preview.
4. Keep empty-state boxes visible so the left/right layout stays aligned.

### Task 5: Render shared top media in public blog/project detail pages

**Files:**
- Modify: `apps/web/src/layouts/BlogPost.astro`
- Modify: `apps/web/src/lib/projects.ts`
- Modify: `apps/web/src/pages/projects/[slug].astro`

**Steps:**
1. Blog detail reads shared top-media fields.
2. Project detail reads shared top-media fields.
3. Preserve project intro/highlights/links behavior.
4. Keep thumbnail rendering unchanged for cards/lists.

### Task 6: Remove remaining legacy top-section naming from code-facing identifiers

**Files:**
- Modify: `apps/web/src/lib/ui-effects.ts`
- Modify: `apps/web/src/pages/index.astro`
- Modify: `apps/web/tests/home-page-layout.test.mjs`
- Modify: `apps/api/src/app/schemas/series.py`
- Modify: affected docs referencing legacy top-section wording

**Steps:**
1. Rename top-level constants and local variables from legacy top-section names to `top media`.
2. Update tests and textual schema descriptions accordingly.

### Task 7: Verify

**Run:**
- `cd apps/api && .venv\\Scripts\\python -m pytest tests/api/test_posts_admin_edit_delete.py tests/api/test_projects_api.py tests/api/test_project_model_mapping.py -q`
- `cd apps/web && node --test tests/admin-writer-page.test.mjs tests/admin-writer-script.test.mjs tests/project-pages.test.mjs tests/home-page-layout.test.mjs`
- `cd apps/web && npm run build`
