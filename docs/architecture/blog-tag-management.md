# Blog Post Tag Management Architecture

## Goal

Build a tag management system for blog posts that works across FastAPI (`apps/api`) and Astro (`apps/web`), while preserving existing `visibility` behavior (`public` / `private`) and surfacing it in the same admin metadata area as tags.

## Scope

In scope:

- Post-level multi-tag assignment.
- Admin-side tag authoring and selection.
- Public blog filtering by tags.
- API contract and frontend-backend integration checkpoints.
- Reuse of existing visibility controls and visibility display inside admin metadata chips.

Out of scope (v1):

- Nested/hierarchical tags.
- Tag-level ACL or per-tag visibility.
- Full-text search relevance tuning.

## Current Baseline

- Backend posts already support `status` and `visibility`.
- Frontend admin writer already edits `visibility` in publish settings.
- Public blog pages already filter private posts unless admin-authenticated viewer.
- No persistent tag model exists yet in DB, API, or writer payload.

## Domain Model

### Entities

- `tags`
  - `id` UUID PK
  - `slug` unique, lowercase, URL-safe
  - `label` display name
  - `created_at`, `updated_at`
- `post_tags`
  - `post_id` FK -> `posts.id` (cascade delete)
  - `tag_id` FK -> `tags.id` (restrict delete by default)
  - unique (`post_id`, `tag_id`)

### Post Contract Extension

- `PostCreate.tags: list[str]` (tag slugs)
- `PostRead.tags: list[TagRead]` where `TagRead = { slug, label }`

### Visibility + Tags in Admin UI

- Keep `visibility` as a first-class post field (not persisted as a user tag).
- Render visibility in the same metadata chip rail as tags (system chip + user chips).
- This reuses existing private/public semantics while meeting the request to show it in tag-style admin UI.

## Backend API Design

### Existing Posts Endpoints

- `GET /api/v1/posts`
  - add query support:
    - `tag` (repeatable query param, example `?tag=fastapi&tag=astro`)
    - `tag_match=any|all` (default `any`)
  - existing `status`, `visibility`, and internal-secret guard remain unchanged.
- `GET /api/v1/posts/{slug}`
  - include `tags` in response payload.
- `POST /api/v1/posts` and `PUT /api/v1/posts/{slug}`
  - accept `tags` in payload.
  - trusted internal callers can create missing tags on submit (upsert-by-slug) to reduce admin friction.

### New Tag Endpoints (Internal/Admin)

- `GET /api/v1/tags?query=&limit=&offset=`
  - search/list tags for autosuggest and admin management.
- `POST /api/v1/tags`
  - create explicit tag (`slug`, `label`).
- `PATCH /api/v1/tags/{slug}`
  - rename label and optionally slug with conflict checks.
- `DELETE /api/v1/tags/{slug}`
  - default: reject when linked to posts.
  - optional `force=true`: detach links then delete (admin-only).

### Security Rules

- Mutating endpoints require current internal-secret trust path (`x-internal-api-secret`).
- Public readers can only receive published/public posts by existing fallback logic.
- Tag list exposed to public pages must be derived from already-authorized post results.

## Frontend Design

### Admin Writer

- Extend publish settings with:
  - tag input (enter/comma to add chips),
  - remove-chip actions,
  - async autosuggest from `/internal-api/tags`.
- Keep current visibility select.
- Add metadata chip rail:
  - system chip: `visibility: public|private`
  - user chips: post tags.
- Submit payload includes `tags` list together with existing fields.

### Public Blog Pages

- Extend post card data model with `tags`.
- Add tag filter chips to archive controls.
- Support URL query sync (example `?tag=fastapi`) for shareable filtered views.
- Respect current admin visibility behavior; tag filtering composes with visibility filtering.

### Internal API Proxy Layer (`apps/web/src/pages/internal-api`)

- Add `/internal-api/tags` proxy routes to backend tags endpoints.
- Extend posts proxy pass-through to preserve new tag query params.

## Data Flow

1. Admin opens writer -> fetches tag suggestions via internal API.
2. Admin selects/creates tags + chooses visibility.
3. Frontend submits post payload with `tags`.
4. Backend upserts/links tags in transaction and returns post with normalized tags.
5. Blog archive/detail reads posts including tags and applies visibility + tag filters.

## Design and Execution Strategy

### Sequential Design Order

1. Freeze API contract (`tags`, `tag_match`, error payloads).
2. Lock persistence design (`tags`, `post_tags`, constraints/indexes).
3. Lock backend behavior rules (auth, filtering, mutation semantics).
4. Lock frontend consumption contract (writer payload, blog filters, proxy rules).
5. Define one integration checkpoint for FE/BE contract verification.

### Parallel Implementation Rule

- After step 1 (contract freeze), backend and frontend implementation may proceed in parallel.
- The integration checkpoint is part of the same implementation flow, not a separate planning session.
- Final merge requires both stacks to pass contract and regression tests together.

## Testing Strategy

Backend:

- API tests for tag CRUD and post-tag lifecycle.
- access-guard regression tests (visibility/internal-secret unchanged).
- OpenAPI contract checks for new `tags` endpoints and post schemas.

Frontend:

- writer script/page tests for tag input and submit payload.
- archive UI tests for tag filters.
- internal API route tests for tags and tag query pass-through.

Integration:

- end-to-end admin create/edit with tags.
- public archive filter by tag.
- private+tag combinations for admin viewer only.

## Risks and Mitigations

- Risk: FE/BE contract drift during parallel work.
  - Mitigation: lock request/response examples in one contract fixture and run integration checkpoint before merge.
- Risk: tag slug collisions and renames.
  - Mitigation: strict normalization + unique constraints + conflict tests.
- Risk: slow list queries with tag joins.
  - Mitigation: indexes on `tags.slug`, `post_tags(post_id, tag_id)`, and optional pagination defaults.
