# Slug Redirect System — Design Spec

- **Date:** 2026-05-06
- **Status:** Draft (awaiting user review)
- **Branch:** `slug-redirects`

## 1. Problem

Admins can rename the slug of any blog post, project, or series via the admin edit endpoint. There is no current mechanism to preserve the old URL. After a rename:

- Inbound links from external sites, search results, social shares, and RSS readers point to the old URL and produce a 404.
- Search engines re-crawl on their own schedule; until they catch up, the old URL is indexed but broken.
- Repeated renames (a → b → c) compound the problem.

The system must keep old URLs working long enough for search engines to re-index, then automatically reclaim the redirect entry once it has served its purpose.

## 2. Scope

In scope: blog posts, projects, and series. Posts and projects share the `posts` table (`Post.content_kind`), so one redirect table covers both. Series is a separate table and gets its own redirect table.

Out of scope:
- Slug renames for tags, admin users, or other resources.
- The comments API endpoint `GET /posts/{slug}/comments`. Comment loading happens after the page navigates to the canonical slug; the rare direct caller of the API is responsible.
- Sitemap exposure of old slugs. The sitemap continues to list only live slugs; search engines discover redirects by crawling.

## 3. Approach

Two new tables, `post_slug_redirects` and `series_slug_redirects`, store `(locale, old_slug) → target_id`. The target is a foreign key to the canonical entity (post or series id), not a slug string. At read time, redirect resolution looks up the target entity by id and reads its current slug, producing a single 301 hop regardless of how many renames have occurred.

A daily cleanup task removes redirect rows that have lived past a minimum age and have not been hit recently, draining the table back toward zero once external link decay has caught up.

### 3.1 Why "target id" instead of "target slug"

Storing a slug string requires either transitive resolution at read time (with loop detection and depth limits) or write-time chain-collapse maintenance (`UPDATE redirects SET new_slug = ? WHERE new_slug = ?`). Both are correct but introduce write- or read-side complexity.

Storing the target id makes chains structurally impossible: a redirect's target is always an entity, never another redirect's source. The current slug of that entity is read on demand. Trade-off: one extra indexed PK lookup per resolve, paid only on the 404 fallback path.

## 4. Data model

### 4.1 `post_slug_redirects`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `locale` | enum (`PostLocale`) | `ko`, `en`, `ja`, `zh`. Same enum as `posts.locale`. |
| `old_slug` | String(160) | Same length cap as `posts.slug`. |
| `target_post_id` | UUID | FK → `posts.id` `ON DELETE CASCADE`. |
| `created_at` | timestamptz | `now()` default. |
| `last_hit_at` | timestamptz, nullable | Updated on each redirect resolve. NULL until first hit. |
| `hit_count` | int, default 0 | Incremented on each redirect resolve. |

Constraints:

- `UNIQUE (locale, old_slug)` — a slug can redirect to at most one target per locale.
- Index on `(target_post_id)` for cascade and admin listing.

### 4.2 `series_slug_redirects`

Identical shape; `target_series_id` references `series.id` with `ON DELETE CASCADE`.

### 4.3 Alembic migration

One migration adds both tables. Numbered after `20260504_0017`.

## 5. Write path (slug rename)

The single integration point is `PostService.update_post_by_slug` (`apps/api/src/app/services/post_service.py:136-150`) and the analogous series update method in the series service.

When the incoming payload's slug differs from the current row's slug, inside the same transaction:

```sql
-- Step 1: record the old slug as a redirect to this post id.
INSERT INTO post_slug_redirects (locale, old_slug, target_post_id)
VALUES (:locale, :old_slug, :post_id)
ON CONFLICT (locale, old_slug) DO UPDATE
  SET target_post_id = EXCLUDED.target_post_id,
      created_at     = now(),
      last_hit_at    = NULL,
      hit_count      = 0;

-- Step 2: drop any redirect that pointed at the slug this post just claimed.
DELETE FROM post_slug_redirects
WHERE locale = :locale AND old_slug = :new_slug;
```

Step 1 is an UPSERT to handle the case where the old slug was previously a redirect target. Resetting `created_at` and the hit counters re-arms the SEO timer for the new (more recent) rename.

Step 2 prevents stale redirects from outliving the slug that "claimed" them. After Step 2, the `(locale, new_slug)` row in `posts` is the only thing answering for that slug.

