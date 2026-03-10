# UI Effects Standardization Design

**Date:** 2026-03-11

## Goal

공개 페이지와 운영 UI 전반에 흩어진 반복 Tailwind 효과 문자열을 공용 레이어로 정리해, 같은 표면/버튼/카드/칩 효과가 파일마다 갈라지지 않도록 만든다.

## Scope

- `apps/web` 기준으로 반복도가 높은 UI 효과만 공용화한다.
- 우선 대상은 `surface`, `hover card`, `action`, `icon action`, `danger pill`, `badge/chip` 계열이다.
- 페이지별 레이아웃, 의미가 다른 1회성 spacing, 콘텐츠 문구는 공용화 대상에서 제외한다.

## Approach

### Option A: 전역 CSS 유틸리티 클래스 추가

- 장점: Astro/TSX 어디서든 바로 재사용 가능하다.
- 단점: 클래스 조합 의도가 CSS 안으로 숨어서, Tailwind 기반 컴포넌트와 추적이 분리된다.

### Option B: `ui-effects.ts`에 효과 상수 모음 추가

- 장점: 기존 Tailwind inline 스타일 흐름을 유지하면서 반복 조합만 공용화할 수 있다.
- 장점: Astro와 TSX 모두 import로 같은 효과를 공유할 수 있다.
- 단점: padding/spacing 같은 문맥 값은 여전히 로컬에서 덧붙여야 한다.

### Option C: 모든 버튼/카드 UI를 컴포넌트화

- 장점: 사용 지점이 단순해질 수 있다.
- 단점: 공개 CTA, 운영 버튼, 필터칩까지 한 컴포넌트에 몰리면 variant만 비대해진다.

## Recommendation

Option B를 기본으로 적용한다. 먼저 효과 레이어를 상수화하고, 정말 안정적인 패턴만 컴포넌트로 승격한다.

## Shared Effect Groups

- `PUBLIC_SECTION_SURFACE_CLASS`
- `PUBLIC_PANEL_SURFACE_CLASS`
- `PUBLIC_PANEL_SURFACE_SOFT_CLASS`
- `PUBLIC_HOVER_CARD_CLASS`
- `PUBLIC_SURFACE_ACTION_CLASS`
- `PUBLIC_PRIMARY_OUTLINE_ACTION_CLASS`
- `PUBLIC_ICON_ACTION_CLASS`
- `PUBLIC_PILL_CLASS`
- `PUBLIC_BADGE_CLASS`
- `DANGER_PILL_ACTION_CLASS`

## Rollout Order

1. 공용 효과 파일 추가
2. 홈, 카드 컴포넌트, 공개 상세 페이지에 적용
3. 아카이브/운영 패널 및 푸터/헤더에 적용
4. 소스 기반 테스트를 raw 클래스 문자열에서 공용 효과 사용 기준으로 전환

## Testing

- 소스 테스트는 공용 효과 파일 import/사용 여부를 검증한다.
- UI 테스트는 동작/상태를 유지한다.
- 마지막에 `npm run build`로 산출물 검증까지 진행한다.
