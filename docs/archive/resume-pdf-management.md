# Resume PDF Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a publicly viewable resume PDF entry in the footer and let admins upload/replace the file from `/admin/imports`.

**Architecture:** Use a fixed object-storage key for the resume PDF and expose dedicated backend endpoints for upload, status, and public download. Web will proxy admin uploads through authenticated internal-api routes and render a public `/resume` route that either streams the PDF or shows an empty state message.

**Tech Stack:** Astro, React, FastAPI, MinIO object storage, Node test runner, pytest

---

### Task 1: Add failing backend tests for resume PDF storage

**Files:**
- Create: `apps/api/tests/api/test_resume_api.py`
- Modify: `apps/api/tests/conftest.py` if shared fixtures are required

**Steps:**
1. Add tests for `GET /resume`, `GET /resume/status`, and admin upload.
2. Verify red with:
   `cd apps/api && .venv\\Scripts\\python -m pytest tests/api/test_resume_api.py -q`

### Task 2: Implement backend resume storage endpoints

**Files:**
- Create: `apps/api/src/app/services/resume_service.py`
- Create: `apps/api/src/app/schemas/resume.py`
- Create: `apps/api/src/app/api/v1/endpoints/resume.py`
- Modify: `apps/api/src/app/api/v1/router.py`
- Modify: `apps/api/src/app/api/deps.py`
- Modify: `apps/api/src/app/storage/minio_client.py`

**Steps:**
1. Add `ResumeService` with fixed object key helpers, existence check, PDF validation, upload, and download stream helpers.
2. Add public GET endpoints for file/status and protected upload endpoint.
3. Run:
   `cd apps/api && .venv\\Scripts\\python -m pytest tests/api/test_resume_api.py -q`

### Task 3: Add failing web tests for footer, public route, and admin route

**Files:**
- Modify: `apps/web/tests/footer-copy.test.mjs`
- Create: `apps/web/tests/resume-page.test.mjs`
- Create: `apps/web/tests/internal-api-resume-route.test.mjs`
- Modify: `apps/web/tests/ui/admin-imports-panel.test.tsx`

**Steps:**
1. Add tests for footer resume icon, `/resume` route behavior, admin upload proxy auth, and admin imports UI.
2. Verify red with:
   `cd apps/web && node --test tests/resume-page.test.mjs tests/internal-api-resume-route.test.mjs`
   `cd apps/web && npm run test:ui -- admin-imports-panel`

### Task 4: Implement web internal-api and public routes

**Files:**
- Create: `apps/web/src/pages/internal-api/resume/upload.ts`
- Create: `apps/web/src/pages/internal-api/resume/status.ts`
- Create: `apps/web/src/pages/resume.ts`
- Modify: `apps/web/src/lib/backend-api.ts` only if helper support is needed

**Steps:**
1. Add admin-guarded upload proxy route and public status proxy.
2. Add public `/resume` route that streams PDF if available or returns an empty HTML response.
3. Run:
   `cd apps/web && node --test tests/resume-page.test.mjs tests/internal-api-resume-route.test.mjs`

### Task 5: Implement footer resume icon and admin imports UI

**Files:**
- Create: `apps/web/src/assets/icons/footer/scroll.svg`
- Modify: `apps/web/src/components/Footer.astro`
- Modify: `apps/web/src/components/FooterIconLink.astro`
- Modify: `apps/web/src/components/public/AdminImportsPanel.tsx`
- Modify: `apps/web/src/lib/admin/imports-page.ts`

**Steps:**
1. Add footer resume icon button before mail.
2. Add resume upload card/state to admin imports UI.
3. Reuse current action/surface styles.
4. Run:
   `cd apps/web && npm run test:ui -- admin-imports-panel`
   `cd apps/web && node --test tests/footer-copy.test.mjs tests/resume-page.test.mjs tests/internal-api-resume-route.test.mjs`

### Task 6: Full verification

**Files:**
- No code changes expected

**Steps:**
1. Run API tests:
   `cd apps/api && .venv\\Scripts\\python -m pytest tests/api/test_resume_api.py -q`
2. Run web source tests:
   `cd apps/web && node --test tests/footer-copy.test.mjs tests/resume-page.test.mjs tests/internal-api-resume-route.test.mjs tests/admin-imports-page.test.mjs`
3. Run web UI tests:
   `cd apps/web && npm run test:ui -- admin-imports-panel`
4. Run build:
   `cd apps/web && npm run build`