The same Step-2 delete also runs in `PostService.create_post` and the analogous series creation path. This handles the case where a brand-new post is created with a slug that an old redirect still points at; without it, the redirect row would be dead-on-arrival but linger until cleanup. Step 1 is skipped on create (no old slug exists yet).

Series follows the same pattern with `series_slug_redirects` and `target_series_id`.

## 6. Read path (redirect resolution)

The fallback is wired into the existing 404 branches of the public detail pages. No middleware change.

### 6.1 Web flow (`apps/web/src/pages/[locale]/blog/[...slug].astro`)

1. Call `getPublishedDbPostBySlug(slug, { locale, includePrivate })`.
2. If a post is returned, render as today.
3. If null, call new helper `resolvePostSlugRedirect(slug, locale)` which calls a new API endpoint.
4. If the helper returns a target slug, return `Astro.redirect(`/${locale}/blog/${target}/`, 301)`.
5. If the helper returns null, fall through to today's 404 branch.

The series and projects detail pages get the analogous treatment: `resolveSeriesSlugRedirect` calls the series endpoint, `resolveProjectSlugRedirect` calls the projects endpoint. The projects helper does not reuse the blog endpoint even though they share storage — the kind filter belongs server-side.

### 6.2 API endpoints

Three endpoints, each filtering by the `content_kind` (or table) appropriate to its caller:

- `GET /posts/redirects/{old_slug}?locale={locale}` — for the blog detail page. Filters `posts.content_kind = 'blog'` and `posts.status = 'published'`.
- `GET /projects/redirects/{old_slug}?locale={locale}` — for the projects detail page. Same table, filter `posts.content_kind = 'project'`.
- `GET /series/redirects/{old_slug}?locale={locale}` — for the series detail page. Joins `series_slug_redirects` to `series`.

Each returns `{ "target_slug": "..." }` on a hit, 404 otherwise. Example for the blog endpoint:

```sql
SELECT p.slug
FROM post_slug_redirects r
JOIN posts p ON p.id = r.target_post_id
WHERE r.locale       = :locale
  AND r.old_slug     = :old_slug
  AND p.content_kind = 'blog'
  AND p.status       = 'published';
```

The kind filter ensures `/blog/old` does not 301 to a project URL (or vice versa) if the target post's `content_kind` was flipped after the redirect was created. If the JOIN produces no row — because the target was deleted (CASCADE removed the redirect), its kind changed, or it was unpublished — the endpoint returns 404 and the calling page falls through to its own 404 branch.

### 6.3 Hit tracking

After the JOIN succeeds, the API endpoint fires an `UPDATE post_slug_redirects SET hit_count = hit_count + 1, last_hit_at = now() WHERE id = ...` as a fire-and-forget background task (`asyncio.create_task` or equivalent). The client response does not wait on it. A failed update is logged and silently dropped — losing a hit counter does not affect correctness, only cleanup timing.

## 7. Cleanup

A daily in-process task, modeled on `apps/api/src/app/services/draft_cleanup_scheduler.py`, runs:

```sql
DELETE FROM post_slug_redirects
WHERE created_at < now() - (:min_age_days || ' days')::interval
  AND (last_hit_at IS NULL
       OR last_hit_at < now() - (:idle_days || ' days')::interval);

DELETE FROM series_slug_redirects
WHERE created_at < now() - (:min_age_days || ' days')::interval
  AND (last_hit_at IS NULL
       OR last_hit_at < now() - (:idle_days || ' days')::interval);
```

Defaults: `min_age_days = 90`, `idle_days = 30`. Both exposed via `app.core.config.settings` with env-var overrides (`SLUG_REDIRECT_MIN_AGE_DAYS`, `SLUG_REDIRECT_IDLE_DAYS`).

Rationale: 90 days exceeds Google's typical re-index latency for medium-traffic sites, and the 30-day idle window confirms no human or bot is still landing on the old URL. A redirect that lives forever — because the old URL is still being hit — is the correct outcome; the cleanup is conservative by design.

The scheduler module lives at `apps/api/src/app/services/slug_redirect_cleanup_scheduler.py` and is wired into `main.py` next to the existing draft cleanup loop.

## 8. Edge cases (verified against the design)

### 8.1 Rename to a slug that has an existing redirect (`a → b`, then `c → a`)

