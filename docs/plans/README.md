# `docs/plans/` — Implementation plan registry

Active plans live at this top level. Completed or superseded plans get moved to
`./archive/` so the active list stays focused on what's actually in flight.

## How to read this directory

- **Top level (`docs/plans/*.md`)** — plans whose work is still pending or
  partially in progress. Pick one up here when continuing existing work.
- **`docs/plans/archive/*.md`** — plans whose deliverables have shipped. Kept
  for reference (architectural rationale, design decisions, migration history)
  but not for re-execution. Don't re-run an archived plan; if a residual gap
  shows up, capture it as a new active plan that *cites* the archived one.

## Currently active

- [`seo-i18n-pipeline.md`](seo-i18n-pipeline.md) — multi-locale SEO/RSS hardening.
  Picks up the residual sitemap/JSON-LD/RSS work that the archived
  site-translations plans punted on (`site-translations.md` Task 12 and
  `site-translations-extended.md` Task 15 expected post-level hreflang sibling
  emission, but the actual sitemap code shipped only with index-level
  alternates and a TODO for posts).

## Archive

The five `site-translations*` documents in `archive/` capture the locale system
that shipped between commits `1c7481e` (`feat: locale system`) and `9411518`
(`fix: main page translate`). Their deliverables — `posts.locale`,
`translation_group_id`, locale-prefixed routes (`src/pages/[locale]/`),
`PostTranslationService`, DeepL provider, redis-rq worker, legacy
`/blog/[...slug] → /:locale/blog/:slug` 302 — are all in `main` already.
Treat those documents as architectural references, not as todo lists.

| Archived plan | What it shipped | Residual surfaced in active plan? |
|---|---|---|
| `site-translations.md` | locale routing, BaseHead/BaseLayout/BlogPost SEO refactor, locale-prefixed pages, `PostTranslationService`, sitemap alternates for indexes, legacy redirects | yes — post-level sitemap hreflang (its Task 12) is the new plan's Task 3 |
| `site-translations-design.md` | architectural rationale for the above | n/a (design doc) |
| `site-translations-extended.md` | series locale support, dictionary scaffolding (`lib/i18n/dict/`), per-locale home/projects/series pages, sitemap per-locale URLs for indexes | yes — same post-level hreflang gap |
| `site-translations-extended-design.md` | extended design rationale | n/a (design doc) |
| `site-translations-provider.md` | DeepL provider, `translated_from_hash`, composite `(slug, locale)` UNIQUE, redis queue, worker | no residual |

## Conventions

- **Active plan filename**: short kebab-case feature slug (`seo-i18n-pipeline.md`).
  Date prefixes are not required — git history records when the file was added.
- **Archive trigger**: when a plan's deliverables are observable in `main` (code
  shipped, migrations applied, smoke-tested). Move with `git mv` so blame is
  preserved.
- **Residual capture**: never reopen an archived plan. Write a fresh active
  plan that names the archived one in its "Provenance" or "Out of scope"
  section.
