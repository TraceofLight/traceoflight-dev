# Series Feature Architecture (Post-Driven Async Cache)

## Goal

시리즈를 수동 편집 대상이 아니라 **게시글 메타데이터에서 자동 파생되는 읽기 캐시**로 운영한다.

- 게시글 저장 시 시리즈 입력값(`posts.series_title`)만 기록한다.
- 백엔드는 변경 이벤트를 받아 비동기로 전체 게시글을 재검토한다.
- 재검토 완료 후 `series`/`series_posts` 캐시를 트랜잭션으로 교체(swap)하고, 이후 API는 해당 캐시를 제공한다.

## Source Of Truth And Cache

### Source of truth

- `posts.series_title` (nullable)
- writer publish 설정에서 입력한 시리즈명 그대로 저장

### Derived cache

- `series` (slug/title/description/cover)
- `series_posts` (series ↔ post order mapping)
- `post.series_context`는 `series`/`series_posts`를 읽어 계산

## Rebuild Flow

1. 게시글 create/update/delete 발생
2. 서비스 레이어에서 시리즈 관련 변경 여부를 확인
3. 변경이면 `series projection refresh` 요청을 큐잉
4. 백그라운드 루프가 debounce 후 전체 posts를 재검토
5. 메모리에서 next projection 생성
6. 단일 DB 트랜잭션으로 `series_posts` 재작성 + `series` upsert/delete
7. commit 시점에 새 캐시가 한 번에 노출됨

핵심 포인트:

- 이벤트는 coalesce(합치기)되어 연속 저장 폭주 시에도 루프 1회로 수렴
- empty series는 재빌드 결과에서 제외되어 자동 정리
- 재빌드 실패 시 기존 캐시는 유지되고 다음 이벤트에서 재시도

## Ordering Rule

- 시리즈 내부 순서: `published_at` 우선, 없으면 `created_at`, 이후 `slug` 보조 정렬
- 수동 reorder API 값은 장기 source-of-truth가 아니며, post 기반 재빌드에서 덮어쓴다

## API Behavior

- `/api/v1/web-service/series`, `/api/v1/web-service/series/{slug}`: 캐시 테이블 기반 조회
- `/api/v1/web-service/posts*`: `series_context`를 캐시 매핑으로 계산
- writer는 게시글 저장 payload에 `series_title`만 전달

## Operational Notes

- 앱 시작 시 시리즈 projection 루프가 즉시 1회 bootstrap rebuild 수행
- debounce 간격은 `SERIES_PROJECTION_REBUILD_DEBOUNCE_SECONDS`로 조정
- 다중 worker 환경에서는 별도 분산 락/리더 선출이 필요하며, 현재는 단일 API 프로세스 기준