| Step | `posts` | `post_slug_redirects` |
|---|---|---|
| Initial | X.slug = a | (empty) |
| Rename X: a → b | X.slug = b | `(a) → X.id` |
| Rename Y: c → a | X.slug = b, Y.slug = a | `(c) → Y.id` (Step 2 deleted `(a) → X.id` because Y now claims `a`) |

Read of `/blog/a` → posts hit (Y) → 200. Read of `/blog/c` → 404 → redirect → Y → current slug `a` → 301. Read of `/blog/b` → 200 (X). The original `a → X` redirect is gone, which is correct: its slug has been re-claimed by a real post.

### 8.2 Rename back to the original slug (`a → b → a`)

| Step | `posts` | `post_slug_redirects` |
|---|---|---|
| Initial | X.slug = a | (empty) |
| Rename X: a → b | X.slug = b | `(a) → X.id` |
| Rename X: b → a | X.slug = a | `(b) → X.id` (Step 2 deleted `(a) → X.id`) |

`/blog/a` → posts hit. `/blog/b` → 301 to `/blog/a`. No loop is possible because `(locale, a)` was deleted when X claimed `a` again.

### 8.3 Multi-step chain (`a → b → c`)

| Step | `posts` | `post_slug_redirects` |
|---|---|---|
| Initial | X.slug = a | (empty) |
| Rename X: a → b | X.slug = b | `(a) → X.id` |
| Rename X: b → c | X.slug = c | `(a) → X.id`, `(b) → X.id` |

`/blog/a` → 404 → redirect → X → current slug `c` → 301 to `/blog/c`. `/blog/b` → same path, also single 301 to `/blog/c`. Every entry point reaches the canonical URL in one hop.

### 8.4 Target post deletion

`ON DELETE CASCADE` removes the redirect row when the target post is hard-deleted. The next request to the old slug returns a clean 404 instead of an indirection to a missing post.

### 8.5 Cross-locale isolation

`(locale, old_slug)` uniqueness scopes everything per locale. A redirect for `ko/a` is independent of `en/a`. Renames in one locale never affect another.

### 8.6 Content-kind mismatch (post ↔ project)

A post's `content_kind` may change in admin (blog ↔ project). If `/blog/old` resolves to a post that is now `content_kind='project'`, the blog redirect endpoint's `WHERE p.content_kind = 'blog'` filter excludes the row and returns 404. The projects redirect endpoint serves it instead when the user lands on `/projects/old`. The redirect row itself is preserved through the kind flip — if the post flips back, the original redirect resumes working. If the kind change is permanent, the cleanup window elapses and reclaims the row.

### 8.7 Concurrent renames

Both write-path statements run inside the existing edit transaction. Two concurrent renames of the same post serialize on the post row's lock. Two concurrent renames of different posts to the same target slug are prevented by the existing `(slug, locale)` unique constraint on `posts`.

## 9. Implementation outline

API:
1. Migration adding `post_slug_redirects` and `series_slug_redirects`.
2. `PostSlugRedirect` and `SeriesSlugRedirect` SQLAlchemy models.
3. Repository methods for upsert, delete-by-new-slug, lookup-with-target.
4. Service hooks: extend `update_post_by_slug` (Step 1 + Step 2) and the post/series create paths (Step 2 only) to maintain redirect rows on slug changes and slug claims.
5. Endpoints: `GET /posts/redirects/{old_slug}`, `GET /projects/redirects/{old_slug}`, `GET /series/redirects/{old_slug}`.
6. Hit-tracking background task on resolve.
7. Cleanup scheduler module + `main.py` startup wiring + settings.
8. Unit tests covering each edge case in §8.

Web:
9. `lib/blog-db.ts`, `lib/series-db.ts`, `lib/projects.ts` gain `resolve*SlugRedirect` helpers.
10. `[locale]/blog/[...slug].astro`, `[locale]/series/[slug].astro`, `[locale]/projects/[slug].astro` 404 branches call the helper and emit `Astro.redirect(..., 301)` on hit.
11. Integration test (vitest) that posts a rename through admin and verifies the public 301.

## 10. Open items for implementation plan

- Exact endpoint path naming (`/posts/redirects/{slug}` vs `/redirects/posts/{slug}`) — bikeshed at plan time.
- Whether the admin UI gets a redirect-list management page now or in a follow-up. Recommend follow-up: the cleanup task makes hand-management unnecessary in the common case.
- Settings naming for the cleanup window (`SLUG_REDIRECT_*` prefix as proposed).
