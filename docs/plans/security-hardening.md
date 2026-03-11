# Security Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 공개 이미지 프록시를 제한된 내부 게이트웨이로 축소하고, 로그아웃 GET 제거 및 기본 보안 헤더를 추가한다.

**Architecture:** 브라우저는 기존처럼 내부 이미지 프록시를 호출하되, 프록시는 allowlist/timeout/size 제한을 적용한다. 인증 관련 약점은 라우트에서 직접 제거하고, 공통 보안 헤더는 Astro middleware 에서 응답 후처리로 주입한다.

**Tech Stack:** Astro server routes, Astro middleware, Node fetch/AbortController, sharp, node:test

---

### Task 1: Image Proxy Security Tests

**Files:**
- Modify: `apps/web/tests/post-card-image-delivery.test.mjs`

**Step 1: Write the failing tests**

추가 검증:
- `ALLOWED_REMOTE_IMAGE_HOSTS`
- `redirect: "manual"`
- timeout 상수/abort signal
- `Content-Length` 상한
- streamed byte 상한
- 확장된 private IP 차단
- `sharp.limitInputPixels`

**Step 2: Run test to verify it fails**

Run: `node --test apps/web/tests/post-card-image-delivery.test.mjs`

Expected: 새 보안 관련 assertion FAIL

**Step 3: Write minimal implementation**

`apps/web/src/pages/internal-api/media/browser-image.ts` 에 필요한 보안 로직 추가

**Step 4: Run test to verify it passes**

Run: `node --test apps/web/tests/post-card-image-delivery.test.mjs`

Expected: PASS

### Task 2: Logout GET Removal Tests

**Files:**
- Modify: `apps/web/tests/admin-auth.test.mjs`

**Step 1: Write the failing test**

`logout.ts` 가 `POST` 만 export 하고 `GET` export 는 없다는 assertion 추가

**Step 2: Run test to verify it fails**

Run: `node --test apps/web/tests/admin-auth.test.mjs`

Expected: FAIL

**Step 3: Write minimal implementation**

`apps/web/src/pages/internal-api/auth/logout.ts` 에서 `GET` 제거

**Step 4: Run test to verify it passes**

Run: `node --test apps/web/tests/admin-auth.test.mjs`

Expected: PASS

### Task 3: Security Header Tests

**Files:**
- Create: `apps/web/tests/security-headers.test.mjs`
- Modify: `apps/web/src/middleware.ts`

**Step 1: Write the failing test**

middleware source 기준으로 아래 헤더 추가를 검증:
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`
- `Content-Security-Policy`

**Step 2: Run test to verify it fails**

Run: `node --test apps/web/tests/security-headers.test.mjs`

Expected: FAIL

**Step 3: Write minimal implementation**

`next()` 응답을 받아 헤더를 덧붙이는 helper 추가

**Step 4: Run test to verify it passes**

Run: `node --test apps/web/tests/security-headers.test.mjs`

Expected: PASS

### Task 4: Full Web Regression Verification

**Files:**
- No code changes expected

**Step 1: Run focused source tests**

Run:

```bash
node --test apps/web/tests/post-card-image-delivery.test.mjs apps/web/tests/admin-auth.test.mjs apps/web/tests/security-headers.test.mjs apps/web/tests/internal-api-origin-guard.test.mjs
```

Expected: PASS

**Step 2: Run build**

Run:

```bash
cd apps/web
npm run build
```

Expected: exit 0

### Task 5: Document Outcome

**Files:**
- Modify: `docs/plans/security-hardening-design.md`

**Step 1: Update design doc if implementation differs**

구현 중 달라진 allowlist/CSP 세부값을 반영

**Step 2: Final verification**

Run the same focused tests and build again if doc update touched no code, no extra test required.
