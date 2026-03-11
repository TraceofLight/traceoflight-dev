# Writer Project Metadata Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move project-heavy metadata out of the publish modal, add uploaded project hero video support, separate project intro from excerpt, and move writer upload toasts to the upper-right.

**Architecture:** The writer shell keeps the existing editor and preview panes, but gains a persistent metadata side panel for generic metadata and project-only fields. Backend project profiles expand with a `video` media kind, a stored uploaded video URL, and a dedicated `project_intro` field so project detail pages can keep `excerpt` for top-level summary while rendering richer intro copy in the dedicated intro card.

**Tech Stack:** Astro, TypeScript, Milkdown writer runtime, FastAPI, SQLAlchemy, Pydantic

---

### Task 1: Lock the expected writer layout in tests

**Files:**
- Modify: `apps/web/tests/admin-writer-page.test.mjs`
- Modify: `apps/web/tests/admin-writer-script.test.mjs`
- Modify: `apps/web/tests/project-pages.test.mjs`

**Steps:**
1. Add failing assertions for a new metadata panel shell in create/edit writer pages.
2. Add failing assertions that content kind / visibility / series / tags / project fields no longer live in the publish modal section.
3. Add failing assertions for the dedicated `project_intro` field in the metadata panel.
4. Add failing assertions for project hero video controls and upper-right toast position.
5. Add failing assertion that project detail page uses `excerpt` in the top detail area and `project_intro` in the intro card.

### Task 2: Lock backend project profile expansion in tests

**Files:**
- Modify: `apps/api/tests/api/test_projects_api.py`
- Modify: `apps/api/tests/api/test_posts_admin_edit_delete.py`
- Modify: `apps/api/tests/api/test_project_model_mapping.py`

**Steps:**
1. Add failing API expectations for `detail_media_kind=video`.
2. Add failing expectations for persisted `detail_video_url`.
3. Add failing expectations for persisted `project_intro`.
4. Add failing expectation that project reads still serialize image/youtube correctly.

### Task 3: Expand backend project profile schema and persistence

**Files:**
- Modify: `apps/api/src/app/models/project_profile.py`
- Modify: `apps/api/src/app/schemas/post.py`
- Modify: `apps/api/src/app/repositories/post_repository.py`
- Create: `apps/api/alembic/versions/20260311_0007_add_project_detail_video_url.py`

**Steps:**
1. Add `VIDEO` enum member.
2. Add `detail_video_url` and `project_intro` columns and schema fields.
3. Update repository create/update mapping.
4. Amend Alembic migration `20260311_0007` before deployment.

### Task 4: Move metadata controls into a persistent writer side panel

**Files:**
- Modify: `apps/web/src/pages/admin/posts/new.astro`
- Modify: `apps/web/src/pages/admin/posts/[slug]/edit.astro`
- Modify: `apps/web/src/styles/components/writer/core.css`
- Modify: `apps/web/src/styles/components/writer/layers.css`
- Modify: `apps/web/src/styles/components/writer/fields.css`
- Modify: `apps/web/src/styles/components/writer/responsive.css`

**Steps:**
1. Add metadata side panel markup.
2. Move generic/project metadata fields from publish modal into the new side panel.
3. Keep slug/excerpt/cover in the publish modal.
4. Update responsive layout so small screens still collapse safely.

### Task 5: Add project intro and hero video flow to the writer

**Files:**
- Modify: `apps/web/src/lib/admin/new-post-page/dom.ts`
- Modify: `apps/web/src/lib/admin/new-post-page/media-controller.ts`
- Modify: `apps/web/src/lib/admin/new-post-page/loaders.ts`
- Modify: `apps/web/src/lib/admin/new-post-page/submit.ts`
- Modify: `apps/web/src/lib/admin/new-post-page/submit-events.ts`
- Modify: `apps/web/src/lib/admin/new-post-page/types.ts`

**Steps:**
1. Add DOM selectors for `project_intro` and project video upload trigger/input/preview/url field.
2. Reuse upload bundle flow for project hero video uploads.
3. Restrict hero video upload to `video/*`.
4. Persist `project_intro` and `detail_video_url` in the submit payload.
5. Load existing `project_intro` and `detail_video_url` in edit mode.

### Task 6: Render the corrected project detail content layout

**Files:**
- Modify: `apps/web/src/lib/projects.ts`
- Modify: `apps/web/src/pages/projects/[slug].astro`

**Steps:**
1. Map `detail_video_url` and `project_intro` through the project DTO.
2. Add `<video controls>` rendering branch for `detail_media_kind=video`.
3. Render `excerpt` in the top header/detail summary.
4. Render `project_intro` in the dedicated intro card.
5. Preserve existing image/youtube branches.

### Task 7: Move writer toast to the upper-right and reuse it for upload progress

**Files:**
- Modify: `apps/web/src/styles/components/writer/preview.css`
- Modify: `apps/web/src/lib/admin/new-post-page/media-controller.ts`

**Steps:**
1. Move the fixed toast anchor to the top-right.
2. Ensure body upload, cover upload, and hero video upload all emit progress/status through the same toast.

### Task 8: Verify

**Files:**
- Test: `apps/web/tests/admin-writer-page.test.mjs`
- Test: `apps/web/tests/admin-writer-script.test.mjs`
- Test: `apps/web/tests/project-pages.test.mjs`
- Test: `apps/api/tests/api/test_projects_api.py`
- Test: `apps/api/tests/api/test_posts_admin_edit_delete.py`
- Test: `apps/api/tests/api/test_project_model_mapping.py`

**Run:**
- `cd apps/web && node --test tests/admin-writer-page.test.mjs tests/admin-writer-script.test.mjs tests/project-pages.test.mjs`
- `cd apps/api && .venv\\Scripts\\python -m pytest tests/api/test_projects_api.py tests/api/test_posts_admin_edit_delete.py tests/api/test_project_model_mapping.py -q`
- `cd apps/web && npm run build`
