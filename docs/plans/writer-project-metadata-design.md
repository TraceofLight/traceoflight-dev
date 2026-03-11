# Writer Project Metadata Design

**Date:** 2026-03-11

## Goal

Keep the existing blog publish modal compact while making project-specific metadata easier to edit, add support for uploaded hero videos on project detail pages, and separate project intro copy from the generic post excerpt.

## Current Problem

- The publish modal now contains generic publish data and all project metadata, so it has become too tall and dense.
- Project detail hero media supports only `image` or `youtube`.
- The writer already supports body video uploads, but there is no dedicated flow for uploading a project hero video.
- Upload progress/feedback currently uses the same toast area, but the placement should be a consistent upper-right notification.
- `excerpt` is currently being reused as the project intro card copy, even though it should stay a short top-level summary for cards, SEO, and project header detail.

## Recommended Approach

### 1. Split generic publish data from editable metadata

Keep the existing publish modal for the original blog-era fields only:

- slug
- excerpt
- cover preview / cover image URL
- final publish confirmation

Move these out of the publish modal and into a persistent metadata side panel inside the writer shell:

- content kind
- visibility
- series
- tags
- all project-only fields

This keeps the modal close to its original size while making frequently edited metadata visible without opening a modal.

### 2. Add uploaded hero video as a third project detail media mode

Extend project detail media from:

- `image`
- `youtube`

to:

- `image`
- `youtube`
- `video`

For `video`, the writer will expose:

- an upload button
- a hidden/stored URL field
- an inline preview player in the metadata panel

The project detail page will render:

- `<img>` for `image`
- `<iframe>` for `youtube`
- `<video controls>` for `video`

### 3. Separate excerpt from the project intro block

Keep `excerpt` as the generic post summary:

- project card summary
- SEO/meta description
- short detail summary near the top header

Add a dedicated project-only field:

- `project_intro`

That field will power the left-side `프로젝트 소개` card below the hero media. This avoids giving one field two unrelated jobs.

### 4. Keep body media uploads unchanged, but unify feedback

Body uploads already support video and generate `<video controls src="..."></video>`.
That behavior remains unchanged.

All upload flows should reuse the same feedback mechanism:

- body media upload
- cover image upload
- project hero video upload

The writer toast should be repositioned to the upper-right so upload state is visible regardless of editor scroll.

## Data Changes

Backend project profile needs one additional persisted field:

- `detail_video_url`
- `project_intro`

`detail_media_kind` enum expands to include:

- `video`

The existing `detail_image_url` and `youtube_url` fields remain.

## UI Changes

### Writer

- add a metadata side panel alongside the editor/preview shell
- move generic metadata controls out of the publish modal
- keep publish modal focused on slug, excerpt, cover, confirm
- show project-only fields only when `content_kind=project`
- show uploaded video controls only when `detail_media_kind=video`

### Project Detail

- render uploaded hero video for `detail_media_kind=video`
- render `excerpt` back in the top detail/header area
- render `project_intro` in the dedicated intro card
- preserve current layout and hierarchy

## Error Handling

- uploaded hero video uses the same upload bundle flow as body uploads
- non-video files must be rejected for the hero video field
- toast messages should clearly distinguish info / success / error
- if a saved project has `detail_media_kind=video` without `detail_video_url`, fall back to image rendering

## Testing Strategy

- writer page/source tests for moved metadata fields and new video upload controls
- writer script/source tests for DOM selectors, upload bindings, and payload changes
- backend schema/repository tests for `detail_media_kind=video`, `detail_video_url`, and `project_intro`
- project detail page tests for `<video>` rendering branch
- build verification for the Astro app
