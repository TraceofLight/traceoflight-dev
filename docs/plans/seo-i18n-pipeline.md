# SEO/i18n Pipeline Hardening Plan

**Goal:** 다국어(`ko/en/ja/zh`) 인덱싱이 Google Search Console에서 누락되지 않도록 sitemap의 포스트 hreflang 활성화, JSON-LD `inLanguage` 동적화, content collections schema에 다국어 필드 추가, RSS 언어별 분리 + atom self-link / `content:encoded` 확장을 수행.

**Architecture:** 백엔드(`apps/api`)는 이미 `translation_group_id`를 schema에 보유 중. frontend의 `DbPost`/`DbBlogPost` 타입과 fetch 매핑만 동기화하고, 그 키로 sitemap에서 sibling을 그룹화하면 됨. JSON-LD는 `lib/seo/structured-data.ts`의 하드코딩 `"ko-KR"`을 BCP-47 헬퍼로 교체. RSS는 `pages/rss-[locale].xml.ts` 동적 라우트로 분리하고 BaseHead alternate를 갱신. content collections schema는 zod에 `lang`/`translationKey`를 추가 (file-mode 보조용; DB-mode가 메인이지만 스키마 일관성 유지).

**Tech Stack:** Astro 5 (SSR, node adapter), TypeScript, `@astrojs/rss`, zod, vitest.

**Branch:** `feat/seo-i18n-pipeline` (worktree at `.worktrees/seo-i18n-pipeline/`).

**Provenance:** Picks up residual SEO/i18n work from the archived
site-translations family (see `docs/plans/README.md` and
`docs/plans/archive/site-translations*.md`). Specifically: the post-level
sitemap hreflang emission that `site-translations.md` Task 12 and
`site-translations-extended.md` Task 15 deferred until sibling rows exist,
plus three items those plans never covered (RSS per-locale split, content
collections schema lang/translationKey, JSON-LD `inLanguage` dynamic mapping).

---

## Task 1 — JSON-LD `inLanguage` 동적화

**Why first:** 변경 범위 작고(5개 파일), 다른 작업과 의존성 없음. PR 효과는 즉시 (Search Console에서 언어 신호 정합성 회복).

**Files:**
- Modify: `apps/web/src/lib/seo/structured-data.ts:60,114,162` — 하드코딩 `"ko-KR"` 3곳
- Modify: `apps/web/src/pages/[locale]/index.astro:324` — `inLanguage: locale` (BCP-47 미준수)
- Modify: `apps/web/src/pages/[locale]/blog/index.astro:202`
- Modify: `apps/web/src/pages/[locale]/projects/index.astro:50`
- Modify: `apps/web/src/pages/[locale]/series/index.astro:65`
- Create: `apps/web/src/lib/i18n/bcp47.ts` — `localeToBcp47(locale: PublicLocale): string` 단일 함수
- Test: `apps/web/tests/i18n/bcp47.test.ts`

**Steps:**

- [ ] **1.1** `bcp47.ts`에 헬퍼 + 테스트 추가 (TDD)

```ts
// 매핑: ko → ko-KR, en → en-US, ja → ja-JP, zh → zh-CN
export function localeToBcp47(locale: PublicLocale): string {
  const map: Record<PublicLocale, string> = {
    ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN",
  };
  return map[locale];
}
```

- [ ] **1.2** `structured-data.ts`의 BlogPosting/Series CollectionPage/Project CreativeWork 빌더가 `locale: PublicLocale` 인자를 받도록 시그니처 확장. 호출부(`pages/[locale]/...` 5곳) locale 전달.
- [ ] **1.3** `vitest run lib/seo` + `vitest run i18n/bcp47` PASS 확인.
- [ ] **1.4** `astro build` 성공 확인 (typecheck 회귀 없음).
- [ ] **1.5** Commit: `feat(seo): make JSON-LD inLanguage locale-aware`

---

## Task 2 — Content collections schema에 `lang`/`translationKey` 추가

**Why second:** Task 3의 file-mode 측 sibling 그룹화 전제. DB-mode는 백엔드 필드 사용하므로 영향 없음.

