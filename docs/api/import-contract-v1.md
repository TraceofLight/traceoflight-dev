# Import Contract V1

## Goal

Keep the current import surface small and explicit:

1. Download a full DB-backed posts backup ZIP.
2. Restore that ZIP through admin-only routes.

This document reflects the code that exists today. It does not describe any external-source snapshot creation, snapshot jobs, or job-history APIs.

## Authentication

- All import and backup endpoints are internal/admin only.
- Backend requires `x-internal-api-secret: <INTERNAL_API_SECRET>`.
- Astro internal routes remain cookie-protected and forward trusted requests to the backend.

## Backup ZIP Bundle

Backup entries normalize into a shared bundle shape during restore:

```json
{
  "external_post_id": "backup-variant-and-visit",
  "external_slug": "variant-and-visit",
  "source_url": "/blog/variant-and-visit",
  "slug": "variant-and-visit",
  "title": "std::variant & std::visit",
  "excerpt": "c++17...",
  "body_markdown": "# ...",
  "cover_image_url": "/media/image/cover.png",
  "status": "published",
  "visibility": "public",
  "published_at": "2025-07-28T14:13:37.454Z",
  "tags": ["til"],
  "series_title": "C++ TIL",
  "order_key": "2025-07-28T14:13:37.454Z"
}
```

## Backup ZIP Contract

Layout:

```text
manifest.json
media-manifest.json
series_overrides.json
posts/<slug>/meta.json
posts/<slug>/content.md
media/<object-key>
```

Rules:

- `manifest.json.schema_version` must equal `backup-v1`.
- Every `media-manifest.json` entry must include `object_key` and `mime_type`.
- Every media manifest entry must have a matching binary at `media/<object-key>`.
- Restore treats the ZIP as a full replacement, not a merge.

## Backend Endpoints (`/api/v1/imports`)

### `GET /backups/posts.zip`

Download a full DB-backed posts backup ZIP.

Success: `200 OK` with `application/zip`

Errors:

- `401` unauthorized
- `400` validation/storage failure

### `POST /backups/load`

Restore a posts backup ZIP.

Request:

- `multipart/form-data`
- field `file`

Success: `200 OK`

```json
{
  "restored_posts": 2,
  "restored_media": 3,
  "restored_series_overrides": 1
}
```

Errors:

- `400` invalid archive or restore validation failure
- `401` unauthorized

## Astro Internal Routes

Current proxy routes:

- `GET /internal-api/imports/backups/posts.zip`
- `POST /internal-api/imports/backups/load`

Shared proxy helpers live in `apps/web/src/lib/server/imports-proxy.ts`.

## Current Module Boundaries

API-side imports code is split into:

- `app.services.imports.models`
- `app.services.imports.media_refs`
- `app.services.imports.backup_archive`
- `app.services.imports.backup_restore`

`ImportService` is now a backup-only orchestration entrypoint for ZIP build and restore.
