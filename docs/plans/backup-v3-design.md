# Backup V3 Design

**Date:** 2026-05-05
**Supersedes:** `docs/archive/backup-v2-design.md`

## Goal

운영자 계정을 제외한 사이트 전체 상태를 한 ZIP에 포착하고, 그 시점으로 정확히 되돌리는 backup/restore 시스템을 만든다. 현 `backup-v2`는 locale 시스템·댓글·사이트 프로필 등 v2 작성 이후 추가된 모델을 보존하지 못해 더 이상 "백업"으로서 신뢰할 수 없는 상태다.

## Background

`backup-v2`는 2026-03-12에 작성된 이후 다음이 추가/변경되어 보존 범위 밖에 있다.

- **i18n / 번역 시스템** (마이그레이션 0013–0017): `Post.locale`, `Post.translation_group_id`, `Post.source_post_id`, `Post.translation_status`, `Post.translation_source_kind`, `Post.translated_from_hash` + `Series`의 동일한 6필드.
- **`Series` 1급 시민화**: backup-v2는 시리즈를 포스트의 `series_title` 문자열 + `cover_image_url` 오버라이드로만 보관. `Series.slug`, `Series.description`, `Series.list_order_index`, 번역 6필드, `SeriesPost.order_index` 모두 손실.
- **`PostComment`** (마이그레이션 0010): 전혀 백업되지 않음.
- **`SiteProfile`** (마이그레이션 0012): 전혀 백업되지 않음.
- **`Post.project_order_index`** (마이그레이션 0009): 보존 안 됨.
- **`Tag.label`**: 슬러그만 저장되어 라벨 손실.
- **`MediaAsset.owner_post_id`**: 복원 시 항상 None.

## Non-goals

- **`AdminCredential` 백업/복원** — 보안상 운영자 자격 증명은 ZIP에 포함하지 않는다. 복원 후 운영자 계정은 환경의 기존 값(또는 환경변수 시드)을 그대로 사용한다.
- **MinIO 버킷 통째 백업** — 참조되지 않는 미디어(고아 객체)는 풀백업 대상이 아니다.
- **`backup-v1` / `backup-v2` 호환** — 새 reader는 `backup-v3`만 받는다. 옛 백업 복원이 필요하면 그 시점 코드(이미 `main`에 머지된 backup-v2 reader)로 별도 환경을 띄워 처리한다.
- **운영 중 backup/restore의 머지/upsert 시맨틱** — restore는 destructive(테이블 wipe 후 재생성)다.

## Schema version

ZIP 매니페스트의 `schema_version`은 `"backup-v3"`. v1/v2는 `parse_zip`에서 `ImportValidationError`로 거절한다.

## ZIP layout (hybrid)

콘텐츠는 사람이 ZIP을 풀어 글 단위로 읽기 좋도록 트리 구조, 운영 데이터는 한 테이블 한 파일의 평탄 구조.

```
manifest.json
posts/
  <translation_group_id>/
    <locale>/
      meta.json
      content.md
series/
  <translation_group_id>/
    <locale>.json
db/
  tags.json              # Tag.id, slug, label, created_at, updated_at
  post_tags.json         # post_id ↔ tag_id 링크 (slug 없이 id만)
  series_posts.json      # series_id, post_id, order_index, created_at, updated_at
  post_comments.json     # 모든 컬럼 (자기 참조 root/reply 포함)
  site_profile.json      # 단일 row
  media_assets.json      # 모든 MediaAsset 메타 (owner_post_id 포함)
media/
  <object_key>           # 참조된 미디어의 실제 바이트
```

**파일 명명 규칙**

- `posts/<translation_group_id>/<locale>/meta.json` — `(slug, locale)` UNIQUE 충돌을 피하면서 같은 글의 ko/en/ja/zh를 한 폴더에 묶는다.
- `series/<translation_group_id>/<locale>.json` — 같은 시리즈의 번역들을 한 폴더에 묶는다 (시리즈는 본문이 따로 없으므로 단일 파일).
- `db/*.json` — 운영성 테이블. JSON 객체 배열. 작은 규모(현 운영 기준 수백 row 이내)이므로 JSON Lines 대신 일반 JSON 배열.

## Per-entity JSON shape

### `manifest.json`

```json
{
  "schema_version": "backup-v3",
  "generated_at": "2026-05-05T12:34:56Z",
  "counts": {
    "posts": 42,
    "series": 7,
    "tags": 13,
    "post_tags": 60,
    "series_posts": 18,
    "post_comments": 24,
    "media_assets": 71
  }
}
```

