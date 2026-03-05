# Series Implementation Plan (Post-Driven Async Cache)

## Objective

게시글 변경을 기준으로 시리즈 캐시를 비동기 재생성하고, 완료 시점에 읽기 캐시를 스왑하는 방식으로 시리즈 기능을 운영한다.

## Scope

- Backend
  - `posts.series_title` 추가
  - post 변경 감지 후 refresh enqueue
  - background loop에서 debounce + full scan + transactional swap
  - series empty 자동 제거
- Frontend (writer)
  - publish payload에 `series_title` 포함
  - 출간 후 별도 series CRUD 호출 제거
- Docs
  - architecture/contract를 post-driven 모델로 정렬

## Execution Steps

1. DB & Schema
   - `posts.series_title` 컬럼/인덱스 추가
   - `PostCreate`/`PostRead`에 `series_title` 반영
2. Rebuild Engine
   - 전체 posts 스캔으로 next series projection 생성
   - `series_posts` 재작성 + `series` upsert/delete를 단일 트랜잭션으로 커밋
3. Async Scheduler
   - 앱 시작 시 루프 기동 및 bootstrap rebuild
   - post 변경 이벤트를 debounce 후 coalesced rebuild로 처리
4. Post Change Trigger
   - create: `series_title` 존재 시 refresh 요청
   - update: `series_title` 또는 시리즈 내 순서 영향(`published_at`) 변경 시 요청
   - delete: 시리즈 소속 글 삭제 시 요청
5. Writer Integration
   - submit payload에 `series_title` 포함
   - 기존 `syncPostSeriesAssignment` 흐름 제거

## Validation Checklist

- 글 저장/수정/삭제 후 series 목록이 eventual consistency로 갱신된다.
- 시리즈가 비면 자동으로 목록에서 제거된다.
- post detail `series_context`가 캐시 갱신 이후 정확히 반영된다.
- writer 출간 시 series API 직접 호출 없이 동작한다.
