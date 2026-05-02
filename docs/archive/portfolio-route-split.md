# Portfolio Route Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Promote `portfolio` to the public PDF route family while closing outward `resume` routes and keeping a visible but inactive resume panel in admin.

**Architecture:** Keep a single stored PDF object and expose it through a new `portfolio` route set across backend, web public route, and internal API proxy. Replace current outward `resume` access with `404` responses, but leave a disabled `resume` section in the admin imports panel so a future reactivation can reuse the same UI shape.

**Tech Stack:** FastAPI, Astro SSR, React islands, node:test, Vitest, pytest

---

### Task 1: Lock expected route behavior with tests

**Files:**
- Modify: `apps/api/tests/api/test_resume_api.py`
- Modify: `apps/web/tests/resume-page.test.mjs`
- Modify: `apps/web/tests/internal-api-resume-route.test.mjs`
- Modify: `apps/web/tests/footer-copy.test.mjs`
- Modify: `apps/web/tests/admin-imports-page.test.mjs`

### Task 2: Add portfolio route family and close outward resume access

**Files:**
- Create: `apps/api/src/app/api/v1/endpoints/portfolio.py`
- Modify: `apps/api/src/app/api/v1/endpoints/resume.py`
- Modify: `apps/api/src/app/api/v1/router.py`
- Create: `apps/web/src/pages/portfolio.ts`
- Modify: `apps/web/src/pages/resume.ts`
- Create: `apps/web/src/pages/internal-api/portfolio/status.ts`
- Create: `apps/web/src/pages/internal-api/portfolio/upload.ts`

### Task 3: Switch admin/public UI to portfolio-first wording and keep resume panel visible but inactive

**Files:**
- Modify: `apps/web/src/components/Footer.astro`
- Modify: `apps/web/src/components/FooterIconLink.astro`
- Modify: `apps/web/src/components/public/AdminImportsPanel.tsx`
- Modify: `apps/web/src/lib/admin/imports-client.ts`
- Modify: `apps/web/src/pages/admin/imports.astro`

### Task 4: Verify targeted and full regressions

**Files:**
- Verify only

