# Visitor Counter Design

## Goal

사이트 전체 공용 플로팅 카드에서 `Powered by TraceofLight`와 `Today / Total` 방문자 수를 노출한다.  
숫자 집계는 자체 카운터를 만들지 않고 Google Analytics 4 Data API를 서버 측에서 읽어온다.

## Scope

포함:

- 모든 페이지 우측 하단 플로팅 카드
- `Powered by TraceofLight`
- `Today / Total` 숫자 표시
- Astro SSR 서버 전용 GA4 조회
- 서버 메모리 TTL 캐시

제외:

- 게시글별 조회수
- 자체 방문자 집계 DB
- 관리자용 분석 대시보드
- GA 수치 보정 로직
- 댓글/포트폴리오 영역과 결합된 별도 사이드바

## UI

위젯은 기존 [FloatingUtilityButtons.tsx](/D:/Projects/Github/traceoflight-dev/apps/web/src/components/public/FloatingUtilityButtons.tsx) 영역을 확장한다.

- 위치: 모든 페이지 우측 하단
- 형식: 기존 테마 토글/맨 위로 버튼과 같은 플로팅 계열 카드
- 텍스트:
  - 상단 `Powered by TraceofLight`
  - 하단 `Today 123 / Total 4567`
- 톤:
  - 본문보다 약한 정보 밀도
  - 숫자는 읽히되 레이아웃 주도권은 갖지 않음
- 모바일:
  - 폭 축소
  - 한 줄 또는 2줄 이내 유지
  - 버튼과 카드가 겹치지 않게 세로 스택 유지

## Data Source

방문자 수는 기존 GA4 삽입 지점 [BaseHead.astro](/D:/Projects/Github/traceoflight-dev/apps/web/src/components/BaseHead.astro)의 수집과 별도로, 서버 측 GA4 Data API 조회로 읽는다.

- 수집: 기존 `GA4_MEASUREMENT_ID`
- 조회: GA4 Data API
- 조회 위치: Astro SSR 서버 전용 코드
- 브라우저는 숫자만 받음
- 서비스 계정 키/프로퍼티 ID는 서버 환경변수로만 보관

## Metric Definition

표시 지표는 둘 다 GA4 Data API의 `totalUsers`를 기준으로 한다.

- `Today`
  - date range: `today` ~ `today`
  - metric: `totalUsers`
- `Total`
  - date range: `2005-01-01` ~ `today` 같은 고정 시작일 또는 사이트 런칭 기준일
  - metric: `totalUsers`

이 설계는 공개 카드가 장식성 지표라는 전제에서, 설명 가능한 단일 기준을 유지하는 데 목적이 있다.

## Architecture

구현은 `apps/web` 안에서 끝낸다.

- [BaseLayout.astro](/D:/Projects/Github/traceoflight-dev/apps/web/src/layouts/BaseLayout.astro)
  - 서버 측에서 visitor summary 조회
  - 플로팅 카드로 summary 전달
- `src/lib/server/ga4-summary.ts`
  - GA4 Data API 호출
  - env 검증
  - TTL 캐시
  - 실패 시 `null`
- [FloatingUtilityButtons.tsx](/D:/Projects/Github/traceoflight-dev/apps/web/src/components/public/FloatingUtilityButtons.tsx)
  - summary prop 수신
  - 값이 있으면 카드 표시
  - 값이 없으면 카드 숨김

`apps/api`는 이번 기능에 필요하지 않다.

## Cache Policy

- 캐시 위치: Astro 서버 프로세스 메모리
- TTL: 10분
- 캐시 대상:
  - `todayVisitors`
  - `totalVisitors`
  - `fetchedAt`
- 동작:
  - 캐시 유효 시 GA 재호출 생략
  - 캐시 만료 시 다음 서버 요청에서 갱신

이는 공개 위젯이므로 초단위 실시간성이 필요 없고, GA API quota와 응답 지연을 줄이는 편이 더 중요하다.

## Failure Policy

- env 누락
- 인증 실패
- GA API 응답 실패
- metric parsing 실패

위 경우 전부 동일하게 처리한다.

- 방문자 카드 숨김
- 페이지 렌더는 정상 진행
- 콘솔 또는 서버 로그에만 요약 기록

실패 상태를 `Today - / Total -`처럼 노출하지 않는다.

## Security

- 서비스 계정 credential은 서버 전용 env만 사용
- `PUBLIC_` 접두 env 사용 금지
- 브라우저에는 숫자와 라벨만 전달
- GA4 reports quick link 같은 관리자 보조 링크가 필요하더라도 visitor card에는 노출하지 않음

## Environment Variables

[.env.example](/D:/Projects/Github/traceoflight-dev/apps/web/.env.example)와 [README.md](/D:/Projects/Github/traceoflight-dev/apps/web/README.md)에 아래 항목을 추가한다.

- `GA4_PROPERTY_ID`
- `GA4_SERVICE_ACCOUNT_JSON`
- 선택:
  - `GA4_VISITOR_TOTAL_START_DATE`
  - `GA4_VISITOR_CACHE_TTL_SECONDS`

`GA4_MEASUREMENT_ID`는 기존 클라이언트 수집용으로 유지한다.

## Testing

가드 테스트:

- 새 서버 유틸 생성 여부
- `FloatingUtilityButtons.tsx`가 visitor summary prop과 카드를 렌더하는지
- `BaseLayout.astro`가 서버 summary를 플로팅 카드에 전달하는지
- env 문서 업데이트 여부

UI 테스트:

- 값이 있을 때 카드 렌더
- 값이 없을 때 카드 숨김
- 모바일/버튼 공존 레이아웃 클래스 유지

## Rollout Notes

- 처음 배포 전 GA4 property에 서비스 계정 접근 권한이 있어야 한다
- GA 숫자는 GA UI와 완전히 같지 않을 수 있다
- 이 위젯은 분석 도구가 아니라 공개 활동감 지표로 취급한다
