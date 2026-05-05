# Site Translations Extended Design

## Goal

Extend the existing blog-only multilingual coverage to the full public surface of the site — home, projects, series — and translate every hard-coded UI string so a visitor on `/en`, `/ja`, or `/zh` sees a consistent non-Korean experience instead of mixed Korean/foreign chrome.

## Current state

- `posts` table is locale-aware. `/[locale]/blog/*` routes serve translated post siblings created by the rq translation worker. Korean source posts auto-translate to en/ja/zh on save.
- `LanguageToggle`, sitemap alternates, `<html lang>`, OG locale, hreflang are all locale-driven.
- Production has 82 Korean source posts × 4 locale rows for blog content (2 project rows had siblings deleted during recovery and translation is currently inhibited for `content_kind='project'` because the worker doesn't replicate `project_profile`).
- `series` table has no locale support.
- Public pages still Korean-only at the URL layer:
  - `/` (home)
  - `/projects`, `/projects/[slug]`
  - `/series`, `/series/[slug]`
- Hard-coded Korean UI strings live in shared layouts, navigation, footers, button labels, empty-state messages, and date formatters.
- Admin pages (`/admin/*`) and utility endpoints (`/portfolio`, `/resume`, `/logout`, `/sitemap.xml`, `/internal-api/*`) stay unprefixed and Korean by design.

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Hard-coded UI strings | **Full i18n.** Typed dictionary per locale, manually authored, TypeScript-enforced structural identity. |
| 2 | Series translation | **Full translation.** Add locale to `series` model, translate title/description via DeepL using the same worker pipeline. |
| 3 | Projects translation | **Full translation.** Fix worker so `project_profile` (and any project-specific data) is replicated to siblings; translate body + project metadata. |
| 4 | Home page | **Locale-prefixed `/[locale]/`** with translated chrome from the dictionary. Same recent-posts island, locale-filtered. |

## Scope (in)

- Locale-prefixed routes for home, projects (index + detail), series (index + detail).
- 301 redirects from legacy unprefixed routes to `/ko/...`.
- Series locale schema + worker support + backfill of existing series.
- Project worker fix to preserve `project_profile`; backfill the 2 existing project posts.
- Worker generalization so `Post` and `Series` share the translate-and-upsert pipeline instead of duplicating it.
- Typed UI dictionary (`apps/web/src/lib/i18n/dict/{ko,en,ja,zh}.ts`) covering navigation, footer, buttons, empty states, layout chrome, language toggle labels, 404, archive filters, comment form labels.
- Sitemap emits per-locale URLs for home, projects, series — only for locales with actual stored sibling rows (matching the post-locale-only emission already used for blog).
- Date formatting via `Intl.DateTimeFormat(locale, …)`.

## Scope (out — follow-ups)

- Admin UI translation (admin stays Korean).
- Auto-translation of UI strings via DeepL (decision: manual authorship is more deterministic and the dictionary is small enough to maintain). The translation provider only handles long-form content (post bodies, series descriptions).
- Series description (markdown body) translation if series eventually grow body text — currently series only carry title + short description.
- Locale-aware 404 metadata beyond the visible body chrome.

## Architecture

### Routing

```
public surface (after this change):

/                                  → 301 → /ko/
/[locale]/                          home (translated chrome + recent posts in locale)
/[locale]/blog/                     (existing — no change)
/[locale]/blog/[...slug]/           (existing — no change)
/[locale]/projects/                 projects index (locale-aware)
/[locale]/projects/[slug]/          project detail (locale-aware, requires worker copying project_profile)
/[locale]/series/                   series index (locale-aware)
/[locale]/series/[slug]/            series detail (locale-aware, posts inside the series filter to current locale)

/projects                          → 301 → /ko/projects/
/projects/[slug]                   → 301 → /ko/projects/[slug]/
/series                            → 301 → /ko/series/
/series/[slug]                     → 301 → /ko/series/[slug]/

unchanged (no locale prefix):
/admin/*, /portfolio, /resume, /logout, /sitemap.xml, /internal-api/*, /404
```

Strict-locale guard: every `[locale]/` page rejects unsupported locales with a 404, matching the existing blog page behavior.

### Backend — `posts` worker fix (project_profile replication)

The current `translation_worker._upsert_sibling` copies most non-translated fields (cover, top_media_*, status, etc.) but does not touch `project_profile`. Project posts have a one-to-one `project_profile` relationship that holds period_label, role_summary, project_intro, card_image_url, highlights_json, resource_links_json. Sibling rows must carry the same profile so the projects API serializer doesn't 500 on missing data.

Approach: when the source post has a `project_profile`, the worker creates or updates the sibling's `project_profile` to mirror the source. Because `project_profile` is metadata-only (no translatable text we can't pass through), the sibling reuses the source's profile values verbatim. The fields are loaded with `selectinload(Post.project_profile)` already (per existing repository code) so they're available on the worker side.

Drop the previously-discussed `content_kind=BLOG` guard. The worker will translate both blog and project content equally.

### Backend — `series` model migration + worker

Migration `20260504_0016_add_series_locales.py`:

