# Admin RTR Auth Plan

## Goal
- `/admin` 및 `/internal-api` 보호를 세션 단일 토큰 방식에서 `Access Token + Refresh Token Rotation(RTR)` 방식으로 전환한다.

## Scope
- 대상: `apps/web` (Astro 서버 미들웨어 + internal auth API)
- 비대상: FastAPI 백엔드 자체 JWT 검증(현재 프론트 internal-api 경유 구조 유지)

## Architecture
- 로그인 성공 시 두 개의 `httpOnly` 쿠키 발급
  - Access Token: 짧은 만료(기본 15분)
  - Refresh Token: 긴 만료(기본 14일), 사용 시마다 새 토큰으로 교체(RTR)
- 서버는 refresh 토큰 상태를 메모리 저장소로 관리(Map)
  - `jti`, `familyId`, `used`, `revoked`, `expiresAt`, `tokenHash`
- 미들웨어는 보호 경로 접근 시
  1. access 유효 -> 통과
  2. access 만료 + refresh 유효 -> refresh rotate 후 새 쿠키 발급하고 통과
  3. refresh가 이미 rotate된 부모 토큰이면 `stale`로 처리 (family revoke 금지)
  4. refresh 재사용/변조 -> `reuse_detected`로 family revoke + 쿠키 제거 + 차단

## Token/Session Rules
- 토큰 서명: HMAC-SHA256
- 토큰 타입:
  - access claim: `type=access`
  - refresh claim: `type=refresh`
- refresh replay 탐지:
  - 이미 `used`된 refresh 토큰 재사용 시 `reuse detected`로 판단
  - 같은 family 전부 revoke 처리
- 회전 결과 타입:
  - `rotated`, `stale`, `reuse_detected`, `invalid`, `expired`
- 로그아웃:
  - 현재 refresh family revoke
  - access/refresh 쿠키 즉시 삭제

## Endpoints
- `POST /internal-api/auth/login`
  - id/pw 검증 후 token pair 발급
- `POST /internal-api/auth/logout`
  - refresh family revoke + 쿠키 삭제
- `POST /internal-api/auth/refresh` (옵션 endpoint)
  - refresh를 명시적으로 rotate

## Middleware Behavior
- 보호 경로: `/admin/*`, `/internal-api/*`
- 예외 경로: `/admin/login`, `/internal-api/auth/*`
- 미인증 처리:
  - internal-api -> `401`
  - admin page -> `/admin/login?next=...` redirect
- `stale` 처리:
  - 쿠키 강제 삭제하지 않음
  - 현재 요청만 미인증 처리 (다음 요청에서 최신 쿠키로 회복 가능)

## Redirect Safety
- `/admin/login?next=...`의 `next`는 내부 경로만 허용
- 차단 규칙:
  - 절대 URL (`https://...`) 차단
  - 프로토콜 상대 URL (`//...`) 차단
  - `/internal-api` 경로 차단

## Env Variables
- `ADMIN_LOGIN_ID`
- `ADMIN_LOGIN_PASSWORD_HASH` (우선)
- `ADMIN_LOGIN_PASSWORD` (fallback, migration 용도)
- `ADMIN_SESSION_SECRET` (HMAC secret)
- `ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS` (default: 900)
- `ADMIN_REFRESH_TOKEN_MAX_AGE_SECONDS` (default: 1209600)

## Security Notes
- 현재 refresh 저장소는 in-memory라 프로세스 재시작 시 세션이 사라진다.
- 단일 인스턴스 운영 기준에는 유효하며, 다중 인스턴스로 가면 Redis 같은 외부 저장소로 이전 필요.
- 운영에서는 `ADMIN_LOGIN_PASSWORD_HASH`만 사용하고 평문 fallback 제거 권장.

## Implementation Steps
1. `admin-auth.ts`를 RTR 토큰/저장소 구조로 교체
2. `middleware.ts`에서 access 검증 + refresh 자동 rotate 처리
3. login/logout endpoint를 RTR API로 교체, refresh endpoint 추가
4. `.env.example`, `docker-compose.yml`, `README.md` 업데이트
5. auth 테스트 갱신 및 `npm run test`, `npm run build` 검증
