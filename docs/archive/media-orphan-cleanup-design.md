# Media Orphan Cleanup Design

## Goal

Clean up dangling media assets that were uploaded during writing flows but never ended up being referenced by any saved post, project profile, or series. The cleanup should protect recent uploads, reuse the existing draft cleanup schedule, and remove both database records and object storage payloads.

## Recommended Approach

Use a reference-scan cleanup that runs in the same daily time window as draft cleanup and applies the same default retention period of 7 days.

This approach is preferred over temporary-prefix uploads or `owner_post_id`-only cleanup because:

- it can delete already-existing orphaned media, not just future uploads
- it matches the current write flow where upload happens before a post is definitively saved
- it reuses the same scheduling model already in production for draft cleanup

## Reference Model

An uploaded media object is considered referenced if its internal `/media/...` object key is found in any of these places:

- `posts.cover_image_url`
- `posts.top_media_image_url`
- `posts.top_media_video_url`
- `posts.body_markdown`
- `project_profiles.card_image_url`
- `series.cover_image_url`

YouTube URLs are not object-storage-backed and are excluded.

## Cleanup Rule

An uploaded media asset is considered an orphan candidate when:

- its `object_key` is not in the active reference set, and
- its `updated_at` is older than `MEDIA_ORPHAN_RETENTION_DAYS`, default `7`

Cleanup should:

1. remove the object from storage if it exists
2. remove the `media_assets` row
3. tolerate partially missing state
   - DB row exists but object is gone
   - object exists but DB row is selected for deletion

## Scheduling

Reuse the existing `run_draft_cleanup_loop()` scheduler window:

- `DRAFT_CLEANUP_START_HOUR`
- `DRAFT_CLEANUP_END_HOUR`

The draft cleanup loop should run two maintenance actions in order:

1. purge expired drafts
2. purge expired orphan media

This keeps all low-priority destructive maintenance work inside the same off-hours window.

## Configuration

Add:

- `MEDIA_ORPHAN_RETENTION_DAYS=7`

The default should align with `DRAFT_RETENTION_DAYS`.

## Scope

In scope:

- API service to compute referenced object keys
- orphan media purge service
- scheduler integration
- tests for current and legacy edge cases

Out of scope:

- changing upload flow to a temp-prefix design
- exposing manual cleanup APIs
- using `owner_post_id` as the primary correctness source

## Testing

Add tests to prove:

- referenced media is preserved
- unreferenced media newer than 7 days is preserved
- unreferenced media older than 7 days is deleted
- media referenced from markdown, post top media, project card image, and series cover are all preserved
- missing-storage objects still have orphan DB rows cleaned up