`media_assets`는 ZIP 안의 `db/media_assets.json`의 row 수 = `media/` 아래 바이트 파일 수. v3는 참조된 미디어만 다루므로 두 값이 항상 같아 별도 카운트를 두지 않는다.

### `posts/<translation_group_id>/<locale>/meta.json`

`Post`의 모든 컬럼을 그대로. id는 UUID 그대로 보존(번역 링크/`MediaAsset.owner_post_id`/`PostComment.post_id` 정합성).

```json
{
  "id": "uuid",
  "slug": "...",
  "title": "...",
  "excerpt": "...|null",
  "cover_image_url": "...|null",
  "top_media_kind": "image|youtube|video",
  "top_media_image_url": "...|null",
  "top_media_youtube_url": "...|null",
  "top_media_video_url": "...|null",
  "project_order_index": 0,
  "series_title": "...|null",
  "locale": "ko|en|ja|zh",
  "translation_group_id": "uuid",
  "source_post_id": "uuid|null",
  "translation_status": "source|synced|stale|failed",
  "translation_source_kind": "manual|machine",
  "translated_from_hash": "...|null",
  "content_kind": "blog|project",
  "status": "draft|published|archived",
  "visibility": "public|private",
  "published_at": "iso8601|null",
  "created_at": "iso8601",
  "updated_at": "iso8601",
  "project_profile": {
    "id": "uuid",
    "period_label": "...",
    "role_summary": "...",
    "project_intro": "...|null",
    "card_image_url": "...",
    "highlights": ["..."],
    "resource_links": [{"label": "...", "href": "..."}],
    "created_at": "iso8601",
    "updated_at": "iso8601"
  } | null
}
```

본문은 같은 폴더의 `content.md`에 분리 저장 (diff 친화). 태그 링크는 `db/post_tags.json`이 진실 공급원이므로 meta.json에 중복 적지 않는다.

### `series/<translation_group_id>/<locale>.json`

```json
{
  "id": "uuid",
  "slug": "...",
  "title": "...",
  "description": "...",
  "cover_image_url": "...|null",
  "list_order_index": 0,
  "locale": "ko|en|ja|zh",
  "translation_group_id": "uuid",
  "source_series_id": "uuid|null",
  "translation_status": "source|synced|stale|failed",
  "translation_source_kind": "manual|machine",
  "translated_from_hash": "...|null",
  "created_at": "iso8601",
  "updated_at": "iso8601"
}
```

### `db/tags.json`

```json
[
  {"id": "uuid", "slug": "python", "label": "Python", "created_at": "...", "updated_at": "..."}
]
```

### `db/post_tags.json`

```json
[
  {"post_id": "uuid", "tag_id": "uuid"}
]
```

### `db/series_posts.json`

```json
[
  {"id": "uuid", "series_id": "uuid", "post_id": "uuid", "order_index": 0, "created_at": "...", "updated_at": "..."}
]
```

### `db/post_comments.json`

`PostComment`의 모든 컬럼. `root_comment_id`/`reply_to_comment_id` 자기 참조는 같은 ZIP 안의 `id`를 가리킨다. 복원 시 두 단계 INSERT(루트 먼저, 자식 나중) 또는 deferred FK로 처리.

```json
[
  {
    "id": "uuid",
    "post_id": "uuid",
    "root_comment_id": "uuid|null",
    "reply_to_comment_id": "uuid|null",
    "author_name": "...",
    "author_type": "guest|admin",
    "password_hash": "...|null",
    "visibility": "public|private",
    "status": "active|deleted",
    "body": "...",
    "deleted_at": "iso8601|null",
    "last_edited_at": "iso8601|null",
    "request_ip_hash": "...|null",
    "user_agent_hash": "...|null",
    "created_at": "iso8601",
    "updated_at": "iso8601"
  }
]
```

### `db/site_profile.json`

```json
{"key": "default", "email": "...", "github_url": "...", "created_at": "...", "updated_at": "..."}
```

### `db/media_assets.json`

`MediaAsset`의 메타. 참조된 객체만 v3에서 다루므로 이 배열도 참조된 row만. `owner_post_id` 보존.

```json
[
  {
    "id": "uuid",
    "kind": "image|video|file",
    "bucket": "...",
    "object_key": "...",
    "original_filename": "...",
    "mime_type": "...",
    "size_bytes": 0,
    "width": null,
    "height": null,
    "duration_seconds": null,
    "owner_post_id": "uuid|null",
    "created_at": "...",
    "updated_at": "..."
  }
]
```