- Add columns to `series`: `locale` (enum: ko/en/ja/zh, default `ko`, NOT NULL), `translation_group_id` (UUID, default `id`, NOT NULL), `source_series_id` (FK self-ref, ON DELETE SET NULL, nullable), `translation_status` (enum, default `source`, NOT NULL), `translation_source_kind` (enum, default `manual`, NOT NULL), `translated_from_hash` (VARCHAR(64), nullable).
- Backfill existing rows: `locale='ko'`, `translation_group_id=id`, status=source, kind=manual.
- Replace single-column `slug` UNIQUE (or unique index) on series with composite `(slug, locale)` UNIQUE — same pattern used for posts.

Model:
- `series` model gains the same five fields plus `__table_args__` with the composite UNIQUE.

Admin reorder API: the existing endpoint that lists series for ordering must filter to `locale='ko'` so each conceptual series appears exactly once. Order changes propagate within the Korean source row only; translation siblings inherit `published_at` / order metadata from the source on every worker run.

Translation hash for series: `sha256(title + "\x1f" + description)` (unit-separator joined, mirroring posts). Description-only changes trigger re-translation; metadata-only changes (cover image, post count) do not.

### Worker generalization

Refactor `translation_worker` from post-specific to a strategy-based pipeline. Two motivations: (1) avoid duplicating ~150 lines of mask→translate→unmask→upsert logic, (2) keep a single source of truth for hash gating, failure handling, and metadata replication.

Shape:

```python
class TranslationStrategy(Protocol):
    """How to load, hash, translate, and upsert a translatable record."""
    def load_source(self, db: Session, source_id: UUID) -> Any | None: ...
    def is_translatable_source(self, source: Any) -> bool: ...
    def find_sibling(self, db: Session, source: Any, target_locale: PostLocale) -> Any | None: ...
    def compute_source_hash(self, source: Any) -> str: ...
    def translate(self, source: Any, target_locale: str, provider: TranslationProvider) -> dict | None: ...
    def upsert_sibling(self, db: Session, *, source, sibling, target_locale, translated, source_hash) -> Any: ...
    def mark_failed(self, db: Session, *, source, target_locale, source_hash) -> None: ...
```

Concrete: `PostTranslationStrategy` and `SeriesTranslationStrategy`. The worker dispatches by job kind:

```python
def translate_to_locale(kind: str, source_id: str, target_locale: str) -> None:
    strategy = _STRATEGIES[kind]
    ...  # generic load → guard → hash → needs-translation → translate → upsert → commit / mark_failed
```

`TranslationQueue` gains a `kind` parameter:
```python
queue.enqueue_translation_job(kind="post", source_id=..., target_locale=...)
queue.enqueue_translation_job(kind="series", source_id=..., target_locale=...)
```

Backwards-compat: existing in-flight job records (if any) keep working because we re-enqueue all backfill from scratch and there's no persistent queue state to migrate.

### Frontend — typed dictionary

Files:
```
apps/web/src/lib/i18n/dict/ko.ts        ← source of truth
apps/web/src/lib/i18n/dict/en.ts
apps/web/src/lib/i18n/dict/ja.ts
apps/web/src/lib/i18n/dict/zh.ts
apps/web/src/lib/i18n/dictionary.ts     ← pickDictionary(locale), typeof ko enforcement
```

`ko.ts` exports `as const` nested object. `en.ts` / `ja.ts` / `zh.ts` annotate `: typeof ko` so TypeScript fails the build if a key is missing in any non-Korean locale.

Categories (initial inventory, ~60–80 keys):

```
nav.blog / nav.projects / nav.series / nav.about
footer.copyright / footer.builtWith / footer.poweredBy
buttons.readMore / buttons.backToList / buttons.save / buttons.cancel / buttons.delete / buttons.edit / buttons.search
buttons.loadMore / buttons.retry / buttons.viewAll
empty.noPosts / empty.noResults / empty.noProjects / empty.noSeries
blogPost.backToBlog / blogPost.viewAllPosts / blogPost.relatedSeries / blogPost.publishedOn / blogPost.updatedOn / blogPost.minRead
archiveFilters.searchPlaceholder / archiveFilters.sort.latest / archiveFilters.sort.oldest / archiveFilters.sort.title
archiveFilters.visibility.all / archiveFilters.visibility.public / archiveFilters.visibility.private
languageToggle.ko / languageToggle.en / languageToggle.ja / languageToggle.zh
notFound.title / notFound.description / notFound.cta
projectDetail.role / projectDetail.period / projectDetail.highlights / projectDetail.resources
seriesDetail.postCount / seriesDetail.empty
comments.title / comments.placeholder / comments.submit / comments.empty / comments.deleteConfirm
```

Helper:
```ts
import { ko } from "./dict/ko";
import { en } from "./dict/en";
import { ja } from "./dict/ja";
import { zh } from "./dict/zh";

const dicts = { ko, en, ja, zh } as const;

export type Dictionary = typeof ko;

export function pickDictionary(locale: PublicLocale): Dictionary {
  return dicts[locale];
}
```

