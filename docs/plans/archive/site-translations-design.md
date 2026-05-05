# Site Translations Design

## Goal

Add locale-prefixed public URLs and pre-generated translated post variants so the site can serve Korean source content plus automatic `en`, `ja`, and `zh` pages with stable SSR caching and search-engine-friendly alternates.

## Current State

- Public content is stored as single-locale `Post` rows keyed only by `slug`.
- Web routes resolve posts and archive pages without any locale segment.
- SEO metadata computes only a single canonical URL and does not emit localized alternates.
- Admin writer create/update flows submit one `PostCreate` payload and do not manage translated siblings.
- There is no translation provider integration or locale metadata in the backend schema.

## Decision

- Treat each locale variant as a real `posts` row, not as JSON nested under one source row.
- Add translation linkage metadata so sibling locale rows can be queried as one translation group.
- Standardize public URLs to locale-prefixed paths: `/ko/...`, `/en/...`, `/ja/...`, `/zh/...`.
- Pre-generate translated variants on create/update instead of translating at request time.
- Keep locale detection advisory only. The user may see a locale suggestion, but the app must not hard-redirect based on browser locale or IP.

## Alternatives Considered

### 1. Locale-adaptive single URL

- Same path would render a different language based on browser settings or geography.
- Rejected because SSR caching becomes weaker, `hreflang` support is poor, and search engines cannot reliably discover every localized variant.

### 2. One post row with embedded translation JSON

- A single source record would hold all localized bodies and metadata.
- Rejected because the current API, routing, archive, slug lookup, and writer flows all operate on post records. Embedded translations would add custom branching everywhere and make per-locale publishing or manual overrides awkward.

### 3. Locale-specific post rows linked by translation metadata

- Separate rows own their own slug, locale, body, and metadata while sharing a translation group.
- Chosen because it fits the current repository and web architecture, gives each locale its own URL and cache key, and allows later manual editing of individual translations without redesigning storage.

## Data Model

Add locale metadata directly to `posts`.

- `locale`: BCP 47-lite string for the stored content. Initial supported values: `ko`, `en`, `ja`, `zh`.
- `translation_group_id`: stable UUID shared by all localized variants of the same conceptual post.
- `source_post_id`: nullable self-reference to the source row used to generate this locale variant.
- `translation_source_kind`: enum such as `manual` or `machine`.
- `translation_status`: enum such as `source`, `synced`, `stale`, `failed`.

Behavior rules:

- Korean source posts use `locale='ko'`, `translation_status='source'`, and `source_post_id=NULL`.
- Translated variants use their own locale and point `source_post_id` at the Korean source row.
- Slugs remain globally unique. Locale is part of the public URL, but the stored slug still belongs to that locale row.
- The translation group, not the slug, is used to find toggle targets and `hreflang` alternates.

## API Shape

The existing posts API remains the main surface, extended with locale fields.

- `PostCreate` and `PostRead` gain locale and translation metadata.
- List and summary endpoints gain `locale` filtering.
- Single-post lookup becomes locale-aware. Repository helpers should resolve by `(slug, locale)` rather than slug alone for public content.
- Admin create/update requests still target a source post, but the service layer becomes responsible for creating or updating sibling translations.

Keep the external shape simple:

- Writer submits the Korean source payload.
- Backend creates or updates the `ko` row first.
- Translation service generates `en`, `ja`, `zh` payloads and upserts sibling rows within the same translation group.

## Public Routing

Locale-prefixed routes become canonical public URLs.

- `/ko`
- `/en`
- `/ja`
- `/zh`

Applies to:

- home
- blog archive
- blog detail
- projects index/detail
- series index/detail

Admin and internal API routes stay unprefixed.

Korean becomes explicit as `/ko/...` for consistency. Existing unprefixed public routes can be removed from internal linking once locale-prefixed routes are in place.

## SEO

Centralize locale metadata in one helper shared by page head rendering and sitemap generation.

- `canonical` points at the current locale URL.
- `alternate hreflang` emits one entry per available sibling locale plus `x-default`.
- `<html lang>` reflects the current locale.
- sitemap generation includes each locale URL and, where practical, shares the same translation map used for the page head.

Important constraints:

- No forced locale redirect based on IP or browser locale.
- Language toggle uses explicit links to sibling locale URLs.
- Machine-translated pages must remain indexable only when they provide the full translated main content, not just translated chrome.

## Writer Flow

The writer remains source-first.

- The editor creates and edits the Korean source payload.
- After a successful save, the backend translation service upserts translated siblings.
- Locale variants are not authored independently in the first version.
- Admin edit pages may later expose sibling status and last sync metadata, but the first pass can keep editing centered on the source row.

Translation lifecycle:

- Source save succeeds.
- Translation jobs or inline service calls generate target payloads.
- Existing sibling rows are updated in place when possible.
- Failures mark the sibling translation status instead of blocking source persistence.

## Translation Service Seam

Do not hard-wire one model vendor into repository or route code.

- Add a translation service interface in the API layer.
- Service input should be structured post content, not raw SQL rows.
- Service output should contain localized title, excerpt, body, and SEO-facing text fields.
- Provider configuration comes from environment variables and should be isolated behind one adapter.

The first implementation should allow the rest of the locale architecture to land even if provider credentials are absent. In that case, translations may remain ungenerated or marked failed, but the data model and routing must stay coherent.

## Testing

Backend:

- repository tests for locale-aware create/get/list behavior
- service tests for translation-group upsert rules
- API tests for locale filtering and locale-aware slug lookup
- OpenAPI tests for new schema fields

Web:

- route tests for locale-prefixed pages
- metadata tests for canonical, `hreflang`, and `<html lang>`
- language toggle tests
- archive/detail tests to ensure locale is preserved in links

## Rollout

Implement in slices:

1. Add locale/translation metadata to backend storage and APIs.
2. Add shared locale utilities and SEO helper in web.
3. Move public routes to locale-prefixed paths while keeping admin/internal routes unchanged.
4. Wire writer save flow to translation upsert service.
5. Add language toggle UI and sitemap alternates.

This ordering keeps the foundation stable before any provider-specific translation work is introduced.

## Provider integration (delivered)

The translation seam from the core rollout is now backed by:

- `DeeplTranslationProvider` (deepl SDK, ko → en/ja/zh)
- `TranslationQueue` (rq on Redis, queue name `translations`)
- `translate_post_to_locale` worker job (one row per target locale)
- sha256 `translated_from_hash` on translated rows for change detection

Source-post create/update enqueues three jobs (en, ja, zh). The worker
skips the DeepL call when the source's translatable-field hash matches the
sibling's stored hash, but always re-syncs non-translated metadata
(cover image, status, published_at, series_title).

Failure surface: provider errors mark the corresponding sibling row's
translation_status='failed' and re-raise so rq retains the job in its
failed registry. The next source-save retries automatically because hash
mismatch and `failed` status both bypass the skip path.
