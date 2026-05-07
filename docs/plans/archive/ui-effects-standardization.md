# UI Effects Standardization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 공개 페이지와 운영 UI 전반의 반복 시각 효과를 공용 상수로 통합한다.

**Architecture:** `apps/web/src/lib/ui-effects.ts`에 효과 상수를 정의하고, Astro/TSX 파일이 이를 import해 사용하도록 바꾼다. 테스트는 개별 raw 클래스 기대값 대신 공용 효과 사용 여부를 확인하도록 옮긴다.

**Tech Stack:** Astro, React, Tailwind utility classes, node:test, Vitest

---

### Task 1: 공용 효과 레이어 정의

**Files:**
- Create: `apps/web/src/lib/ui-effects.ts`
- Test: `apps/web/tests/home-page-layout.test.mjs`

**Steps:**

1. `surface`, `action`, `icon action`, `danger action`, `hover card`, `pill`, `badge` 상수를 추가한다.
2. 홈 페이지 테스트에 공용 효과 상수 import/use 기대값을 추가한다.
3. 테스트를 실행해 실패를 확인한다.
4. 최소 구현으로 테스트를 통과시킨다.

### Task 2: 공개 페이지와 카드 컴포넌트 적용

**Files:**
- Modify: `apps/web/src/pages/index.astro`
- Modify: `apps/web/src/components/ProjectCard.astro`
- Modify: `apps/web/src/components/PostCard.astro`
- Modify: `apps/web/src/components/SeriesCard.astro`
- Modify: `apps/web/src/pages/projects/[slug].astro`
- Modify: `apps/web/src/pages/series/[slug].astro`
- Modify: `apps/web/src/layouts/BlogPost.astro`
- Test: `apps/web/tests/home-page-layout.test.mjs`
- Test: `apps/web/tests/project-pages.test.mjs`
- Test: `apps/web/tests/series-page.test.mjs`
- Test: `apps/web/tests/blog-archive-ui.test.mjs`
- Test: `apps/web/tests/public-surface-states.test.mjs`

**Steps:**

1. 카드/섹션/CTA에 공용 효과를 적용한다.
2. 상세 페이지 링크/빈 상태 CTA에도 surface action을 적용한다.
3. 관련 소스 테스트를 공용 상수 사용 기준으로 갱신한다.

### Task 3: 운영 UI와 공용 인터랙션 적용

**Files:**
- Modify: `apps/web/src/components/public/AdminImportsPanel.tsx`
- Modify: `apps/web/src/components/public/BlogArchiveFilters.tsx`
- Modify: `apps/web/src/components/FooterIconLink.astro`
- Modify: `apps/web/src/components/public/FooterAdminModal.tsx`
- Modify: `apps/web/src/components/Header.astro`
- Test: `apps/web/tests/admin-imports-page.test.mjs`
- Test: `apps/web/tests/public-surface-states.test.mjs`
- Test: `apps/web/tests/blog-archive-ui.test.mjs`
- Test: `apps/web/tests/ui/admin-imports-panel.test.tsx`

**Steps:**

1. 운영 패널/풋터 아이콘/헤더 danger pill에도 공용 효과를 적용한다.
2. 필터칩/관리 버튼은 기존 상태 로직을 유지하면서 공용 기반 효과만 공유한다.
3. 관련 테스트를 갱신한다.

### Task 4: 검증

**Files:**
- Test only

**Steps:**

1. `node --test tests/home-page-layout.test.mjs tests/public-surface-states.test.mjs tests/project-pages.test.mjs tests/series-page.test.mjs tests/admin-imports-page.test.mjs tests/blog-archive-ui.test.mjs`
2. `npm run test:ui -- admin-imports-panel`
3. `npm run build`
4. 남는 경고를 기록한다.

### Task 5: 역할 기반 박스 효과 확장

**Files:**
- Modify: `apps/web/src/lib/ui-effects.ts`
- Modify: `apps/web/src/pages/index.astro`
- Modify: `apps/web/src/components/HeaderLink.astro`
- Modify: `apps/web/src/components/ui/input.tsx`
- Modify: `apps/web/src/components/ui/select.tsx`
- Modify: `apps/web/src/components/ui/dialog.tsx`
- Modify: `apps/web/src/components/ui/sheet.tsx`
- Modify: `apps/web/src/components/ui/alert-dialog.tsx`
- Modify: `apps/web/src/components/public/BlogArchiveFilters.tsx`
- Modify: `apps/web/src/components/public/AdminImportsPanel.tsx`
- Test: `apps/web/tests/home-page-layout.test.mjs`
- Test: `apps/web/tests/public-surface-states.test.mjs`
- Test: `apps/web/tests/admin-imports-page.test.mjs`
- Test: `apps/web/tests/blog-archive-ui.test.mjs`

**Steps:**

1. `top media`, `field`, `popover`, `modal`, `nav active` 역할 상수를 추가한다.
2. 홈 상단 미디어, profile/skill panel, 아카이브 field wrapper, admin imports file display에 새 역할 상수를 적용한다.
3. input/select/dialog/sheet/alert-dialog가 새 공용 surface를 재사용하도록 정리한다.
4. 관련 소스 테스트를 공용 상수 사용 기준으로 갱신한다.