### `media/<object_key>`

`object_key`는 파일 경로처럼 슬래시 포함 가능 → ZIP 내부에서 그대로 사용한다 (예: `media/images/2026/03/abc.png`).

## Build flow (`download_posts_backup`)

`apps/api/src/app/services/import_service.py`의 진입점은 유지. 내부적으로 `services/imports/backup/serialize.py`를 호출한다.

1. SQLAlchemy로 `Post`, `Series`, `Tag`, `PostTag`, `SeriesPost`, `PostComment`, `SiteProfile`, `MediaAsset`, `ProjectProfile`을 eager load(`selectinload`).
2. 각 모델을 dict로 직렬화 (UUID → str, datetime → ISO8601 UTC, enum → value).
3. 참조 미디어 키 수집(현 v2와 동일 규칙: post의 cover/top_media/내부 markdown 참조, project profile card, series cover) → `MediaAsset.object_key`로 매칭. 매칭 안 된 키는 fallback manifest entry로 대체(현 v2 동작 유지).
4. `services/imports/backup/archive.py`가 위 dict들을 ZIP의 정해진 경로에 쓴다.

## Restore flow (`load_posts_backup`)

`BackupRestoreCoordinator`는 다음 순서로 동작한다. 모든 DB 변경은 단일 트랜잭션 안에서 일어나고, 미디어는 staging → promote → cleanup 패턴 유지.

**Phase 1: parse + validate**

`archive.py`가 ZIP을 파싱해 `BackupBundle` dataclass로 반환. 다음을 검증해 잘못되면 즉시 `ImportValidationError`:

- 매니페스트 `schema_version == "backup-v3"`.
- 카운트 일치(매니페스트의 `counts`와 실제 row 수).
- 자기 참조 dangling FK 없음 (`PostComment.root_comment_id` / `reply_to_comment_id`가 같은 ZIP 안의 `id`를 가리킴).
- 외부 FK 정합성: 모든 `post_tags.post_id`, `series_posts.post_id` → `posts/` 안의 `id`. 모든 `post_tags.tag_id` → `db/tags.json`의 `id`. 모든 `series_posts.series_id` → `series/` 안의 `id`. `MediaAsset.owner_post_id`(non-null) → posts.
- **시리즈 매핑 검증**: 모든 `posts/.../meta.json`의 `series_title`(non-null)이 `series/` 안의 KO Series 슬러그와 매칭되는지(`_slugify_series_title` 동일 규칙). 매칭 안 되면 거절(데이터 정합성 깨진 백업).

**Phase 2: media staging**

현 v2와 동일. 모든 미디어 바이트를 `imports/backups/staging/<stage_id>/<object_key>`에 PUT, 기존 final-key 객체 바이트를 메모리에 스냅샷.

**Phase 3: DB wipe & rebuild (단일 트랜잭션)**

순서가 중요(FK 의존성):

1. `delete(PostComment)` (post FK)
2. `delete(SeriesPost)` (series·post FK)
3. `delete(PostTag)` (post·tag FK)
4. `delete(ProjectProfile)` (post FK)
5. `delete(Post)` (series_title은 string이라 series 전 삭제 가능, project_profile은 cascade)
6. `delete(Series)`
7. `delete(Tag)`
8. `delete(MediaAsset)`
9. `delete(SiteProfile)` (단일 row, key='default')

INSERT 순서 (SQLAlchemy `autoflush=False` 컨텍스트 안에서):

1. `Tag`
2. `Post` (`ProjectProfile`은 relationship cascade로 같이)
3. `MediaAsset` (`owner_post_id`는 Post가 이미 들어가 있어 FK 만족)
4. `PostTag`
5. `Series`
6. `SeriesPost`
7. `PostComment` — 자기 참조 때문에 두 단계: `root_comment_id`가 NULL이거나 자기 자신을 가리키는 루트 먼저, 그 다음 자식. 백업 안에서 댓글 트리는 깊이 ≤ 2(루트/답글)이므로 두 패스로 충분.
8. `SiteProfile` (`key='default'` 단일 row를 INSERT — phase 3에서 wipe됨, 항상 INSERT).

`AdminCredential`은 wipe·INSERT 어느 단계에서도 손대지 않는다.

**Phase 4: media promote**

staging의 객체를 final object_key로 PUT. 트랜잭션 커밋이 phase 3 끝에 있어 rollback 시 phase 5 롤백 경로 사용.

**Phase 5: rollback path** (예외 시)

