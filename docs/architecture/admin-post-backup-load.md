# Admin Post Backup Save/Load Architecture

## Goal

Replace the one-time Velog migration flow with an admin-only backup workflow:

1. Save current DB-backed posts into a downloadable ZIP.
2. Load a previously downloaded ZIP and rebuild the post dataset from it.

The backup artifact must be self-contained, including post markdown, post metadata, referenced media binaries, and series cover overrides.

## Scope

In scope:
- Export all post rows from DB.
- Export cover image and markdown-referenced internal media binaries.
- Export series cover overrides keyed by `series_title`.
- Download backup ZIP through admin UI.
- Upload backup ZIP through admin UI.
- On load, clear current post dataset and restore from ZIP.
- Rebuild series projection after restore and reapply series cover overrides.

Out of scope:
- Tag-only backup outside post scope.
- Draft-only selective restore.
- Partial merge/import.
- Series entity backup as a first-class dataset.

## Core Decisions

### 1. Save/Load Replaces Velog Migration

The old Velog crawler-based import UI is removed from the admin modal.
The admin modal exposes two actions instead:
- `DB 저장 ZIP 다운로드`
- `ZIP 불러와 DB 복원`

### 2. Backup ZIP Is Self-Contained

A restore must not depend on Velog or existing object storage contents.
Every media file referenced by exported posts is copied into the ZIP.

### 3. Load Is Full Replacement

`load` is not a merge.
Before restore, current `posts` dataset is cleared.
Restore then recreates rows from the ZIP payload.

### 4. Series Are Rebuilt, Not Stored

Series rows are not backed up as first-class entities.
Posts retain `series_title`.
After restore, the existing series projection rebuild recreates series rows and order.
Series cover overrides are stored separately and reapplied after rebuild.

## ZIP Layout

```text
manifest.json
posts/<slug>/meta.json
posts/<slug>/content.md
media/<media-id>/<filename>
series_overrides.json
```

### `manifest.json`

Contains:
- schema version
- generated timestamp
- total post count
- exported slugs
- media file count

### `posts/<slug>/meta.json`

Contains:
- slug
- title
- excerpt
- status
- visibility
- published_at
- tags
- series_title
- cover_image_url

### `posts/<slug>/content.md`

Markdown body.
Internal media URLs are preserved as this site's `/media/...` paths.
The matching object binaries are copied into the ZIP and restored back to the same object keys on load.

### `media/...`

Raw binary files for:
- cover images used by posts
- internal media referenced inside markdown
- series cover images referenced by `series_overrides.json`

### `series_overrides.json`

Array keyed by `series_title`:
- `series_title`
- `cover_image_url`

## Save Flow

1. Read all posts from DB.
2. Collect referenced internal media object keys from:
   - `cover_image_url`
   - markdown image URLs pointing to this site's internal media path
3. Read each binary from object storage.
4. Preserve internal media URLs and copy matching binaries into the ZIP.
5. Read existing series cover overrides from series rows.
6. Build ZIP and return it as file download.

## Load Flow

1. Validate uploaded ZIP structure.
2. Stage all media binaries from ZIP back into object storage using the saved object keys.
3. Parse post metadata and markdown.
4. Clear current posts dataset.
5. Recreate posts from ZIP order.
6. Trigger series projection rebuild.
7. Apply `series_overrides.json` cover images onto rebuilt series rows.

## Backend API

### Save
- `GET /api/v1/imports/backups/posts.zip`
- Admin/internal-secret only.
- Returns ZIP stream.

### Load
- `POST /api/v1/imports/backups/load`
- Multipart upload with ZIP file.
- Admin/internal-secret only.
- Clears current posts and restores from ZIP.
- Returns restore summary.

## Frontend UI

The footer admin modal switches from Velog snapshot controls to backup controls.

### Admin actions
- Download button: direct file download request.
- Load button: file picker + upload request.
- Feedback text shows post/media counts and restore status.

## Safety Rules

- ZIP validation must reject missing manifest, invalid json, and missing media payloads.
- Restore must fail before destructive clear if ZIP parsing/staging fails.
- Load must only clear posts after ZIP payload is fully validated and media staging is ready.
- Series covers are restored only after series projection rebuild completes.

## Data Compatibility

The current import snapshot schema can be reused for post payload shape where practical, but backup ZIP becomes the primary admin data-transfer format.
Velog-specific identifiers are no longer required in the v2 admin workflow.