**Files:**
- Modify: `apps/web/src/content.config.ts` — schema 확장
- Modify: `apps/web/src/content/blog/*.{md,mdx}` — 기존 글 백필 (있다면)
- Modify: `apps/web/src/lib/content-source.ts:64-77` — `toPostCard`에 lang/translationKey 매핑
- Test: `apps/web/tests/content-schema.test.ts` (신규, 또는 기존 테스트 확장)

**Steps:**

- [ ] **2.1** schema 확장:

```ts
schema: ({ image }) => z.object({
  // ... 기존 필드
  lang: z.enum(["ko", "en", "ja", "zh"]).default("ko"),
  translationKey: z.string().min(1).optional(),
}),
```

- [ ] **2.2** 기존 `src/content/blog/*.{md,mdx}` 글들 frontmatter에 `lang: ko` (필요 시 `translationKey`) 백필. 글이 없으면 skip.
- [ ] **2.3** `toPostCard`와 `BlogEntry` 사용처에서 신규 필드 surfacing.
- [ ] **2.4** `astro check` + `vitest run` PASS.
- [ ] **2.5** Commit: `feat(content): add lang/translationKey to blog schema`

---

## Task 3 — Sitemap 포스트 hreflang 활성화 (DbPost 타입 + 그룹화)

**Why third:** Task 1, 2의 결과를 sitemap에서 활용. Google Search Console 다국어 인덱싱의 핵심 픽스.

**Files:**
- Modify: `apps/web/src/lib/blog-db.ts:13-33` — `DbPost`에 `translation_group_id?: string` 추가
- Modify: `apps/web/src/lib/blog-db.ts:40-60,197-226` — `DbBlogPost` + `toSharedBlogPostFields`에 `translationGroupId` 매핑
- Modify: `apps/web/src/pages/sitemap.xml.ts:78-87` — 그룹화 후 alternates 발급
- Test: `apps/web/tests/sitemap-route.test.mjs` — sibling 그룹의 hreflang alternates 검증 케이스 추가

**Steps:**

- [ ] **3.1** `DbPost`/`DbBlogPost` 타입과 매핑에 translation_group_id 추가. 백엔드 응답이 이 필드를 보낸다는 사실은 `apps/api/src/app/schemas/post.py:118,179` 로 확인됨. 누락 시 undefined 처리(타입에 optional).
- [ ] **3.2** sitemap test 우선 작성 (TDD): "동일 translationGroupId를 공유하는 4개 locale 포스트가 있을 때 각 URL이 4개 alternate + x-default를 갖는다" 케이스. 현재 코드로는 FAIL.
- [ ] **3.3** `getDynamicEntries`에서 posts를 `translationGroupId || null`로 그룹화. 그룹 사이즈 ≥ 2면 그룹 멤버 locale로 alternates 발급, x-default는 그룹 안에 ko 있으면 ko, 없으면 첫 번째 locale.
- [ ] **3.4** test PASS 확인.
- [ ] **3.5** 빌드 후 `curl http://localhost:4321/sitemap.xml`로 실제 출력 sniff (개발 서버에서). 다국어 글이 없으면 변화 없음을 확인.
- [ ] **3.6** Commit: `feat(seo): enable per-post hreflang alternates in sitemap`

---

## Task 4 — RSS 언어별 분리 + atom self-link + `content:encoded`

**Why last:** RSS는 검색 인덱싱보다 사용자 구독 측면이라 우선순위 낮음. 다만 Feedly/Reader Validator 호환성과 다국어 구독자 분리는 가치 있음.

**Files:**
- Rename: `apps/web/src/pages/rss.xml.js` → `apps/web/src/pages/rss-[locale].xml.ts` (locale별 동적 라우트)
- Create: `apps/web/src/pages/rss.xml.ts` — 기본 ko 피드 (legacy 호환)
- Modify: `apps/web/src/components/BaseHead.astro:105` — alternate링크를 locale 기반 `rss-{locale}.xml`로
- Test: `apps/web/tests/rss-route.test.mjs` (신규)

**Steps:**

