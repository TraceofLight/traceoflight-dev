# Admin RTR Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stabilize admin RTR auth by fixing refresh-rotation race handling, redirect safety, credential verification hardening, and behavior-level test coverage.

**Architecture:** Keep Astro middleware + internal auth endpoints, but refactor token logic into a testable auth core with explicit rotation outcomes. Middleware and endpoints should react differently to `reuse` vs `stale` vs `invalid` outcomes, so normal concurrent requests do not revoke valid sessions. Redirect sanitation and password-hash verification are separated into small utilities to avoid auth module bloat.

**Tech Stack:** Astro 5, TypeScript, Node `crypto`, Node test runner (`node:test`), `tsx` (TypeScript test execution), optional `@node-rs/argon2`

---

### Task 1: Add Behavior-Level Auth Test Harness

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/tests/admin-auth/rtr-core.test.ts`
- Create: `apps/web/tests/admin-auth/redirect-safety.test.ts`

**Step 1: Write the failing tests**

```ts
// apps/web/tests/admin-auth/rtr-core.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminAuthCore } from '../../src/lib/admin-auth-core';

test('reused parent refresh token from rotation race is stale, not family revoke', () => {
  const core = createAdminAuthCore({ secret: 'x'.repeat(32) });
  const login = core.issueLoginPair();
  const first = core.rotateRefresh(login.refreshToken);
  assert.equal(first.kind, 'rotated');
  const second = core.rotateRefresh(login.refreshToken);
  assert.equal(second.kind, 'stale');
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:auth`  
Expected: FAIL because `admin-auth-core` module and stale/race behavior do not exist yet.

**Step 3: Add test runner script/dependency**

```json
{
  "scripts": {
    "test:guards": "node --test tests/**/*.test.mjs",
    "test:auth": "node --import tsx --test tests/admin-auth/**/*.test.ts",
    "test": "npm run test:guards && npm run test:auth"
  },
  "devDependencies": {
    "tsx": "^4.20.0"
  }
}
```

**Step 4: Run tests again**

Run: `npm run test:auth`  
Expected: Still FAIL (logic not implemented), but runner works.

**Step 5: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/tests/admin-auth
git commit -m "test(web): add TypeScript auth behavior test harness"
```

### Task 2: Refactor RTR Logic Into Testable Core + Race-Safe Outcomes

**Files:**
- Create: `apps/web/src/lib/admin-auth-core.ts`
- Modify: `apps/web/src/lib/admin-auth.ts`
- Test: `apps/web/tests/admin-auth/rtr-core.test.ts`

**Step 1: Write failing test for outcome taxonomy**

```ts
test('tampered refresh token revokes family', () => {
  const core = createAdminAuthCore({ secret: 'x'.repeat(32) });
  const login = core.issueLoginPair();
  const tampered = `${login.refreshToken}x`;
  const out = core.rotateRefresh(tampered);
  assert.equal(out.kind, 'reuse_detected');
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test:auth`  
Expected: FAIL on missing `kind` outcomes / incorrect revoke behavior.

**Step 3: Implement minimal core**

```ts
// apps/web/src/lib/admin-auth-core.ts
export type RotateKind =
  | 'rotated'
  | 'stale'
  | 'reuse_detected'
  | 'invalid'
  | 'expired';

export interface RotateResult {
  kind: RotateKind;
  pair?: TokenPair;
}

// stale rule:
// state.used && state.rotatedToJti && child exists && !child.revoked => { kind: 'stale' }
// DO NOT revoke family for stale.
```

```ts
// apps/web/src/lib/admin-auth.ts
// keep env/cookie adapter here, delegate token operations to admin-auth-core
```

**Step 4: Run tests to verify pass**

Run: `npm run test:auth`  
Expected: PASS for rotation race/reuse/expiry cases.

**Step 5: Commit**

```bash
git add apps/web/src/lib/admin-auth-core.ts apps/web/src/lib/admin-auth.ts apps/web/tests/admin-auth/rtr-core.test.ts
git commit -m "refactor(web): extract RTR core and add race-safe rotation outcomes"
```

### Task 3: Update Middleware and Auth Endpoints for New Rotation Semantics

**Files:**
- Modify: `apps/web/src/middleware.ts`
- Modify: `apps/web/src/pages/internal-api/auth/refresh.ts`
- Modify: `apps/web/src/pages/internal-api/auth/logout.ts`
- Test: `apps/web/tests/admin-auth/rtr-core.test.ts`

**Step 1: Write failing behavior tests**

```ts
test('middleware should not clear cookies on stale refresh', async () => {
  // simulate stale outcome and assert cookie clear helper is not called
});
```

**Step 2: Run tests to verify it fails**

Run: `npm run test:auth`  
Expected: FAIL because middleware/refresh handling still treats stale as invalid.

**Step 3: Implement minimal handling**

```ts
// middleware.ts
// rotated => set cookies + next()
// stale => do not clear cookies; return unauthorized/redirect (next request will use newer cookie)
// reuse_detected | invalid => clear cookies
```

```ts
// refresh.ts
// return detail by kind:
// stale => 409 or 401 with explicit code
// reuse_detected => 401 + clear cookies
```

**Step 4: Run tests**

Run: `npm run test:auth`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/middleware.ts apps/web/src/pages/internal-api/auth/refresh.ts apps/web/src/pages/internal-api/auth/logout.ts apps/web/tests/admin-auth/rtr-core.test.ts
git commit -m "fix(web): handle RTR stale/reuse outcomes consistently in middleware and endpoints"
```

### Task 4: Prevent Open Redirect in Admin Login

**Files:**
- Create: `apps/web/src/lib/admin-redirect.ts`
- Modify: `apps/web/src/pages/admin/login.astro`
- Test: `apps/web/tests/admin-auth/redirect-safety.test.ts`

**Step 1: Write failing redirect tests**

```ts
import { sanitizeNextPath } from '../../src/lib/admin-redirect';

test('reject absolute external URL', () => {
  assert.equal(sanitizeNextPath('https://evil.example'), '/admin');
});

test('allow internal admin path', () => {
  assert.equal(sanitizeNextPath('/admin/posts/new'), '/admin/posts/new');
});
```

**Step 2: Run tests to verify fail**

Run: `npm run test:auth`  
Expected: FAIL because sanitizer does not exist.

**Step 3: Implement sanitizer + apply to login page**

```ts
// admin-redirect.ts
export function sanitizeNextPath(input: string | null): string {
  if (!input) return '/admin';
  if (!input.startsWith('/')) return '/admin';
  if (input.startsWith('//')) return '/admin';
  if (input.startsWith('/internal-api')) return '/admin';
  return input;
}
```

```astro
// login.astro script
const rawNext = new URL(window.location.href).searchParams.get('next');
const nextUrl = sanitizeNextPath(rawNext);
```

**Step 4: Run tests**

Run: `npm run test:auth`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/lib/admin-redirect.ts apps/web/src/pages/admin/login.astro apps/web/tests/admin-auth/redirect-safety.test.ts
git commit -m "fix(web): sanitize admin next redirect targets"
```

### Task 5: Replace Plain Password Compare with Hash Verification

**Files:**
- Modify: `apps/web/src/lib/admin-auth.ts`
- Modify: `apps/web/.env.example`
- Modify: `apps/web/README.md`
- Test: `apps/web/tests/admin-auth/rtr-core.test.ts`

**Step 1: Write failing auth test**

```ts
test('verifyAdminCredentials supports hashed password env', async () => {
  // given ADMIN_LOGIN_PASSWORD_HASH, plaintext comparison should be disabled
});
```

**Step 2: Run tests to verify fail**

Run: `npm run test:auth`  
Expected: FAIL because only plain env comparison exists.

**Step 3: Implement hash-first verification**

```ts
// precedence:
// 1) ADMIN_LOGIN_PASSWORD_HASH (argon2/bcrypt)
// 2) fallback ADMIN_LOGIN_PASSWORD (for migration window)
```

```env
# .env.example
ADMIN_LOGIN_PASSWORD_HASH=
# ADMIN_LOGIN_PASSWORD=change-me  # keep only as temporary fallback note
```

**Step 4: Run full verification**

Run: `npm test`  
Expected: PASS.

Run: `npm run build`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/lib/admin-auth.ts apps/web/.env.example apps/web/README.md apps/web/tests/admin-auth
git commit -m "security(web): support hashed admin password verification"
```

### Task 6: Final Integration Verification and Docs Sync

**Files:**
- Modify: `docs/plans/admin-rtr-auth.md`
- Modify: `apps/web/README.md`

**Step 1: Write failing checklist (manual)**

Use this checklist and mark all as pending before verification:
- [ ] `/admin/login?next=https://evil.example` redirects internally only
- [ ] Access expiry + single refresh rotation keeps session
- [ ] Concurrent expired requests do not trigger family revoke
- [ ] Replayed/tampered refresh revokes family and clears cookies

**Step 2: Run verification commands**

Run: `npm test && npm run build`  
Expected: PASS.

**Step 3: Validate manually**

Run: `npm run dev`  
Check:
- Login/logout flow
- Auto-rotation on access expiry
- Redirect safety

**Step 4: Update docs minimally**

```md
# docs/plans/admin-rtr-auth.md
- add stale/race-safe semantics
- add hash env variable policy
- add redirect sanitizer notes
```

**Step 5: Commit**

```bash
git add docs/plans/admin-rtr-auth.md apps/web/README.md
git commit -m "docs(web): update RTR auth behavior and security notes"
```

