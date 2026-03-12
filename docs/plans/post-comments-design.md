# Post Comments Design

**Date:** 2026-03-13

## Goal

Add post-scoped comments and flat replies to the blog detail page, while keeping moderation manageable through the existing admin console and preserving thread continuity for deleted or private entries.

## Scope

This design covers:

- blog post comment and reply writing
- guest author identity via `name + password`
- admin-authored comments under a fixed site identity
- private comment masking for non-admin viewers
- soft deletion that keeps thread structure intact
- admin comment review inside the existing `/admin/imports` console

This design explicitly does **not** cover:

- visitor counter UI or visitor analytics
- third-party login or social auth
- CAPTCHA or external anti-spam vendors
- fully nested comment trees

## Current Context

The current public detail page is rendered by:

- `apps/web/src/pages/blog/[...slug].astro`
- `apps/web/src/layouts/BlogPost.astro`

The current admin console is rendered by:

- `apps/web/src/pages/admin/imports.astro`
- `apps/web/src/components/public/AdminImportsPanel.tsx`

The backend already follows the shared FastAPI pattern:

- SQLAlchemy models in `apps/api/src/app/models`
- repositories in `apps/api/src/app/repositories`
- services in `apps/api/src/app/services`
- route handlers in `apps/api/src/app/api/v1/endpoints`

This design keeps that separation instead of adding comment logic directly to route handlers or Astro pages.

## Recommended Approach

Use a post-scoped comment system with two viewer modes:

- guest users write with `name + password`
- logged-in admins write as `@TraceofLight` without a password field

Use a flat reply model instead of a recursive tree:

- each thread has one root comment
- replies remain visually one level deep under the root
- a reply can target another reply, but rendering depth never increases
- the UI shows `@targetAuthor` to preserve conversational context

This keeps the product readable on mobile and avoids moderation complexity from deep indentation.

## User-Facing Behavior

### Blog Detail Placement

The comment section lives in the blog detail layout, below the `모든 글 보기` button.

Public page behavior:

- render a write form first
- render root comments below it
- render replies under each root comment as a flat list
- render `답글`, `수정`, `삭제` actions where permitted

### Writing Rules

Guest writer form:

- name
- password
- visibility (`public | private`)
- body

Admin writer form:

- body only
- author name is fixed to `@TraceofLight`
- visibility stays configurable
- no guest password flow is shown

### Visibility Rules

Public comment:

- visible to everyone

Private comment:

- visible in full to admins
- visible as `비공개된 댓글입니다.` to non-admin viewers

Deleted comment:

- visible as `삭제된 댓글입니다.`
- original body is not shown to public viewers
- replies remain attached so thread order does not break
- new replies to deleted comments are **not allowed**

### Sorting Rules

Public blog detail:

- root comments sorted oldest first
- replies sorted oldest first within each thread

Admin console:

- all comments sorted newest first across all posts

## Identity and Authorization Model

### Guest Writer Identity

Guest comments are owned by:

- `author_name`
- `password_hash`

The server must never store the raw password. Use a password hashing algorithm such as Argon2id or bcrypt.

Guest author capabilities:

- create comment
- edit own comment after password verification
- delete own comment after password verification

Guest author limitations:

- cannot view private comments by other users
- cannot moderate other users' comments

### Admin Identity

Admin identity reuses the existing admin login state already used by the public/admin surfaces.

Admin capabilities:

- create comments and replies as `@TraceofLight`
- edit and delete admin-authored comments
- delete any guest comment
- view all comments including private bodies
- review all comments across all posts in admin console

Admin does not need to enter a name or password when writing comments.

## Data Model

Add a dedicated `post_comments` table.

Recommended columns:

- `id`
- `post_id`
- `root_comment_id`
  - `null` for root comments
  - points to the root comment for replies
- `reply_to_comment_id`
  - optional pointer to the exact comment being answered
- `author_name`
- `author_type`
  - `guest | admin`
- `password_hash`
  - nullable for admin comments
- `visibility`
  - `public | private`
- `status`
  - `active | deleted`
- `body`
- `created_at`
- `updated_at`
- `deleted_at`
- `last_edited_at`
- optional abuse fields:
  - `request_ip_hash`
  - `user_agent_hash`

Recommended indexes:

- `(post_id, created_at desc)`
- `(root_comment_id, created_at asc)`
- `(reply_to_comment_id)`
- `(status)`
- `(visibility)`

## Rendering Model

The backend should return comments in a shape optimized for the public UI rather than exposing raw recursive relationships.

Recommended response shape:

- root comments list
- each root carries a `replies` array
- each reply may expose:
  - `reply_to_comment_id`
  - `reply_to_author_name`

Masking rules should be applied server-side before data reaches Astro/React:

- non-admin viewer + private comment => placeholder body only
- deleted comment => deleted placeholder body only

This prevents the frontend from accidentally leaking private content.

## API Design

### Public/Post APIs

- `GET /api/v1/posts/{slug}/comments`
  - returns public-safe tree for that post
  - admin caller receives private bodies too
- `POST /api/v1/posts/{slug}/comments`
  - create root comment or reply
- `PATCH /api/v1/comments/{id}`
  - guest requires password verification
  - admin bypasses guest password flow
- `DELETE /api/v1/comments/{id}`
  - performs soft delete only

### Admin Review API

- `GET /api/v1/admin/comments`
  - returns newest-first cross-post feed
  - supports filters such as post slug, visibility, status, author type

### Validation Rules

- name length: `2..24`
- password length: `4..64`
- body length: `2..2000`
- reply target must belong to the same post
- deleted comments cannot receive new replies
- replies always resolve to a root thread before insert

### Abuse Controls

Start with application-level rate limiting:

- create comment: `3/minute`, `10/10 minutes` per IP
- password verification attempts: separate low threshold
- repeated identical body submissions on same post should be rejected for a short cooldown window

No CAPTCHA is required in the initial scope.

## Frontend Design

### Public Comment Surface

Add a dedicated comments section component under the blog detail page:

- section header with count
- write form
- thread list
- inline reply entry point per comment
- guest password modal for edit/delete

Rendering rules:

- root comment card is the visual anchor
- replies render below the root at a fixed indentation
- reply-to target is shown as metadata, not as deeper indentation

### Admin-Aware Form Behavior

When admin login is active:

- hide guest-only name/password fields
- pre-label the author as `@TraceofLight`
- allow standard comment/reply creation and self-edit/delete

When admin login is not active:

- show guest fields
- require password before create

### Admin Console Surface

Extend the existing `/admin/imports` console by inserting a new comments review panel below the current `포트폴리오 PDF 관리` section.

Panel behavior:

- fixed-height box with internal scroll
- newest-first list
- includes admin and guest comments together
- each row shows:
  - author
  - post title or slug
  - root/reply badge
  - visibility
  - status
  - timestamp
  - masked or full body according to admin privileges
- actions:
  - delete
  - link to target post

## Error Handling

Return explicit but non-leaky errors:

- wrong password => `인증에 실패했습니다.`
- deleted target => `삭제된 댓글에는 답글을 달 수 없습니다.`
- invalid parent/post relation => `잘못된 댓글 대상입니다.`
- not found => `댓글을 찾을 수 없습니다.`
- rate limited => retry-after style message

Frontend behavior:

- preserve draft text on submission failure
- show field-level validation for length/rule errors
- show generic action-level status for network/server failure

## Testing Strategy

### Backend

- model tests for comment relationships and enum mapping
- repository/service tests for:
  - create root comment
  - create reply
  - private comment masking
  - soft delete behavior
  - deleted-target reply rejection
  - guest password verification
  - admin bypass and visibility access
- API tests for public/admin response differences and admin list endpoint

### Frontend

- public route tests for comments section placement under `모든 글 보기`
- UI tests for guest vs admin form differences
- UI tests for flat reply rendering
- UI tests for private/deleted placeholders
- admin console tests for newest-first scrollable comment review box

## Risks and Mitigations

### Risk: Private content leaks to public UI

Mitigation:

- apply masking on the backend response layer
- keep public/internal-admin viewer modes explicit in tests

### Risk: Reply structure becomes inconsistent

Mitigation:

- store both `root_comment_id` and `reply_to_comment_id`
- resolve root thread on write
- reject writes targeting deleted comments

### Risk: Guest password flow becomes brittle

Mitigation:

- use one shared password verification service
- never expose whether name or password was wrong
- test edit/delete flows independently

## Deferred Work

The following items are intentionally out of scope for this design:

- visitor counter and powered-by widget
- CAPTCHA / Turnstile integration
- notification emails
- comment reactions
- comment search in public UI

## Acceptance Criteria

This design is satisfied when all of the following are true:

- blog detail pages render a comments section below `모든 글 보기`
- guests can create/edit/delete their own comments using `name + password`
- admins can write as `@TraceofLight` without guest credentials
- private comments are masked for non-admins and visible to admins
- deleted comments remain in-thread as placeholders
- replies stay visually flat under the root comment
- deleted comments do not accept new replies
- `/admin/imports` includes a scrollable newest-first comment review panel