Astro pages take `locale` (already wired to BaseLayout/BlogPost) and pull `t = pickDictionary(locale)` at the top, then use `t.nav.blog` etc. React islands receive the `t` object as a prop or via a small context.

Date formatting uses `Intl.DateTimeFormat(locale, options)` directly; no library dependency.

### Sitemap

Existing `sitemap.xml.ts` already emits per-locale blog URLs at the locale a post is actually stored at, plus alternates. Extend the same pattern to:

- Home: emit four locale roots (`/ko/`, `/en/`, `/ja/`, `/zh/`) with `xhtml:link rel="alternate"` siblings + `x-default = /ko/`.
- Projects: emit one URL per (project, locale) pair that exists, with alternates.
- Series: emit one URL per (series, locale) pair that exists, with alternates.

Projects + series gracefully handle the partial-translation state: if only the Korean source exists for a record, only the `/ko` URL is emitted, no alternates (matches the current blog behavior introduced when the sitemap fix landed).

## Data flow

Source create / update for any translatable kind:

```
1. Admin saves Korean source (post or series)
2. Service.sync_source_<kind> enqueues 3 jobs onto the translation queue
   (target locales = en, ja, zh; kind = "post" or "series")
3. Worker pops job → loads source via strategy → computes hash → looks up sibling
4. needs_translation = sibling None OR sibling failed OR hash mismatch
5. If yes: mask body markdown → DeepL → unmask → upsert sibling (translated fields + non-translated metadata)
6. If no: only sync non-translated metadata to sibling (cover image, status, project_profile, etc.)
7. Commit; on exception, rollback + mark sibling failed + raise (rq retains job in failed registry)
```

Public read at any locale:

```
1. Browser hits /[locale]/blog/foo or /[locale]/projects/foo
2. Astro page validates locale (404 on unsupported)
3. Astro fetches via blog-db / projects-db / series-db with locale param
4. API filters posts/series by composite (slug, locale)
5. Sibling row returned with translated fields + replicated metadata
6. Page renders chrome via dictionary[locale], content via sibling fields
```

## Failure modes

- **DeepL quota exhausted**: jobs land in rq's failed registry; sibling row marked `failed`. Next source-save re-triggers because hash mismatch + `failed` both bypass skip.
- **Translation worker container down**: jobs queue up in Redis (appendonly persistence); processing resumes when worker restarts. New posts/series saves return successfully — the user-facing API does not block on translation.
- **Missing dictionary key in a locale**: TypeScript build error before deploy. No runtime drift possible because all locale dicts must satisfy `typeof ko`.
- **Project siblings without `project_profile`**: explicitly fixed by the worker change. Eliminates the projects API 500 we saw in production.
- **Series reorder UI sees translated rows**: prevented by `locale='ko'` filter in the admin endpoint.
- **Backfill re-running**: idempotent. Hash check skips already-synced siblings, so re-running the backfill script on healthy data is safe.

## Testing approach

- Unit: strategy classes (`PostTranslationStrategy`, `SeriesTranslationStrategy`) tested individually with stub provider + in-memory SQLite.
- Unit: `pickDictionary(locale)` returns dict with same shape across locales (compile-time checked, plus runtime sanity test).
- Unit: legacy redirect pages return 301 with correct Location for each path.
- Integration: each new `[locale]/...` page imports the dictionary and renders without crash for all four locales.
- Integration: sitemap snapshot test covering home + project + series alternates pattern.
- Live verification: home/projects/series pages all return 200 across `/ko`, `/en`, `/ja`, `/zh`; `/xx/projects` returns 404; admin reorder lists 1 row per series.

## Rollout (high level — detailed task list lives in the implementation plan)

1. Worker generalization (strategy pattern, no behavior change yet).
2. Worker fix: replicate `project_profile`. Drop the content_kind guard.
3. Series migration + model + admin filter + service + strategy + worker integration.
4. Frontend dictionary scaffolding.
5. New `[locale]/` pages: home, projects (index + detail), series (index + detail).
6. Replace legacy unprefixed pages with 301 redirects.
7. Update sitemap to emit home/projects/series locale URLs.
8. Backfill: re-enqueue 2 project posts + every existing series.
9. Live verification across all four locales for the new surfaces.

## Risks tracked

- **Dictionary coverage drift**: a developer adds Korean copy and forgets en/ja/zh. Mitigation: TypeScript structural identity on `typeof ko` makes this a compile-time error.
- **Strategy refactor regressions**: existing post translation pipeline has live data and a backfilled production. Mitigation: keep all existing post tests green; add a regression test that the refactored worker still triggers the post pipeline correctly.
- **Series reorder edge cases**: order-affecting columns (`updated_at`, `published_at`, custom order index) might exist on translated rows. Worker should sync these from source on every run, matching post behavior.
- **Project profile data drift**: if admin edits the source post's project_profile after sibling creation, the sibling must pick up the change on next worker run. Strategy's upsert always re-syncs metadata, so this is covered.
- **Sitemap blow-up**: adding home (4 URLs) + projects (≤8 URLs) + series (~5 series × ≤4 locales) is small. No risk of large response.
- **Build time**: dictionary additions don't affect build time meaningfully (small files, no runtime translation).
