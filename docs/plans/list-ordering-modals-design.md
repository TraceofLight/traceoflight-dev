# List Ordering Modals Design

## Goal

`/projects` 와 `/series` 목록 페이지에서 admin 전용 순서 조정 버튼을 제공하고, 별도 `/admin/projects` 페이지 없이 같은 페이지 위 모달에서 정렬을 수정할 수 있게 만든다.

## Scope

- `/projects`
  - `글 작성` 버튼은 유지
  - `순서 조정` 버튼은 목록 페이지에서 큰 모달을 연다
  - 프로젝트 목록 순서를 직접 조정하고 저장한다
- `/series`
  - admin일 때 `순서 조정` 버튼을 추가한다
  - 시리즈 목록 순서를 직접 조정하고 저장한다
- `/projects/[slug]`
  - 상세 하단의 `SeriesAdminPanel` 은 제거한다
- `/admin/projects`
  - 삭제한다

## Data Model

현재 프로젝트 목록은 `posts.created_at/published_at` 기준이고, 시리즈 목록은 `series.updated_at` 기준이다. 목록 수동 정렬을 위해 명시적 순서 필드가 필요하다.

- `posts.project_order_index`
  - `content_kind=project` 목록 정렬용
  - nullable 허용
- `series.list_order_index`
  - `/series` 목록 정렬용
  - nullable 허용

정렬 규칙:
- 명시적 순서가 있으면 그 순서를 우선
- 같은 값 또는 null인 경우 기존 최신순 fallback 유지

## API

- `PUT /api/v1/projects/order`
  - 내부 시크릿 필요
  - `project_slugs: string[]`
  - 전달 순서대로 `project_order_index` 재배치
- `PUT /api/v1/series/order`
  - 내부 시크릿 필요
  - `series_slugs: string[]`
  - 전달 순서대로 `list_order_index` 재배치

웹 내부 프록시도 같은 형태로 추가한다.

## UI

### Projects index

- admin일 때 헤더 우측에
  - `순서 조정`
  - `글 작성`
- `순서 조정` 클릭 시 큰 모달 오픈
- 모달 안에는 프로젝트 카드 요약 리스트와 `위/아래`, drag 스타일 재배치 UI
- 저장 후 목록 순서도 즉시 반영

### Series index

- admin일 때 헤더 우측에 `순서 조정` 버튼 추가
- 클릭 시 큰 모달 오픈
- 시리즈 카드 요약 리스트 기준으로 순서 재배치

### Project detail

- 상세 하단의 시리즈 정렬 패널 제거
- 정렬은 목록 페이지에서만 수행

## Reuse Strategy

기존 `SeriesAdminPanel` 은 상세용 메타 수정 + 시리즈 글 순서 조정이 같이 섞여 있어서 목록 모달에 그대로 재사용하지 않는다. 대신 목록 정렬 전용 패널을 새로 만든다.

- 새 공용 패널:
  - `CollectionOrderModal.tsx`
  - `CollectionOrderList.tsx`
- 타입별 래퍼:
  - `ProjectOrderPanel.tsx`
  - `SeriesOrderPanel.tsx`

## Testing

- API
  - 프로젝트 순서 저장
  - 시리즈 순서 저장
  - 잘못된 slug / unauthorized 처리
- Web source tests
  - `/admin/projects` 제거
  - `/projects` admin 버튼/모달
  - `/series` admin 버튼/모달
  - `/projects/[slug]` 에서 상세 하단 순서 조정 제거
- UI tests
  - 프로젝트 순서 패널 저장
  - 시리즈 순서 패널 저장

## Risks

- 기존 정렬 fallback 과 충돌하지 않도록 nullable 순서 필드를 안전하게 사용해야 한다.
- 공개 목록과 admin 저장 결과가 바로 일치해야 하므로 프론트 optimistic update 범위를 작게 유지한다.
