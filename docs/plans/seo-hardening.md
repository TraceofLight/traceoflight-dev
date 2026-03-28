# SEO Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** UI 변경 없이 사이트의 검색엔진 정규화, 사이트맵 품질, 글 상세 메타데이터를 강화한다.

**Architecture:** 공통 head/layout 계층에서 메타데이터와 문서 언어를 정리하고, 블로그 글 레이아웃에서 article 전용 메타와 구조화 데이터를 주입한다. 기존 빌드 타임 sitemap 의존은 줄이고, 런타임에서 실제 공개 콘텐츠를 기준으로 sitemap을 생성해 DB 기반 게시글까지 포함한다.

**Tech Stack:** Astro 5, Node adapter, Astro middleware, Node test runner, TypeScript

---

### Task 1: SEO 가드 테스트 추가

**Files:**
- Modify: `apps/web/tests/public-routing-and-head.test.mjs`
- Create: `apps/web/tests/sitemap-route.test.mjs`

**Step 1: Write the failing test**

- 공통 head가 `og:site_name`, `author`, article 메타, JSON-LD 진입점을 지원하는지 검증
- 공통 레이아웃이 `lang="ko"`를 쓰는지 검증
- sitemap 라우트가 글/프로젝트/시리즈 상세 URL을 포함하는지 검증

**Step 2: Run test to verify it fails**

Run: `npm run test:guards -- public-routing-and-head.test.mjs sitemap-route.test.mjs`

Expected: 새 SEO 요구사항이 아직 구현되지 않아 FAIL

### Task 2: 공통 SEO 메타 확장

**Files:**
- Modify: `apps/web/src/components/BaseHead.astro`
- Modify: `apps/web/src/layouts/BaseLayout.astro`
- Modify: `apps/web/src/layouts/AdminWriterLayout.astro`
- Modify: `apps/web/src/consts.ts`

**Step 1: Write minimal implementation**

- 공통 head에 `og:site_name`, `author`, optional robots, article 메타, JSON-LD 지원 추가
- 기본 문서 언어를 `ko`로 통일
- 사이트 상수에 SEO용 설명/작성자 상수 추가

**Step 2: Run tests**

Run: `npm run test:guards -- public-routing-and-head.test.mjs`

Expected: PASS

### Task 3: 글 상세 article 메타 연결

**Files:**
- Modify: `apps/web/src/layouts/BlogPost.astro`
- Modify: `apps/web/src/pages/index.astro`
- Modify: `apps/web/src/pages/blog/index.astro`
- Modify: `apps/web/src/pages/projects/index.astro`
- Modify: `apps/web/src/pages/series/index.astro`

**Step 1: Write minimal implementation**

- 블로그 글 상세에서 article 타입과 JSON-LD를 전달
- 홈/목록 페이지 title/description을 더 구체화

**Step 2: Run tests**

Run: `npm run test:guards -- public-routing-and-head.test.mjs`

Expected: PASS

### Task 4: 런타임 sitemap과 URL 정규화

**Files:**
- Modify: `apps/web/astro.config.mjs`
- Modify: `apps/web/public/robots.txt`
- Modify: `apps/web/src/middleware.ts`
- Create: `apps/web/src/pages/sitemap.xml.ts`
- Modify: `apps/web/src/components/BaseHead.astro`
- Modify: `apps/web/tests/public-routing-and-head.test.mjs`
- Modify: `apps/web/tests/sitemap-route.test.mjs`

**Step 1: Write minimal implementation**

- stale build-time sitemap 통합을 제거
- DB 기준 sitemap.xml 런타임 라우트 추가
- 대표 호스트 및 공개 URL 슬래시 정규화 리다이렉트 추가
- robots와 head의 sitemap 링크를 새 경로로 교체

**Step 2: Run tests**

Run: `npm run test:guards -- public-routing-and-head.test.mjs sitemap-route.test.mjs`

Expected: PASS

### Task 5: 최종 검증

**Files:**
- No code changes expected

**Step 1: Run focused verification**

Run: `npm run test:guards`

Expected: PASS

**Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS
