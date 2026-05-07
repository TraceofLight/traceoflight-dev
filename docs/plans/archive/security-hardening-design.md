# Security Hardening Design

## Goal

보안 점검 보고서에서 타당한 항목만 반영해, 공개 이미지 프록시의 SSRF/자원 고갈 위험을 줄이고 관리자 세션 관련 약점을 정리한다.

## Scope

- `/internal-api/media/browser-image` 공개 프록시 축소
- `/internal-api/auth/logout` 의 `GET` 제거
- 앱 레벨 기본 보안 헤더 추가
- 관련 회귀 테스트 추가

제외:

- 프록시 바깥 nginx/openresty 설정
- DB 스키마 변경

## Current State

### 공개 이미지 프록시

`apps/web/src/pages/internal-api/media/browser-image.ts` 는 외부 `http/https` URL을 직접 `fetch()` 하고 `sharp` 로 변환한다.

현재 문제:

- 원본 호스트 allowlist가 없다
- `redirect` 기본값을 사용한다
- 타임아웃이 없다
- `Content-Length`/실제 다운로드 바이트 상한이 없다
- private/link-local 대역 차단이 제한적이다

### 로그아웃

`apps/web/src/pages/internal-api/auth/logout.ts` 는 `GET` 과 `POST` 를 모두 허용한다. 현재 UI 호출은 이미 `POST` form 기준이다.

### 보안 헤더

앱 코드 안에서는 일반 응답에 공통 보안 헤더를 거의 추가하지 않는다.

## Approaches

### 1. 이미지 프록시 제거

장점:

- SSRF 표면을 가장 크게 줄인다

단점:

- 현재 카드 이미지 최적화 흐름을 크게 바꿔야 한다
- 외부 이미지 사용 경험이 깨진다

### 2. 제한된 내부 프록시로 축소

장점:

- 현재 브라우저 -> 내부 프록시 구조는 유지한다
- 내부 경로 및 소수 허용 호스트만 남겨 위험 표면을 줄일 수 있다
- 테스트/운영 영향이 가장 현실적이다

단점:

- 허용 호스트 관리가 필요하다

### 3. 범용 프록시 유지 + 방어만 추가

장점:

- 기존 외부 이미지 호환성이 가장 높다

단점:

- SSRF 표면이 계속 넓다
- 점검 보고서의 핵심 우려를 구조적으로 해결하지 못한다

## Recommendation

2번을 채택한다.

정리:

- 브라우저는 계속 내부 프록시 하나만 호출한다
- 프록시는 `same-origin`, `/images/...`, `/media/...`, 환경변수 allowlist 호스트만 허용한다
- 외부 요청은 `redirect: "manual"` + timeout + 크기 제한 + 추가 private 대역 차단을 적용한다
- 로그아웃은 `POST` 만 허용한다
- 보안 헤더는 Astro middleware 에서 공통 주입한다

## Detailed Design

### 1. Browser Image Route

파일:

- `apps/web/src/pages/internal-api/media/browser-image.ts`
- `apps/web/src/lib/cover-media.ts`

변경:

- `ALLOWED_REMOTE_IMAGE_HOSTS` 환경변수 기반 allowlist 도입
- 기본 허용:
  - same-origin
  - `SITE_URL` origin
  - backend asset origin
  - 운영 환경에서 명시한 allowlist 호스트
- 차단 강화:
  - `169.254.0.0/16`
  - `100.64.0.0/10`
  - `198.18.0.0/15`
  - IPv6 loopback/link-local/ULA
- 외부 fetch:
  - `redirect: "manual"`
  - `AbortController` timeout
  - `Content-Length` 상한 검사
  - stream 기반 실제 바이트 상한 검사
- `sharp.limitInputPixels()` 적용

### 2. Logout

파일:

- `apps/web/src/pages/internal-api/auth/logout.ts`
- 관련 테스트

변경:

- `GET` export 제거
- 현재 `POST` 기반 UI 는 유지

### 3. Security Headers

파일:

- `apps/web/src/middleware.ts`
- 관련 테스트

헤더:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy`
  - 현재 앱 동작 범위에 맞춘 최소 정책
  - self / inline theme bootstrap / GA4 / YouTube embed / data: image 정도만 허용

HSTS 는 프록시 계층에서 다루는 편이 더 적절하므로 앱 코드에선 이번 범위에서 제외한다.

### 4. security.txt

파일:

- `apps/web/public/.well-known/security.txt`

변경:

- 공개 연락처로 `mailto:rickyjun96@gmail.com`
- canonical URL
- 선호 언어

## Risks

- allowlist 밖 외부 이미지는 더 이상 렌더되지 않을 수 있다
- CSP 가 너무 빡빡하면 기존 inline/script/embed 가 깨질 수 있다

대응:

- 테스트로 현재 허용되어야 하는 경로를 잠근다
- CSP 는 현재 앱에서 실제 쓰는 리소스만 기준으로 단계적으로 적용한다

## Testing

- `apps/web/tests/post-card-image-delivery.test.mjs`
  - allowlist, redirect manual, timeout/size 제한 소스 가드
- `apps/web/tests/admin-auth.test.mjs`
  - logout `GET` 제거
- 새 테스트:
  - `apps/web/tests/security-headers.test.mjs`
  - middleware 헤더 주입 검증

## Expected Outcome

- 공개 프록시가 범용 외부 fetch 도구가 아니라 제한된 이미지 게이트웨이가 된다
- 강제 로그아웃 CSRF 표면이 줄어든다
- 앱 응답이 기본 보안 헤더를 일관되게 갖는다
