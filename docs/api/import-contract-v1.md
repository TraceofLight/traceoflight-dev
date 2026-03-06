# Import Contract V1

## Goal

Define a two-stage migration contract:

1. Build and persist a reusable snapshot package.
2. Execute import jobs from that snapshot with `dry_run` or `apply`.

This contract explicitly avoids repeated crawling for retries or rebuilds.

## Scope

In scope:

- Snapshot APIs (create, inspect, list items, download).
- Import APIs (run from snapshot, inspect job, list job items).
- Shared content package contract (`PostBundle` + ZIP manifest).
- Status and error payload rules.

Out of scope:

- Continuous sync.
- Engagement/comment migration.
- Source-side delete sync.

## Authentication

- All import and snapshot endpoints are internal/admin only.
- Backend requires trusted internal header:
  - `x-internal-api-secret: <INTERNAL_API_SECRET>`
- Astro internal API routes remain admin-protected and forward trusted calls.

## Enums

### SourceProvider

- `velog`
- `zip`

### ImportMode

- `dry_run`
- `apply`

### SnapshotStatus

- `queued`
- `collecting`
- `packaging`
- `ready`
- `failed`

### ImportJobStatus

- `queued`
- `running`
- `succeeded`
- `partially_failed`
- `failed`

### ImportItemStatus

- `pending`
- `succeeded`
- `failed`
- `skipped`

## Canonical Bundle (`PostBundle`)

Every snapshot item must normalize to this shape before import apply:

```json
{
  "source_provider": "velog",
  "external_post_id": "63acec33-247e-458e-a97b-a03c17d870c4",
  "external_slug": "variant-and-visit",
  "source_url": "https://velog.io/@traceoflight/variant-and-visit",
  "slug": "variant-and-visit",
  "title": "std::variant & std::visit",
  "excerpt": "c++17...",
  "body_markdown": "# ...",
  "cover_image_url": "https://velog.velcdn.com/.../image.png",
  "status": "published",
  "visibility": "public",
  "published_at": "2025-07-28T14:13:37.454Z",
  "tags": ["til"],
  "series_title": "C++ TIL",
  "order_key": "2025-07-28T14:13:37.454Z"
}
```

Required:

- `external_post_id`
- `title`
- `body_markdown`
- `status`
- `visibility`
- `order_key`

## Normalization Rules

### Velog to Bundle

- `external_post_id` <- `id`
- `external_slug` <- `url_slug`
- `source_url` <- `https://velog.io/@{username}/{url_slug}`
- `slug` <- normalized `url_slug`, fallback deterministic title slug
- `title` <- `title`
- `excerpt` <- `short_description`
- `body_markdown` <- `body`
- `cover_image_url` <- `thumbnail`
- `visibility` <- `is_private ? "private" : "public"`
- `status` <- `is_temp ? "draft" : "published"`
- `published_at` <- `released_at` when published, else `null`
- `tags` <- normalized and deduplicated `tags[]`
- `series_title` <- `series.name`, preserve source case as-is
- `order_key` <- `published_at` if present, else fallback source updated time

### ZIP to Bundle

- ZIP parser must emit the same bundle shape and enforce identical validation.

## Idempotent Apply Rules

Source mapping key:

- unique `(source_provider, external_post_id)` in `post_source_mappings`.

Apply behavior:

1. Resolve mapping by source key.
2. If mapped post exists, update mapped post.
3. If no mapping exists:
   - create post with desired slug,
   - resolve collision deterministically,
   - create mapping.

Collision fallback sequence:

- `slug`
- `slug-<short_external_id>`
- indexed deterministic suffix if still occupied.

## Media Internalization Rules

For `apply`:

1. Parse markdown and cover image URL references.
2. Validate remote URL scheme and limits.
3. Download and verify media.
4. Upload to internal storage.
5. Register `media_assets`.
6. Rewrite markdown and cover URLs to internal addresses.

For `dry_run`:

- Validate references and fetchability checks.
- Do not write `posts`, `media_assets`, or `post_source_mappings`.
- Persist only snapshot/job reporting records.

## Snapshot APIs (`/api/v1`)

### POST `/imports/snapshots/velog`

Create snapshot by crawling Velog once.

Request:

```json
{
  "username": "traceoflight"
}
```

Success `202 Accepted`:

```json
{
  "snapshot_id": "1a8a79ac-dc7c-4109-b0c5-4cc10c2f80b6",
  "source_provider": "velog",
  "source_identity": "traceoflight",
  "status": "queued",
  "total_items": 0,
  "artifact_object_key": null,
  "artifact_checksum": null,
  "created_at": "2026-03-06T00:00:00Z",
  "updated_at": "2026-03-06T00:00:00Z"
}
```

Errors:

- `400` invalid payload
- `401` unauthorized
- `409` active snapshot build conflict for same source (optional)
- `503` source unavailable

### POST `/imports/snapshots/zip`

Register snapshot by uploaded ZIP package.

Request:

- `multipart/form-data`
- field `file`: zip archive
- optional field `source_identity`

Success `202 Accepted`: snapshot summary shape as above, `source_provider: "zip"`.

Errors:

- `400` invalid multipart payload
- `401` unauthorized
- `413` package too large
- `422` invalid zip schema

### GET `/imports/snapshots/{snapshot_id}`

Get snapshot summary.

Success `200 OK`:

```json
{
  "snapshot_id": "1a8a79ac-dc7c-4109-b0c5-4cc10c2f80b6",
  "source_provider": "velog",
  "source_identity": "traceoflight",
  "status": "ready",
  "total_items": 42,
  "artifact_object_key": "imports/snapshots/1a8a79ac-dc7c-4109-b0c5-4cc10c2f80b6.zip",
  "artifact_checksum": "sha256:...",
  "created_at": "2026-03-06T00:00:00Z",
  "updated_at": "2026-03-06T00:05:31Z",
  "error_summary": null
}
```

