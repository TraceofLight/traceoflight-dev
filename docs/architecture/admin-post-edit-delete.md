# Admin Post Edit/Delete Architecture

## Goal

Allow logged-in admins to edit or delete a post directly from the post detail page, without introducing a separate admin post list page.

## Scope

In scope:

- Admin-only controls on `/blog/{slug}` detail page.
- Edit flow via `/admin/posts/{slug}/edit`.
- Delete flow with confirmation modal.
- FE/BE contract alignment for update/delete.
- Regression coverage for admin-only behavior.

Out of scope (v1):

- Soft delete / recycle bin.
- Revision history.
- Bulk edit/delete.

## Current Baseline

- Backend already exposes:
  - `PUT /api/v1/posts/{slug}`
  - `DELETE /api/v1/posts/{slug}`
  - internal header auth (`x-internal-api-secret`) for write/delete.
- Frontend already has:
  - writer create page: `/admin/posts/new`
  - internal proxy:
    - `GET|POST /internal-api/posts`
    - `GET|PUT|DELETE /internal-api/posts/{slug}`
- Gap:
  - Post detail page has no admin action controls.
  - Edit route for existing post is missing.

## Architecture Decisions

### 1) Keep Existing Backend Write/Delete Contract

- Reuse current backend endpoints for update/delete.
- No new backend endpoint added.

### 2) Put Admin Actions on Post Detail Page

- On `/blog/{slug}`, show admin actions only when:
  - session is admin-authenticated, and
  - content provider is DB-backed post.
- Controls:
  - `수정` -> `/admin/posts/{slug}/edit`
  - `삭제` -> confirmation modal -> `DELETE /internal-api/posts/{slug}`

### 3) Reuse Existing Writer in Edit Mode

- Keep `/admin/posts/new` as create mode.
- Add `/admin/posts/{slug}/edit` route.
- Writer mode rules:
  - create mode -> `POST /internal-api/posts`
  - edit mode -> prefill by slug + submit `PUT /internal-api/posts/{originalSlug}`

### 4) Delete Safety and UX

- Delete must require explicit confirmation modal.
- While deleting:
  - disable action buttons,
  - prevent double-submit.
- Response handling:
  - `204`: success -> redirect `/blog`.
  - `404`: already deleted -> treat as success and redirect `/blog`.
  - `401`: show re-login guidance.
  - `503`: show retry message.

## Contract and Data Shape

### Edit

- Load: `GET /internal-api/posts/{slug}`
- Save: `PUT /internal-api/posts/{slug}` (path slug is original slug)
- Payload remains existing `PostCreate`.

### Delete

- Delete: `DELETE /internal-api/posts/{slug}`
- No response body required for `204`.

## Security Model

- Astro middleware keeps `/admin*` and `/internal-api*` protected.
- Browser never calls FastAPI directly.
- Internal proxy injects shared secret via `requestBackend()`.

## Error Handling

- Edit load `404`: show not-found state + back to blog.
- Edit save `409`: inline slug conflict guidance.
- Delete `401`: session expired message and login path.
- Delete `404`: treat as already deleted and continue redirect.
- Backend unavailable: non-blocking error feedback + retry CTA.

## Testing Strategy

Frontend:

- Post detail page test for conditional admin controls.
- Delete modal open/confirm/cancel behavior test.
- Edit route bootstrap test for writer edit mode.
- Submit mode test: `PUT` path uses original slug.

Backend:

- Regression tests for update/delete:
  - unauthorized -> `401`
  - slug conflict -> `409`
  - missing post delete -> `404`

Integration:

- Create -> open detail -> edit -> delete lifecycle smoke path.
