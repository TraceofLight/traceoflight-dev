# Auto-translation via Google Translate API

## Goal

Re-establish the auto-translation pipeline that was deprecated during the
FastAPI → Rust axum migration. Korean (`ko`) is the source of truth; on
create/update of a `ko` row in `posts` or `series`, enqueue translation jobs
that produce `en`, `ja`, and `zh` sibling rows via Google Translate API
(Basic, v2). Re-running on update is fine; nothing in this MVP retries on
failure beyond the natural "next save = next enqueue".

## Scope

**In:**
- Translation provider trait + Google Translate (v2) implementation
- Redis-backed translation queue (LPUSH/BRPOP, like the rq pattern but Rust)
- Tokio background worker, spawned at API boot
- Producer hook on `posts.create`, `posts.update_by_slug`,
  `series.create`, `series.update_by_slug` — only when row is the `ko`
  source (`locale='ko'` AND `source_post_id IS NULL` for posts;
  analogous for series)
- Hash-based change detection via existing `translated_from_hash` column
- Comments unification by `translation_group_id` so language switch keeps
  the same comment thread visible across siblings
- Cleanup: drop `DEEPL_API_KEY`, `DEEPL_BASE_URL`, `REDIS_QUEUE_NAME` from
  envs; add `GOOGLE_TRANSLATE_API_KEY`; refresh README

**Out (deliberate):**
- Comment translation — stays in the original language by design (cost +
  meaning drift; small site)
- Glossary support — would require Advanced (v3) API + GCP service
  account; revisit if technical-term mistranslations become annoying
- Markdown masking — translate body markdown as plain text. Google
  preserves typical markdown punctuation acceptably for short blog
  content; if the rendered output gets noticeably mangled later, add a
  mask/unmask layer (port of the old `post_translation_markdown.py`)
- Retry policy beyond "next save re-enqueues" — explicit per user request
- Direct manual edits to en/ja/zh siblings — those rows have
  `source_post_id IS NOT NULL` (auto-translated) or are stand-alone rows
  with their own `translation_group_id`. Worker only touches siblings whose
  `source_post_id` matches the ko source

## Architecture

```
[admin save]                    [enqueue (sync)]            [Redis list]
posts.update ────► record_post + push 3 jobs ────► <prefix>translations:queue
                  (en, ja, zh)                    LPUSH "{post|series}:<id>:<locale>"

[boot]
spawn_translation_worker(pool, redis, provider)
  └─ tokio task
     loop:
       BLPOP <prefix>translations:queue (timeout 5s)
       parse job
       fetch ko source
       compute source_hash
       look up sibling by translation_group_id + locale
       if sibling.translated_from_hash == source_hash → skip
       else
         provider.translate(fields, target_locale)
         upsert sibling row (insert if missing, update if exists)
         set translation_status='translated', translated_from_hash=hash
       on provider error:
         log + set translation_status='failed' on the sibling
         (no retry; next save re-enqueues)
```

## Data model usage

Reuses columns that already exist in `apps/api/migrations/20260507000000_initial_schema.sql`:

| Column | Role |
| :-- | :-- |
| `posts.locale`, `series.locale` | Tells worker if row is `ko` (source) or target |
| `posts.translation_group_id`, `series.translation_group_id` | Joins ko to siblings |
| `posts.source_post_id`, `series.source_series_id` | Sibling → source FK; NULL on the source row |
| `posts.translation_status`, `series.translation_status` | `source` (ko) / `pending` / `translated` / `failed` (sibling) |
| `posts.translation_source_kind`, `series.translation_source_kind` | `manual` (admin wrote it) / `auto` (worker wrote it) |
| `posts.translated_from_hash`, `series.translated_from_hash` | Source-content sha256, for skip-if-unchanged |

Schema migration is **not** required.

## Module layout

```
apps/api/src/translation/
├── mod.rs           // pub re-exports + AppState glue
├── provider.rs      // TranslationProvider trait + GoogleTranslateProvider
├── queue.rs         // TranslationQueue (Redis LPUSH/BRPOP)
├── worker.rs        // spawn_translation_worker(pool, queue, provider)
└── hash.rs          // compute_source_hash(title, excerpt, body) + series variant
```

## Trigger conditions

Producer-side check (in `posts/service.rs`, `series.rs` after the
post-commit ack):

```rust
let is_ko_source = payload.locale == PostLocale::Ko && payload.source_post_id.is_none();
if is_ko_source {
    queue.enqueue_post_translation(post_id, [PostLocale::En, PostLocale::Ja, PostLocale::Zh]);
}
```

Same shape for series. Enqueue is fire-and-forget — failure to enqueue
logs WARN but never breaks the user-facing save.

## Comments unification

Change `comments::list_post_comments` to resolve `translation_group_id`
from the slug, then query `WHERE post_id IN (SELECT id FROM posts WHERE
translation_group_id = $1)`. Comments stay in their original language;
visible regardless of which locale sibling the visitor lands on.

`create_comment`, `update_comment`, `delete_comment` keep tying comments
to the specific row's `post_id` they were created against (ownership
follows authorship). Reads merge across the group; writes stay row-local.

## Env diff

```diff
- DEEPL_API_KEY=...
- DEEPL_BASE_URL=https://api-free.deepl.com
- REDIS_QUEUE_NAME=translations
+ GOOGLE_TRANSLATE_API_KEY=
+ GOOGLE_TRANSLATE_QUEUE_KEY=translations:queue   # optional override; default fits redis_key_prefix
```

## README diff (excerpt)

```diff
- The site is multi-locale (ko/en/ja/zh). Korean posts are the source of truth;
- en/ja/zh siblings are auto-generated via DeepL by a background `rq` worker.
- Set `DEEPL_API_KEY` in `apps/api/.env.api` to enable translation; without a
- key, the API still serves Korean content unchanged.
+ The site is multi-locale (ko/en/ja/zh). Korean posts are the source of truth;
+ en/ja/zh siblings are auto-generated via Google Translate API (Basic v2) by a
+ background tokio task pulling from Redis.
+ Set `GOOGLE_TRANSLATE_API_KEY` in `apps/api/.env.api` to enable translation;
+ without a key, the worker logs a warning at boot and ko-only content is
+ served unchanged.
```

## Tests

- Unit: `compute_source_hash` determinism + sensitivity to each field
- Unit: provider error mapping (mock 401, 429, 5xx → variants)
- Integration: enqueue → worker drain → sibling row appears with hash
  populated (uses a fake provider that returns deterministic strings)
- Comments: list returns rows from siblings sharing translation_group_id

## Provenance

Re-establishes pieces archived in
`docs/plans/archive/site-translations-provider.md` (DeepL adapter, hash,
queue, worker). Cites that document for design rationale; does not
replay it. Behavior parity points: hash format, source-of-truth rule,
fail-soft on save vs. fail-hard on worker.