- [ ] **4.1** test 우선: "/rss-en.xml은 영어 글만, atom:link self, lastBuildDate, content:encoded 포함"
- [ ] **4.2** locale별 라우트 구현. `@astrojs/rss`의 `customData` 옵션으로 `<atom:link rel="self" href="..."/>` + `<lastBuildDate>...</lastBuildDate>` 삽입. items의 `content:` 필드로 `content:encoded` (escape는 라이브러리가 처리).
- [ ] **4.3** posts fetch에 `locale` 파라미터 적용 (`listAllPublishedDbPosts({ locale })` 시그니처 확인 후).
- [ ] **4.4** legacy `/rss.xml` 라우트는 ko 피드 그대로 반환 (구독자 URL 보존).
- [ ] **4.5** BaseHead의 RSS alternate를 현재 페이지 locale에 맞춰 `rss-{locale}.xml`로 동적화 + `<link rel="alternate" type="application/rss+xml" hreflang="..." href="..." />`로 4개 모두 노출.
- [ ] **4.6** test PASS + W3C Feed Validator 형식 점검 (수동).
- [ ] **4.7** Commit: `feat(rss): split feed by locale, add atom self-link and content:encoded`

---

## Task 5 — IndexNow ping pipeline (post-publish auto-notify)

**Why follow-up:** sitemap만으로는 Google이 발견할 때까지 며칠~몇 주 걸림.
IndexNow는 Bing/Yandex/Naver/Seznam에 publish 즉시 push해서 분~시간 단위
인덱싱을 받는 표준 프로토콜. Google은 IndexNow 미참여이므로 별도 수단(GSC
manual or 자연 크롤링)에 위임.

**Files:**
- Create: `apps/api/src/app/services/indexnow_service.py` — fire-and-forget HTTP POST helper (stdlib only, no new deps)
- Modify: `apps/api/src/app/core/config.py` — `INDEXNOW_KEY`/`INDEXNOW_HOST`/`INDEXNOW_ENDPOINT` settings
- Modify: `apps/api/src/app/api/deps.py` — singleton injection into `PostService`
- Modify: `apps/api/src/app/services/post_service.py` — `_ping_indexnow` hook fired by `create_post` and `update_post_by_slug` whenever the resulting row's status is `published`
- Modify: `apps/api/.env.api.example` — document the three new env vars
- Create: `apps/web/src/pages/[indexnowKey].txt.ts` — SSR ownership-key route, echoes `INDEXNOW_KEY` body when the URL segment matches and 404s otherwise
- Modify: `apps/web/.env.web.example` — document `INDEXNOW_KEY`
- Test: `apps/api/tests/services/test_indexnow_service.py` (7 cases) and `apps/api/tests/services/test_post_service_indexnow.py` (6 cases) and `apps/web/tests/indexnow-key-route.test.mjs` (3 cases)

**Verification:**
- After deploying with `INDEXNOW_KEY=<k>` set, `https://www.traceoflight.dev/<k>.txt` must return body == `<k>` with `200 text/plain`.
- Submit `https://www.bing.com/indexnow?url=https://www.traceoflight.dev/&key=<k>` to confirm Bing accepts the key (one-time bootstrap).
- Publishing a post should produce a single ping per `(host, locale, slug)` URL, fire-and-forget on a daemon thread so the admin save response is unaffected.

**Out of scope:** Google Indexing API integration (its policy explicitly limits use to JobPosting/BroadcastEvent and applies spam rules to other content types — see https://developers.google.com/search/apis/indexing-api/v3/quickstart).

---

## Verification (모든 task 완료 후)

- `cd apps/web && bun run build` 성공
- `bun run test` 전체 PASS
- 빌드된 dist에서 `dist/server/pages/sitemap.xml.astro.mjs` 출력 확인 (실제 hreflang 검증은 dev 서버 또는 staging 배포 필요)
- Google Rich Results Test에 임의 URL 1개 → BlogPosting `inLanguage` 필드가 페이지 locale과 일치하는지 확인 (수동)

## Out of scope (이번 plan에서 제외)

- 백엔드(`apps/api`) 변경 — 이미 `translation_group_id` 보유, 추가 변경 불필요
- admin UI에 description 길이/필수 검증 — 별도 plan 권장 (DB schema 차원의 검증이 더 적절)
- robots.txt — 현재 정상
- 다국어 sitemap 인덱스(`sitemap-index.xml`) 분리 — 단일 사이트 규모상 불필요