- DB는 트랜잭션 자동 rollback.
- 미디어는 phase 2에서 스냅샷한 바이트로 복구(현 v2 `_rollback_promoted_media` 동작 유지).

**Phase 6: post-restore housekeeping**

- `db.expire_all()`
- **`rebuild_series_projection_cache()`는 호출하지 않는다.** 그 함수는 KO `SeriesPost`를 통째로 삭제 후 `posts.series_title`로부터 자동 재생성하기 때문에(`apps/api/src/app/services/series_projection_cache.py:141` 부근), 우리가 막 복원한 explicit `SeriesPost`(고유 UUID 포함)가 갈아치워진다. 또한 `posts.series_title`로 매핑되지 않는 Series 행은 삭제된다(`series_projection_cache.py:174`). v3는 백업 ZIP을 진실 공급원으로 보고 모든 Series/SeriesPost를 명시 보존하므로 재생성이 불필요할 뿐 아니라 해롭다. 백그라운드 projection loop(`run_series_projection_loop`)도 다음 트리거(`request_series_projection_refresh`)까지는 자연히 호출되지 않는다.
- `BackupLoadRead` 응답.

## Module structure (target)

```
apps/api/src/app/services/imports/
  __init__.py              # public API re-export
  errors.py                # 그대로
  media_refs.py            # 그대로
  models.py                # SnapshotBundle은 v2 스키마 의존이라 폐기 또는 재정의
  backup/
    __init__.py            # build_zip, parse_zip, BackupRestoreCoordinator
    schema.py              # BACKUP_SCHEMA_VERSION, 파일 경로 상수
    serialize.py           # SQLAlchemy 모델 → dict
    deserialize.py         # dict → SQLAlchemy 모델 인스턴스
    archive.py             # ZIP 빌드/파싱(파일 경로 라우팅)
    restore.py             # BackupRestoreCoordinator
```

`apps/api/src/app/services/import_service.py`의 `download_posts_backup` / `load_posts_backup` 시그니처는 변경하지 않는다. 라우터(`apps/api/src/app/api/v1/endpoints/imports.py`)도 변경 없음. 프론트엔드 어드민 패널(`apps/web/src/components/public/BackupRestoreSection.tsx`)도 변경 없음.

## Testing

기존 테스트 파일을 업데이트한다. 새 테스트 파일은 만들지 않는다.

- `apps/api/tests/services/test_import_archive_modules.py` — ZIP roundtrip 테스트
  - 모든 v3 테이블이 보존되는지 확인 (post locale 4개, 시리즈 번역, 댓글, site profile 등).
  - `schema_version = backup-v3` 어서트.
  - v1/v2 ZIP을 주면 `ImportValidationError` 어서트.
- `apps/api/tests/services/test_backup_restore.py` — 복원 통합 테스트
  - 위에서 만든 v3 ZIP을 빈 DB·MinIO에 복원했을 때 모든 모델 행과 FK가 복구되는지.
  - 댓글의 root/reply 자기 참조 정상.
  - `MediaAsset.owner_post_id`가 복원되는지.
  - `SiteProfile`이 백업 값으로 갱신되는지(기존 row가 있어도).
  - `AdminCredential` 행은 변경되지 않는지.
- `apps/api/tests/api/test_imports_api.py` — 라우터 스모크
  - 기존 e2e 시나리오를 v3로 업데이트.

## Migration / cutover

- 코드는 한 PR로 머지. backup-v3가 머지된 시점부터 새 ZIP은 v3로 생성된다.
- 기존 운영 데이터에 별도 마이그레이션 필요 없음(스키마 변경 없음, 직렬화 변경만).
- 기존 v2 ZIP 파일을 갖고 있다면 — 본 v3 reader는 거절한다. 옛 ZIP 복원은 (a) 본인이 v2 reader 시점 코드로 일회성 복원하거나 (b) v2 → v3 변환 스크립트를 별도로 작성해 처리. v2→v3 변환 스크립트는 본 plan의 out-of-scope.

## Open considerations

- **`MediaAsset.id` 재발급 vs 보존**: 외부에서 MediaAsset.id를 참조하는 코드는 현재 없는 것으로 확인되었으나, 미래 일관성을 위해 id도 보존(앞 결정 #4 "UUID 그대로 보존" 정책에 자동 부합).
- **댓글의 `request_ip_hash` / `user_agent_hash` 백업 수준**: GDPR/PII 관점에서 이미 hash라 식별불가능하지만, 백업 ZIP 보관 정책에서 별도 취급할지는 운영자 판단. 본 v3는 그대로 보존한다.
