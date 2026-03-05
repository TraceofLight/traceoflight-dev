# Series API Contract v1

## Base

- Backend base: `/api/v1`
- Frontend proxy base: `/internal-api`
- Auth header for privileged actions: `x-internal-api-secret`

## Series Source Input (Post Payload)

`POST /api/v1/posts` and `PUT /api/v1/posts/{slug}` accept:

```json
{
  "series_title": "FastAPI Deep Dive"
}
```

Semantics:

- `series_title` is source-of-truth input from writer.
- Backend asynchronously rebuilds series cache after post changes.
- Series read APIs are eventually consistent (after rebuild swap).

## Series Read

### `GET /api/v1/series`

Response `200`:

```json
[
  {
    "id": "uuid",
    "slug": "fastapi-deep-dive",
    "title": "FastAPI Deep Dive",
    "description": "Series summary",
    "cover_image_url": "https://traceoflight.dev/media/image/cover.jpg",
    "post_count": 3,
    "created_at": "2026-03-05T00:00:00Z",
    "updated_at": "2026-03-05T00:00:00Z"
  }
]
```

### `GET /api/v1/series/{slug}`

Response `200`:

```json
{
  "id": "uuid",
  "slug": "fastapi-deep-dive",
  "title": "FastAPI Deep Dive",
  "description": "Series summary",
  "cover_image_url": "https://traceoflight.dev/media/image/cover.jpg",
  "post_count": 3,
  "created_at": "2026-03-05T00:00:00Z",
  "updated_at": "2026-03-05T00:00:00Z",
  "posts": [
    {
      "slug": "fastapi-intro",
      "title": "Intro",
      "excerpt": "summary",
      "cover_image_url": "https://traceoflight.dev/media/image/1.jpg",
      "order_index": 1,
      "published_at": "2026-03-05T00:00:00Z",
      "visibility": "public"
    }
  ]
}
```

Public readers only receive published/public scoped posts.

## Series Write

### `POST /api/v1/series`
### `PUT /api/v1/series/{slug}`

Request body:

```json
{
  "slug": "fastapi-deep-dive",
  "title": "FastAPI Deep Dive",
  "description": "Series summary",
  "cover_image_url": "https://traceoflight.dev/media/image/cover.jpg"
}
```

### `PUT /api/v1/series/{slug}/posts`

Request body:

```json
{
  "post_slugs": ["fastapi-intro", "fastapi-auth", "fastapi-deploy"]
}
```

Semantics:

- Ordered list is source-of-truth.
- Duplicates are normalized out.
- `order_index` is 1-based.

### `DELETE /api/v1/series/{slug}`

Response: `204` no body.

## Post `series_context` Projection

`GET /api/v1/posts/{slug}` and list payload may include:

```json
{
  "series_context": {
    "series_slug": "fastapi-deep-dive",
    "series_title": "FastAPI Deep Dive",
    "order_index": 2,
    "total_posts": 3,
    "prev_post_slug": "fastapi-intro",
    "prev_post_title": "Intro",
    "next_post_slug": "fastapi-deploy",
    "next_post_title": "Deploy"
  }
}
```

## Error Contract

- `400`: validation errors (invalid payload or unknown post slug)
- `401`: unauthorized (missing/invalid internal secret)
- `404`: resource not found
- `409`: conflict (duplicate slug, post assignment conflict, order_index conflict)
- `503`: backend unavailable (frontend proxy layer)