Errors:

- `401` unauthorized
- `404` snapshot not found

### GET `/imports/snapshots/{snapshot_id}/items`

Get paged snapshot item metadata.

Query:

- `limit` default `50`, max `200`
- `offset` default `0`

Success `200 OK`:

```json
{
  "items": [
    {
      "id": "a8c4c969-7258-4e8d-9502-c4a55f9ce2bd",
      "snapshot_id": "1a8a79ac-dc7c-4109-b0c5-4cc10c2f80b6",
      "order_index": 1,
      "external_post_id": "e786b53a-9abf-4971-84f2-86e951c4edcc",
      "external_slug": "IaaS-PaaS-SaaS",
      "title": "IaaS, PaaS, SaaS",
      "status": "ready",
      "error_detail": null
    }
  ],
  "limit": 50,
  "offset": 0,
  "total": 42
}
```

Errors:

- `401` unauthorized
- `404` snapshot not found

### GET `/imports/snapshots/{snapshot_id}/download`

Get downloadable snapshot artifact (signed URL or proxied stream).

Success:

- `200` stream response, or
- `302` redirect to signed URL.

Errors:

- `401` unauthorized
- `404` snapshot not found or artifact missing

## Import APIs (`/api/v1`)

### POST `/imports/snapshots/{snapshot_id}/jobs`

Create import job from existing snapshot.

Request:

```json
{
  "mode": "dry_run"
}
```

Success `202 Accepted`:

```json
{
  "job_id": "0f79d904-88d8-4711-9f04-cc3f4d0e2f95",
  "snapshot_id": "1a8a79ac-dc7c-4109-b0c5-4cc10c2f80b6",
  "mode": "dry_run",
  "status": "queued",
  "total_items": 42,
  "success_items": 0,
  "failed_items": 0,
  "started_at": null,
  "finished_at": null
}
```

Errors:

- `400` invalid mode or snapshot not ready
- `401` unauthorized
- `404` snapshot not found
- `409` conflicting running import job for same snapshot (optional)

### GET `/imports/jobs/{job_id}`

Get one import job summary.

Success `200 OK`:

```json
{
  "job_id": "0f79d904-88d8-4711-9f04-cc3f4d0e2f95",
  "snapshot_id": "1a8a79ac-dc7c-4109-b0c5-4cc10c2f80b6",
  "mode": "apply",
  "status": "partially_failed",
  "total_items": 42,
  "success_items": 40,
  "failed_items": 2,
  "started_at": "2026-03-06T00:10:00Z",
  "finished_at": "2026-03-06T00:15:40Z",
  "error_summary": "2 item(s) failed"
}
```

Errors:

- `401` unauthorized
- `404` job not found

### GET `/imports/jobs/{job_id}/items`

Get paged import item results.

Query:

- `limit` default `50`, max `200`
- `offset` default `0`
- `status` optional `ImportItemStatus`

Success `200 OK`:

```json
{
  "items": [
    {
      "id": "de66f42f-376a-482e-b6c0-684d0380134a",
      "job_id": "0f79d904-88d8-4711-9f04-cc3f4d0e2f95",
      "order_index": 2,
      "external_post_id": "9cc0051b-d714-4db7-8a2b-27f5cdb4fd4c",
      "external_slug": "boj13325",
      "resolved_slug": "boj13325",
      "status": "failed",
      "error_detail": "media download timeout"
    }
  ],
  "limit": 50,
  "offset": 0,
  "total": 42
}
```

Errors:

- `401` unauthorized
- `404` job not found

## Error Payload Contract

Backend standard:

```json
{ "detail": "..." }
```

Astro proxy fallback for backend outage:

```json
{ "message": "backend unavailable" }
```

Frontend must handle both shapes.

## Snapshot ZIP Contract

Snapshot artifact must follow:

```text
manifest.json
posts/<external_post_id>/meta.json
posts/<external_post_id>/content.md
posts/<external_post_id>/media/*
```

### `manifest.json` minimum

```json
{
  "schema_version": "v1",
  "source_provider": "velog",
  "source_identity": "traceoflight",
  "generated_at": "2026-03-06T00:05:00Z",
  "post_ids": ["ext-001", "ext-002"]
}
```

### `meta.json` minimum per post

```json
{
  "external_post_id": "ext-001",
  "external_slug": "example-post",
  "source_url": "https://velog.io/@traceoflight/example-post",
  "slug": "example-post",
  "title": "Example",
  "excerpt": "Summary",
  "status": "published",
  "visibility": "public",
  "published_at": "2025-01-01T00:00:00Z",
  "tags": ["example"],
  "series_title": "Example Series",
  "cover_image_path": "media/cover.png"
}
```

`content.md` is required for each post entry.

## Processing Order Contract

- Import executor sorts bundles by `order_key` ascending.
- Tie breaker is `external_post_id` lexicographic ascending.

## Non-Functional Constraints

- Snapshot and import processing are asynchronous and durable.
- Snapshot stage may hit external services; import stage must not.
- Configurable limits:
  - max snapshot zip size,
  - max media size,
  - per-media timeout and retry budget.

## Acceptance Checklist

- Snapshot can be created once and reused multiple times.
- Import job can run from snapshot with no recrawl.
- `dry_run` writes no post/media/mapping data.
- `apply` rewrites remote media to internal URLs.
- Rerun remains idempotent by source mapping key.
