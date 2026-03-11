# Projects Posting Design

## Goal

현재 정적 `/projects` 영역을 DB 기반 게시글 작성 흐름으로 옮기되, 공개 페이지의 카드/상세 UI는 유지하고 admin writer는 기존 blog writer와 최대한 같은 구조를 재사용한다.

## Recommended Approach

`posts`를 공용 본문 저장소로 유지하고, 프로젝트 전용 메타데이터만 1:1 보조 테이블로 분리한다.

- `posts`에 `content_kind = blog | project`를 추가한다.
- 프로젝트 전용 필드는 `project_profiles`에 둔다.
- `/blog`는 `content_kind=blog`만, `/projects`는 `content_kind=project`만 조회한다.
- writer는 기존 post writer를 확장하고, `project` 모드에서만 프로젝트 메타 필드를 노출한다.
- 프로젝트 상세 하단의 관련 포스트 목록은 기존 `series_posts.order_index`를 재사용한다.

## Why This

- 기존 draft/publish/media/markdown/writer 흐름을 다시 만들 필요가 없다.
- 사용자가 요구한 `/projects` 카드 형식과 상세 형식을 유지하면서 데이터 소스만 정적으로 바꿀 수 있다.
- 프로젝트 하단의 series 포스트 목록은 현재 blog 상세에서 이미 쓰는 패턴과 잘 맞는다.
- series 연결을 1개로 제한하면 편집 UX와 조회 로직이 단순하다.

## Data Model

### Posts

기존 `posts`에 아래 필드를 추가한다.

- `content_kind`: `blog` 또는 `project`

기존 필드는 그대로 유지한다.

- `slug`
- `title`
- `excerpt`
- `body_markdown`
- `cover_image_url`
- `status`
- `visibility`
- `published_at`
- `series_title`

### Project Profiles

새로운 `project_profiles` 1:1 테이블을 추가한다.

- `post_id`
- `period_label`
- `role_summary`
- `card_image_url`
- `detail_media_kind`
  - `image`
  - `youtube`
- `detail_image_url`
- `youtube_url`
- `highlights_json`
- `resource_links_json`

### Series

- 프로젝트는 series 1개만 연결 가능하다.
- 순서는 기존 `series_posts.order_index`를 그대로 사용한다.
- 프로젝트 상세 하단에 노출되는 포스트 목록도 이 순서를 따른다.

## Public Rendering

### Projects Index

`/projects`는 published `project` post와 `project_profile`을 조합해서 렌더한다.

유지할 카드 구성:

- 작업 기간
- 제목
- 요약
- 태그

카드 썸네일은 항상 `card_image_url`을 사용한다. 상세 상단에 유튜브가 있더라도 목록 카드에는 정적 이미지를 유지한다.

### Project Detail

`/projects/[slug]`는 현재 형식을 유지한다.

- 상단 디테일
- 대표 썸네일 또는 상단 유튜브 hero
- 주요 항목
- 관련 링크 박스
- markdown 본문
- 하단 related posts 목록

상단 hero 규칙:

- `youtube_url`이 있으면 유튜브 플레이어를 우선 노출한다.
- 없으면 `detail_image_url` 또는 기존 대표 이미지 계열을 사용한다.

하단 related posts 규칙:

- 연결된 series가 있으면 series 내 포스트를 순서대로 보여준다.
- blog 상세처럼 현재 글 기준 앞/뒤만 보여줄지, 전체 목록을 보여줄지는 구현 단계에서 현재 UI를 보고 결정한다.
- 기본 방향은 “프로젝트 하단에 series 포스트가 쭉 리스팅되는” 형태다.

## Writer UX

기존 admin post writer를 확장한다.

- `content_kind` 선택 추가
- `project` 선택 시 프로젝트 전용 필드 표시
- `blog` 선택 시 기존 필드만 표시

프로젝트 전용 필드:

- 작업 기간
- 역할 요약
- 카드 썸네일 이미지
- 상세 상단 미디어 타입
- 상세 이미지 또는 유튜브 링크
- 주요 항목 목록
- 관련 링크 목록
- series 단일 선택

본문은 기존 markdown editor를 그대로 사용한다.

## Markdown Video Syntax

본문 내 유튜브 임베드는 blog/project 공통으로 `:::youtube` block directive를 지원한다.

예시:

```md
:::youtube
https://www.youtube.com/watch?v=abcdefghijk
:::
```

이 문법을 선택한 이유:

- 일반 Markdown 링크와 충돌하지 않는다.
- writer 버튼 없이도 명시적으로 작성 가능하다.
- 이후 caption/start time 같은 옵션을 붙이기 쉽다.

## API And Query Changes

- post list/detail API는 `content_kind` 필터를 지원해야 한다.
- admin create/update API는 프로젝트 전용 payload를 받을 수 있어야 한다.
- project detail 조회는 post + project profile + optional series context를 함께 반환해야 한다.
- `/blog` 관련 쿼리는 `content_kind=blog`를 기본값으로 가져야 한다.
- `/projects` 관련 쿼리는 `content_kind=project`를 기본값으로 가져야 한다.

## Error Handling

- project profile이 없는 `project` post는 publish 불가로 막는다.
- `detail_media_kind=youtube`인데 유튜브 URL이 없으면 validation error를 반환한다.
- `detail_media_kind=image`인데 상세 이미지가 없으면 validation error를 반환한다.
- 잘못된 `:::youtube` 문법은 일반 paragraph가 아니라 명확한 fallback box나 무시 규칙으로 처리한다.

## Testing

### API

- `project` post 생성/수정/조회
- `/blog`에서 project가 노출되지 않음
- `/projects`에서 blog가 노출되지 않음
- project detail 조회 시 profile 메타와 series posts 반환
- series 1개 연결 검증

### Web

- `/projects` 목록 카드에 기간/제목/요약/태그 유지
- `/projects/[slug]` 상세 상단/미디어/주요 항목/링크 박스 유지
- project detail에서 related posts 섹션 노출
- writer에서 `project` 모드 전용 필드 노출
- `:::youtube`가 embed로 렌더됨

## Migration Strategy

- 기존 정적 `projects.ts` 데이터는 초기 migration seed나 수동 이관 기준으로만 사용한다.
- 공개 렌더가 DB 기반으로 전환되면 정적 `projects.ts`는 제거 대상이다.
- 초기에 project가 하나도 없을 때 `/projects`는 empty state를 유지한다.
