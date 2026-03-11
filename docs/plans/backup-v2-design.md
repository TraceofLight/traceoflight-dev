# Backup V2 Design

**Date:** 2026-03-12

## Goal

앱 내 ZIP 백업/복원이 현재 `posts`와 `project_profiles`의 최신 구조를 보존하도록 확장한다.

## Problem

기존 ZIP 백업은 `backup-v1` 포맷으로 작성되고 있으며, 다음 필드를 저장/복원하지 못한다.

- `posts.content_kind`
- `posts.top_media_kind`
- `posts.top_media_image_url`
- `posts.top_media_youtube_url`
- `posts.top_media_video_url`
- `project_profiles.period_label`
- `project_profiles.role_summary`
- `project_profiles.project_intro`
- `project_profiles.card_image_url`
- `project_profiles.highlights_json`
- `project_profiles.resource_links_json`

즉 `/admin/imports`의 ZIP 백업은 더 이상 현재 writer/project 구조를 온전히 보존하지 못한다.

## Recommended Approach

- 새로 생성하는 백업 ZIP은 `backup-v2` 스키마를 사용한다.
- `posts/{slug}/meta.json`에 post 공통 필드와 `project_profile` 객체를 함께 저장한다.
- restore는 `backup-v1`과 `backup-v2`를 모두 읽는다.
- media manifest는 기존 구조를 유지하되, `top_media_image_url`, `top_media_video_url`, `project_profile.card_image_url`가 내부 media object를 가리키면 함께 포함한다.

## Data Shape

`meta.json`의 핵심 확장:

- `content_kind`
- `top_media_kind`
- `top_media_image_url`
- `top_media_youtube_url`
- `top_media_video_url`
- `project_profile`
  - `period_label`
  - `role_summary`
  - `project_intro`
  - `card_image_url`
  - `highlights`
  - `resource_links`

## Compatibility

- `backup-v1` restore는 계속 지원한다.
- `backup-v1`에는 새 필드가 없으므로 기본값으로 복원한다.
  - `content_kind = blog`
  - `top_media_kind = image`
  - 나머지 상단 미디어 필드 없음
  - `project_profile = None`

## Testing

- ZIP roundtrip 테스트에서 `backup-v2` 메타가 보존되는지 확인
- restore 테스트에서 project post와 project profile이 실제 DB 모델로 복원되는지 확인
- imports API smoke 테스트로 ZIP 엔드포인트 회귀 확인
