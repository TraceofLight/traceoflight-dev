# Blog Published-At Ordering Design

## Goal

Make public blog chronology stable by treating `published_at` as the primary date for blog cards, archive ordering, and detail headers, while keeping `updated_at` as internal edit metadata only.

## Decision

Use `published_at` as the public-facing blog date basis for DB-backed blog surfaces.

## Rationale

- Editing a published post currently reassigns `published_at`, which changes card dates and reorders the archive unexpectedly.
- The desired product behavior is for a blog post's place in chronology to reflect when it was first publicly published, not when it was later edited or temporarily hidden.
- `updated_at` already captures edit history and can remain internal metadata without being shown on public surfaces.
- `created_at` may reflect import or migration timing, so it should not drive public chronology.

## Scope

- Blog archive and homepage blog cards use `published_at`.
- DB blog detail page main date uses `published_at` only.
- Backend list ordering for published blog posts uses `published_at`.
- Editing an already-published post preserves its existing `published_at`.
- Visibility toggles preserve `published_at`.

## Out of Scope

- RSS ordering semantics.
- Project chronology changes.
- Series projection ordering changes.
