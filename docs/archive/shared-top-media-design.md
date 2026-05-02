# Shared Top Media Design

**Date:** 2026-03-12

## Goal

Unify `썸네일` and `상단 미디어` handling across blog posts and project posts, keep the writer preview aligned with the editor layout, and remove the remaining legacy top-section terminology from implementation-facing code.

## Current Problems

- `썸네일` and project-only `상단 미디어` are split across different models and different writer surfaces.
- Blog posts can only use `cover_image_url`, while projects have separate project-profile media fields.
- The writer preview currently wastes space because it lacks a shared `상단 미디어` preview block.
- The preview metadata block still carries list-style density and fields that do not need to appear during editing.
- Internal code still uses legacy top-section terminology even though the product language uses `상단 미디어`.

## Recommended Approach

### 1. Split thumbnail and top media for all posts

Keep two distinct concepts for all content kinds:

- `썸네일`
  - card/list/OG image
  - stored as `cover_image_url`
- `상단 미디어`
  - detail-page top media
  - shared post-level fields:
    - `top_media_kind`
    - `top_media_image_url`
    - `top_media_youtube_url`
    - `top_media_video_url`

`상단 미디어` supports:

- `image`
- `youtube`
- `video`

### 2. Move top-media controls into publish settings

The publish modal becomes the place for publication-facing media settings:

- slug
- 요약
- 태그
- 썸네일
- 상단 미디어

The persistent metadata panel remains for:

- 콘텐츠 타입
- 공개 범위
- 시리즈
- project-specific text fields
  - 작업 기간
  - 역할 요약
  - 프로젝트 소개
  - 주요 항목
  - 관련 링크

This avoids a project-only media exception and keeps the modal consistent between blog and project writing.

### 3. Render shared top media in preview and detail pages

Writer preview order:

- 제목
- 메타 프리뷰
- 상단 미디어 프리뷰
- 본문 프리뷰

Public detail pages:

- blog detail reads shared `상단 미디어`
- project detail reads shared `상단 미디어`
- project-specific intro/highlights/links remain in project profile

### 4. Remove legacy top-section naming from code-facing surfaces

Rename UI effect constants and local variable names that still use legacy top-section wording:

- `PUBLIC_HERO_*` -> `PUBLIC_TOP_MEDIA_*`
- `legacy top-section shell variable` -> `topMediaShellClass`
- `legacy top-section copy-panel variable` -> `topMediaCopyPanelClass`

This is an internal naming cleanup only. No runtime behavior changes are required for the home page.

## Data Model Changes

### Shared Post Fields

Add to `posts`:

- `top_media_kind`
- `top_media_image_url`
- `top_media_youtube_url`
- `top_media_video_url`

### Project Profile Cleanup

Keep project-specific fields only:

- `period_label`
- `role_summary`
- `project_intro`
- `card_image_url`
- `highlights_json`
- `resource_links_json`

Remove project-only top-media fields from `project_profiles`:

- `detail_media_kind`
- `detail_image_url`
- `youtube_url`
- `detail_video_url`

## Writer UX

- `요약` and `태그` do not need preview cards.
- The preview metadata area should keep persistent boxes for the remaining fields so the layout stays aligned even when values are empty.
- The publish modal handles both image uploads and uploaded video selection for `상단 미디어`.
- Existing cover upload remains image-only because it is a thumbnail field, not the shared top-media field.

## Migration Notes

The previous project-only media migration already exists as `0007`.
The new migration should:

- add shared post-level top-media columns
- backfill project top-media values from existing `project_profiles`
- remove project-only top-media columns after data copy

This keeps existing published project detail pages intact after deployment.

## Testing Strategy

- backend schema tests for new shared post-level top-media fields
- repository/API tests ensuring project updates use shared top-media instead of project-profile media fields
- writer source tests for publish modal fields and preview structure
- project/blog detail page tests for shared top-media rendering
- home page tests for renamed top-media effect constants
