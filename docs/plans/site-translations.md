# Site Translations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add locale-prefixed public URLs (`/ko`, `/en`, `/ja`, `/zh`) plus pre-generated translated post siblings, so Korean source posts publish automatic en/ja/zh variants with SEO-friendly canonical/alternate metadata.

**Architecture:** Each locale variant is a real `posts` row sharing a `translation_group_id`. The Korean source row is the canonical record (`source_post_id IS NULL`, `translation_status='source'`); on save, a `PostTranslationService` upserts sibling rows for `en/ja/zh` behind a provider seam. Web side gains shared i18n + SEO helpers, locale-prefixed routes, and 301 redirects from legacy `/blog/...` to `/ko/blog/...`.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Astro 5 (SSR mode), TypeScript, React, Node test runner, pytest.

**Provenance:** Adapted from `stash@{0}` (authored on `6801876`, now 22 commits behind `main`). Original stash plan covered ~tasks 1–7 partially. This plan supersedes it: renumbers the migration, adds the `translation_status`/`translation_source_kind` enums the design doc requires, re-derives the SEO/layout changes against current main (which rewrote `BaseHead`/`BaseLayout`/`BlogPost` for the SEO settings feature), and finishes the missing writer integration, LanguageToggle, sitemap, and legacy-route redirects.

**Reference docs:**
- `docs/plans/site-translations-design.md` — architectural decisions (restored in Task 1).
- `stash@{0}` and `stash@{0}^3` — keep until Task 12 as a reference; do **not** `stash pop` blindly.

---

## Pre-flight (read once before starting)

- Always read **current main** before editing a file the stash also touches. The stash is a reference, not a base — for `BaseHead.astro`, `BaseLayout.astro`, `BlogPost.astro`, `repositories/post_repository.py`, `lib/blog-db.ts`, do not blindly apply the stash diff.
- Locale validation must **404 unknown locales**, not silently normalize. The stash's `normalizePublicLocale` is OK for *interpreting* but route guards must reject.
- Markdown content provider stays **Korean-only** by design. In `[locale]/blog/...`, only fall through to markdown when `locale === "ko"`.
- Admin and internal API routes are **never locale-prefixed**.
- After every task: run that task's tests, commit on the feature branch, and **do not** force-push.
- **All `git` commands assume cwd = repo root.** When a step starts with `cd apps/api` or `cd apps/web` to run tests / typecheck / build, treat that `cd` as scoped to that single step. Before the next step's commands (especially `git add`), return to the repo root (`cd -` or just open a fresh shell). Equivalent and safer: wrap the test command itself as `(cd apps/api && uv run pytest …)` to avoid changing the parent shell's cwd.

---

### Task 1: Branch setup, stash backup, restore design doc

**Files:**
- Create: `docs/plans/site-translations-design.md` (restored from stash)
- Create: `.local/translations-stash.patch` (backup, gitignored)

- [ ] **Step 1: Confirm tree state on main**

```bash
git status
git rev-parse --abbrev-ref HEAD
```

Expected: branch `main`. The only untracked / pending change should be `docs/plans/site-translations.md` (this plan, written before the branch was cut). It will be carried into the new branch by `git checkout -b` and committed in Step 5. If anything else is dirty, stop and clean up first.

- [ ] **Step 2: Back up the stash to a patch file (safety net)**

```bash
mkdir -p .local
git stash show -p --include-untracked stash@{0} > .local/translations-stash.patch
echo ".local/" >> .gitignore  # if not already ignored
```

Expected: `.local/translations-stash.patch` ~46–50 KB; can be re-applied later with `git apply --3way`.

- [ ] **Step 3: Create feature branch**

```bash
git checkout -b feature/site-translations
```

- [ ] **Step 4: Restore the design document from stash**

```bash
git show 'stash@{0}^3:docs/plans/site-translations-design.md' > docs/plans/site-translations-design.md
```

Verify:

```bash
head -3 docs/plans/site-translations-design.md
```

Expected: starts with `# Site Translations Design`.

- [ ] **Step 5: Commit**

```bash
git add docs/plans/site-translations-design.md docs/plans/site-translations.md .gitignore
git commit -m "docs(translations): import design + implementation plan"
```

Note: `docs/plans/site-translations.md` is *this* plan, written into the working tree before the branch was cut.

---

### Task 2: Backend — failing tests for locale storage and filtering

Tests are added first so the model/migration changes in Task 3 are TDD-driven. They will fail with `ImportError` (no `PostLocale` enum) until Task 3.

**Files:**
- Modify: `apps/api/tests/api/test_post_tags_repository.py` — add `test_posts_default_to_korean_locale_and_can_filter_by_locale`
- Modify: `apps/api/tests/api/test_openapi_docs.py` — assert locale field descriptions on `PostCreate`/`PostRead`/`PostSummaryRead`
- Modify: `apps/api/tests/api/test_posts_access_guard.py` — add `test_posts_list_accepts_locale_query`, `test_posts_get_accepts_locale_query`, extend `_StubPostService` and `_build_post_payload` with locale fields
- Modify: `apps/api/tests/api/test_post_summaries_api.py` — add `test_posts_summary_endpoint_accepts_locale_query`, extend stub
- Modify: `apps/api/tests/api/test_post_series_context_api.py` — extend stub signature with `locale=None`
- Modify: `apps/api/tests/api/test_posts_admin_edit_delete.py` — add `locale`, `translation_group_id`, `source_post_id` to `_build_post_payload`

- [ ] **Step 1: Lift the test changes from the stash diff**

The stash already wrote these tests. Apply only the test-file portions of the stash diff. Do **not** apply backend production-code portions yet.

```bash
git stash show -p stash@{0} -- apps/api/tests/api/ > /tmp/translations-tests.patch
git apply --3way /tmp/translations-tests.patch
```

Expected: clean apply (none of these test files have changed on main since `6801876`).

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api
uv run pytest tests/api/test_post_tags_repository.py::test_posts_default_to_korean_locale_and_can_filter_by_locale tests/api/test_posts_access_guard.py::test_posts_list_accepts_locale_query tests/api/test_post_summaries_api.py::test_posts_summary_endpoint_accepts_locale_query tests/api/test_openapi_docs.py -q
```

Expected: FAIL — `ImportError: cannot import name 'PostLocale'` and/or `Post.locale` AttributeError.

- [ ] **Step 3: Commit failing tests**

```bash
git add apps/api/tests/api/
git commit -m "test(api): pin locale storage and filtering behavior"
```

---

### Task 3: Backend — model, enums, and migration

Add the model columns the design doc specifies, including `translation_status` and `translation_source_kind` (which the stash skipped).

**Files:**
- Modify: `apps/api/src/app/models/post.py` — add `PostLocale`, `PostTranslationStatus`, `PostTranslationSourceKind` enums and three columns (+ status, source_kind)
- Create: `apps/api/alembic/versions/20260503_0013_add_post_locales.py` — renumbered migration with all five new fields

- [ ] **Step 1: Add enums + columns to the model**

In `apps/api/src/app/models/post.py`, add after `PostContentKind`:

```python
class PostLocale(str, enum.Enum):
    KO = "ko"
    EN = "en"
    JA = "ja"
    ZH = "zh"


class PostTranslationStatus(str, enum.Enum):
    SOURCE = "source"
    SYNCED = "synced"
    STALE = "stale"
    FAILED = "failed"


class PostTranslationSourceKind(str, enum.Enum):
    MANUAL = "manual"
    MACHINE = "machine"
```

Add `import uuid` at top, and inside `class Post(...)` after `series_title`:

```python
locale: Mapped[PostLocale] = mapped_column(
    Enum(PostLocale, name="post_locale", values_callable=_enum_values),
    index=True,
    nullable=False,
    default=PostLocale.KO,
)
translation_group_id: Mapped[uuid.UUID] = mapped_column(
    index=True,
    nullable=False,
    default=uuid.uuid4,
)
source_post_id: Mapped[uuid.UUID | None] = mapped_column(
    ForeignKey("posts.id", ondelete="SET NULL"),
    nullable=True,
    index=True,
)
translation_status: Mapped[PostTranslationStatus] = mapped_column(
    Enum(PostTranslationStatus, name="post_translation_status", values_callable=_enum_values),
    nullable=False,
    default=PostTranslationStatus.SOURCE,
)
translation_source_kind: Mapped[PostTranslationSourceKind] = mapped_column(
    Enum(PostTranslationSourceKind, name="post_translation_source_kind", values_callable=_enum_values),
    nullable=False,
    default=PostTranslationSourceKind.MANUAL,
)
```

Add `ForeignKey` to the existing `from sqlalchemy import ...`.

- [ ] **Step 2: Write the Alembic migration**

Create `apps/api/alembic/versions/20260503_0013_add_post_locales.py`:

```python
"""add post locales and translation linkage

Revision ID: 20260503_0013
Revises: 20260324_0012
Create Date: 2026-05-03 12:00:00
"""

from __future__ import annotations

import uuid

from alembic import op
import sqlalchemy as sa


revision = "20260503_0013"
down_revision = "20260324_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    locale_enum = sa.Enum("ko", "en", "ja", "zh", name="post_locale")
    status_enum = sa.Enum("source", "synced", "stale", "failed", name="post_translation_status")
    kind_enum = sa.Enum("manual", "machine", name="post_translation_source_kind")
    locale_enum.create(op.get_bind(), checkfirst=True)
    status_enum.create(op.get_bind(), checkfirst=True)
    kind_enum.create(op.get_bind(), checkfirst=True)

    op.add_column("posts", sa.Column("locale", locale_enum, nullable=True))
    op.add_column("posts", sa.Column("translation_group_id", sa.Uuid(), nullable=True))
    op.add_column("posts", sa.Column("source_post_id", sa.Uuid(), nullable=True))
    op.add_column("posts", sa.Column("translation_status", status_enum, nullable=True))
    op.add_column("posts", sa.Column("translation_source_kind", kind_enum, nullable=True))

    # Backfill existing rows: every existing post becomes a Korean source row in its own group.
    op.execute(
        """
        UPDATE posts
        SET
            locale = 'ko',
            translation_group_id = id,
            translation_status = 'source',
            translation_source_kind = 'manual'
        WHERE locale IS NULL
        """
    )

    op.alter_column("posts", "locale", nullable=False)
    op.alter_column("posts", "translation_group_id", nullable=False)
    op.alter_column("posts", "translation_status", nullable=False)
    op.alter_column("posts", "translation_source_kind", nullable=False)

    op.create_index("ix_posts_locale", "posts", ["locale"])
    op.create_index("ix_posts_translation_group_id", "posts", ["translation_group_id"])
    op.create_index("ix_posts_source_post_id", "posts", ["source_post_id"])
    op.create_foreign_key(
        "fk_posts_source_post_id_posts",
        "posts",
        "posts",
        ["source_post_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_posts_source_post_id_posts", "posts", type_="foreignkey")
    op.drop_index("ix_posts_source_post_id", table_name="posts")
    op.drop_index("ix_posts_translation_group_id", table_name="posts")
    op.drop_index("ix_posts_locale", table_name="posts")
    op.drop_column("posts", "translation_source_kind")
    op.drop_column("posts", "translation_status")
    op.drop_column("posts", "source_post_id")
    op.drop_column("posts", "translation_group_id")
    op.drop_column("posts", "locale")
    sa.Enum(name="post_translation_source_kind").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="post_translation_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="post_locale").drop(op.get_bind(), checkfirst=True)
```

- [ ] **Step 3: Apply migration to the dev database**

```bash
cd apps/api
uv run alembic upgrade head
```

Expected: migration runs cleanly, no `IntegrityError`. Verify with `uv run alembic current` showing `20260503_0013`.

- [ ] **Step 4: Reverse migration smoke check**

```bash
uv run alembic downgrade -1
uv run alembic upgrade head
```

Expected: clean down then up.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/models/post.py apps/api/alembic/versions/20260503_0013_add_post_locales.py
git commit -m "feat(api): add locale and translation linkage columns to posts"
```

---

### Task 4: Backend — schemas, repository, endpoint locale filter

Wire the new model fields into the request/response surface and repository queries.

**Files:**
- Modify: `apps/api/src/app/schemas/post.py` — add `locale`, `translation_group_id`, `source_post_id` fields to `PostCreate`/`PostRead`/`PostSummaryRead`
- Modify: `apps/api/src/app/repositories/post_repository.py` — add `locale` param to `list`, `list_summaries`, `get_by_slug`, `_apply_filters`, etc., and include `locale` in the serialized summary dict; assign default `translation_group_id = uuid4()` on create when not provided
- Modify: `apps/api/src/app/api/v1/endpoints/posts.py` — add `locale: PostLocale | None = Query(default=None)` on the list/summary/get-by-slug endpoints
- Modify: `apps/api/src/app/services/post_service.py` — pass `locale` through `list_posts` / `list_post_summaries` / `get_post_by_slug`

- [ ] **Step 1: Read current main first**

These four files have **not** been touched on main since the stash parent for the relevant areas, but the repository was rewritten heavily for *unrelated* reasons. Read `apps/api/src/app/repositories/post_repository.py` and confirm where `_apply_filters`, `list`, `list_summaries`, `get_by_slug`, `create` live before editing. The stash diff hunks are still a good pattern reference but **resolve hunk locations in current main, not in the stash parent**.

- [ ] **Step 2: Apply schema changes**

In `apps/api/src/app/schemas/post.py` add after the existing imports:

```python
from app.models.post import PostLocale  # add to existing import group
```

In `PostCreate`:

```python
locale: PostLocale = Field(
    default=PostLocale.KO,
    description="Locale code for this stored post variant.",
)
translation_group_id: uuid.UUID | None = Field(
    default=None,
    description="Shared translation group identifier for sibling locale variants.",
)
source_post_id: uuid.UUID | None = Field(
    default=None,
    description="Source post identifier when this row is a translated variant.",
)
```

In `PostRead` add the same three (with `translation_group_id: uuid.UUID` non-optional). In `PostSummaryRead` add `locale: PostLocale = Field(default=PostLocale.KO, description=...)`.

- [ ] **Step 3: Apply repository changes**

Add `locale: PostLocale | None = None` to every signature that already takes `status` / `visibility`. In the `_apply_filters` (or equivalent) helper:

```python
if locale is not None:
    stmt = stmt.where(Post.locale == locale)
```

In the summary serializer dict, add `"locale": post.locale,`. In `create()`:

```python
if post_data.get("translation_group_id") is None:
    post_data["translation_group_id"] = uuid.uuid4()
```

In `update()`:

```python
if post_data.get("translation_group_id") is None:
    post_data["translation_group_id"] = post.translation_group_id
if "source_post_id" in post_data and post_data.get("source_post_id") is None:
    post_data["source_post_id"] = post.source_post_id
```

- [ ] **Step 4: Apply endpoint + service plumbing**

In `apps/api/src/app/api/v1/endpoints/posts.py`, add `from app.models.post import PostLocale` and add `locale: PostLocale | None = Query(default=None)` to `list_post_summaries`, `list_posts`, and `get_post_by_slug`, then pass it into the service call.

In `apps/api/src/app/services/post_service.py`, add `locale: PostLocale | None = None` to the same three service methods and forward to the repository.

- [ ] **Step 5: Run the Task 2 tests**

```bash
cd apps/api
uv run pytest tests/api/test_post_tags_repository.py tests/api/test_posts_access_guard.py tests/api/test_post_summaries_api.py tests/api/test_openapi_docs.py tests/api/test_post_series_context_api.py tests/api/test_posts_admin_edit_delete.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app/schemas/post.py apps/api/src/app/repositories/post_repository.py apps/api/src/app/api/v1/endpoints/posts.py apps/api/src/app/services/post_service.py
git commit -m "feat(api): expose locale on post schemas, repository, and endpoints"
```

---

### Task 5: Backend — translation provider seam, markdown masking, `PostTranslationService`

Add the provider-agnostic translation service. The first provider is `NoopTranslationProvider`; real providers can plug in later via the `TranslationProvider` Protocol.

**Files:**
- Create: `apps/api/src/app/services/translation_provider.py` — `TranslationProvider` Protocol + `NoopTranslationProvider`
- Create: `apps/api/src/app/services/post_translation_markdown.py` — masking helpers (fenced/inline code, URLs, image/media tags)
- Create: `apps/api/src/app/services/post_translation_service.py` — `PostTranslationService.sync_source_post(post)`
- Create: `apps/api/tests/services/test_post_translation_service.py`
- Create: `apps/api/tests/services/test_post_translation_markdown.py`
- Create: `apps/api/tests/services/test_post_service_translation_sync.py`
- Modify: `apps/api/src/app/services/post_service.py` — accept optional `translation_service`, call `_sync_translations` on create/update
- Modify: `apps/api/src/app/api/deps.py` — wire `PostTranslationService(provider=NoopTranslationProvider())`

- [ ] **Step 1: Restore the three new service files from the stash**

These files are pure additions and untouched on main:

```bash
git show 'stash@{0}^3:apps/api/src/app/services/translation_provider.py' > apps/api/src/app/services/translation_provider.py
git show 'stash@{0}^3:apps/api/src/app/services/post_translation_markdown.py' > apps/api/src/app/services/post_translation_markdown.py
git show 'stash@{0}^3:apps/api/src/app/services/post_translation_service.py' > apps/api/src/app/services/post_translation_service.py
```

Read each one — confirm the public surface:

- `translation_provider.py`: `class TranslationProvider(Protocol)`, `class NoopTranslationProvider`.
- `post_translation_markdown.py`: `mask_markdown(text) -> tuple[masked, restorations]`, `restore_markdown(text, restorations)`.
- `post_translation_service.py`: `class PostTranslationService(provider: TranslationProvider)` with `sync_source_post(post: Post) -> list[Post]`.

- [ ] **Step 2: Restore the test files from the stash**

```bash
git show 'stash@{0}^3:apps/api/tests/services/test_post_translation_service.py' > apps/api/tests/services/test_post_translation_service.py
git show 'stash@{0}^3:apps/api/tests/services/test_post_translation_markdown.py' > apps/api/tests/services/test_post_translation_markdown.py
git show 'stash@{0}^3:apps/api/tests/services/test_post_service_translation_sync.py' > apps/api/tests/services/test_post_service_translation_sync.py
mkdir -p apps/api/tests/services
```

(If `tests/services/` does not yet have `__init__.py` and the project uses one, add it.)

- [ ] **Step 3: Wire `PostService` and `deps.py`**

In `apps/api/src/app/services/post_service.py`, add a constructor param + `_sync_translations`:

```python
class PostService:
    def __init__(
        self,
        repo: PostRepository,
        translation_service: "PostTranslationService | None" = None,
    ) -> None:
        self.repo = repo
        self.translation_service = translation_service

    def _sync_translations(self, post) -> None:
        if self.translation_service is None:
            return
        locale = str(getattr(post, "locale", "") or "").strip().lower()
        source_post_id = getattr(post, "source_post_id", None)
        if locale != "ko" or source_post_id is not None:
            return
        try:
            self.translation_service.sync_source_post(post)
        except Exception:  # noqa: BLE001 — translation failures must not block source save
            return
```

Call `self._sync_translations(created)` after `self.repo.create(payload)` and `self._sync_translations(updated)` after the update path. Use `from app.services.post_translation_service import PostTranslationService`.

In `apps/api/src/app/api/deps.py`:

```python
from app.services.post_translation_service import PostTranslationService
from app.services.translation_provider import NoopTranslationProvider

def get_post_service(db: Session = Depends(get_db)) -> PostService:
    return PostService(
        repo=PostRepository(db),
        translation_service=PostTranslationService(provider=NoopTranslationProvider()),
    )
```

- [ ] **Step 4: Run the new tests**

```bash
cd apps/api
uv run pytest tests/services/ -q
```

Expected: PASS.

- [ ] **Step 5: Run the full backend test suite as a regression check**

```bash
uv run pytest -q
```

Expected: PASS — no existing tests broken by translation wiring.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app/services/translation_provider.py apps/api/src/app/services/post_translation_markdown.py apps/api/src/app/services/post_translation_service.py apps/api/src/app/services/post_service.py apps/api/src/app/api/deps.py apps/api/tests/services/
git commit -m "feat(api): introduce PostTranslationService seam with Noop provider"
```

---

### Task 6: Web — i18n & SEO helper libraries

Pure additions. Untouched by main.

**Files:**
- Create: `apps/web/src/lib/i18n/locales.ts`
- Create: `apps/web/src/lib/i18n/pathnames.ts`
- Create: `apps/web/src/lib/seo/localized-urls.ts`

- [ ] **Step 1: Restore from stash**

```bash
mkdir -p apps/web/src/lib/i18n apps/web/src/lib/seo
git show 'stash@{0}^3:apps/web/src/lib/i18n/locales.ts' > apps/web/src/lib/i18n/locales.ts
git show 'stash@{0}^3:apps/web/src/lib/i18n/pathnames.ts' > apps/web/src/lib/i18n/pathnames.ts
git show 'stash@{0}^3:apps/web/src/lib/seo/localized-urls.ts' > apps/web/src/lib/seo/localized-urls.ts
```

- [ ] **Step 2: Verify exports**

Open each file. Confirm:

- `locales.ts` exports `SUPPORTED_PUBLIC_LOCALES`, `DEFAULT_PUBLIC_LOCALE`, type `PublicLocale`, `isSupportedPublicLocale`, `normalizePublicLocale`.
- `pathnames.ts` exports `buildLocalizedBlogIndexPath(locale)`, `buildLocalizedBlogPostPath(locale, slug)` (used by `BlogPost.astro` in Task 8).
- `localized-urls.ts` exports `buildLocalizedAlternates({ pathnameByLocale, canonicalBase })` returning `{ hrefLang, href }[]` with an `x-default` entry.

If any of those is missing or named differently, **stop and reconcile** — Task 8/Task 9 depend on them.

- [ ] **Step 3: Type-check**

```bash
cd apps/web
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/i18n/ apps/web/src/lib/seo/
git commit -m "feat(web): add i18n locales, pathname, and SEO alternate helpers"
```

---

### Task 7: Web — failing locale routing & SEO tests

Add tests that pin route + head behavior, then implement layout changes in Task 8.

**Files:**
- Create: `apps/web/tests/locale-routing-and-seo.test.mjs`
- Modify: `apps/web/tests/public-routing-and-head.test.mjs` — add hreflang/alternate assertions
- Modify: `apps/web/tests/blog-archive-ui.test.mjs` — add locale prop + localized href assertions
- Modify: `apps/web/tests/blog-post-navigation.test.mjs` — add localized blog index path assertions

- [ ] **Step 1: Restore the new test file from stash**

```bash
git show 'stash@{0}^3:apps/web/tests/locale-routing-and-seo.test.mjs' > apps/web/tests/locale-routing-and-seo.test.mjs
```

- [ ] **Step 2: Apply test deltas to the three existing test files**

Apply only the test-file portions of the stash diff:

```bash
git stash show -p stash@{0} -- apps/web/tests/ > /tmp/translations-web-tests.patch
git apply --3way /tmp/translations-web-tests.patch
```

If `--3way` reports a conflict, resolve manually — the assertions only add lines and shouldn't conflict, but the SEO refactor on main may have changed nearby lines.

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd apps/web
node --test tests/locale-routing-and-seo.test.mjs tests/public-routing-and-head.test.mjs tests/blog-archive-ui.test.mjs tests/blog-post-navigation.test.mjs
```

Expected: FAIL on hreflang/locale assertions (no implementation yet) but PASS for unrelated assertions.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/
git commit -m "test(web): pin locale routing, hreflang, and localized link contracts"
```

---

### Task 8: Web — locale-aware `BaseHead`, `BaseLayout`, `BlogPost` (re-derive on top of main)

This is the hardest task. Main rewrote `BaseHead.astro` and `BaseLayout.astro` for SEO settings (commit `98cc4e6`) and `BlogPost.astro` for article structured data. **Do not apply the stash diff blindly.** Read current main and add locale support on top.

**Files:**
- Modify: `apps/web/src/components/BaseHead.astro` — accept `locale?: string` and `alternates?: Array<{ hrefLang; href }>`, use locale to drive `<meta property="og:locale">` and emit `<link rel="alternate" hreflang>` for each alternate
- Modify: `apps/web/src/layouts/BaseLayout.astro` — accept `locale?: string` and `alternates?` props, render `<html lang={locale}>`, pass props to `BaseHead`
- Modify: `apps/web/src/layouts/BlogPost.astro` — accept `locale?: string` and `alternates?`, replace hardcoded `/blog/` hrefs with `buildLocalizedBlogIndexPath(locale)` and series links with `buildLocalizedBlogPostPath(locale, ...)`, forward locale + alternates to `BaseLayout`

- [ ] **Step 1: Read current main `BaseHead.astro`**

Open `apps/web/src/components/BaseHead.astro`. Note where `og:locale` is set (currently hardcoded `"ko_KR"`), where canonical is computed, and where the file ends. Plan the merge: locale prop replaces hardcoded locale for `og:locale` (map `ko→ko_KR`, `en→en_US`, `ja→ja_JP`, `zh→zh_CN`).

- [ ] **Step 2: Modify `BaseHead.astro`**

Add to the `Props` interface:

```typescript
interface Props {
  title: string;
  description: string;
  image?: ImageMetadata;
  locale?: string;
  alternates?: Array<{
    hrefLang: string;
    href: URL | string;
  }>;
}
```

Destructure `locale = 'ko'` and `alternates = []` from `Astro.props`. Add an OG-locale map:

```typescript
const OG_LOCALE_BY_LOCALE: Record<string, string> = {
  ko: 'ko_KR',
  en: 'en_US',
  ja: 'ja_JP',
  zh: 'zh_CN',
};
const ogLocale = OG_LOCALE_BY_LOCALE[locale] ?? 'ko_KR';
```

Replace the hardcoded `og:locale` content with `{ogLocale}`. After the existing `<link rel="canonical">`, add:

```astro
{alternates.map((alternate) => (
  <link
    rel="alternate"
    hreflang={alternate.hrefLang}
    href={alternate.href instanceof URL ? alternate.href.toString() : new URL(String(alternate.href), canonicalBase).toString()}
  />
))}
```

- [ ] **Step 3: Modify `BaseLayout.astro`**

Add `locale?: string` and `alternates?` to `Props`. Replace the hardcoded `<html lang="ko">` with `<html lang={locale ?? 'ko'}>` and pass both props through to `<BaseHead ... locale={locale} alternates={alternates} />`.

- [ ] **Step 4: Modify `BlogPost.astro`**

At the top of the script section, import:

```typescript
import {
  buildLocalizedBlogIndexPath,
  buildLocalizedBlogPostPath,
} from "../lib/i18n/pathnames";
```

Add `locale?: string` and `alternates?` to the `Props` interface, destructure with `locale = "ko"`, `alternates = []`. Compute `const localizedBlogIndexPath = buildLocalizedBlogIndexPath(locale);`. Replace the two `href="/blog/"` occurrences in archive-back nav with `href={localizedBlogIndexPath}`. Replace `href={\`/blog/${seriesPost.slug}\`}` with `href={buildLocalizedBlogPostPath(locale, seriesPost.slug)}`. Forward `locale={locale} alternates={alternates}` to `<BaseLayout>`.

- [ ] **Step 5: Run the failing tests from Task 7**

```bash
cd apps/web
node --test tests/locale-routing-and-seo.test.mjs tests/public-routing-and-head.test.mjs tests/blog-post-navigation.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Type-check & smoke build**

```bash
npm run typecheck
npm run build
```

Expected: PASS. Build still produces the existing `/blog/` routes (those aren't redirected yet — Task 10).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/BaseHead.astro apps/web/src/layouts/BaseLayout.astro apps/web/src/layouts/BlogPost.astro
git commit -m "feat(web): make base head/layout/post locale-aware with hreflang alternates"
```

---

### Task 9: Web — locale-prefixed routes, locale-aware `blog-db`, archive island, post card

Add the canonical `/[locale]/blog/...` pages and propagate `locale` through the data layer and shared components.

**Files:**
- Create: `apps/web/src/pages/[locale]/blog/index.astro` — restored from stash with **strict locale 404**
- Create: `apps/web/src/pages/[locale]/blog/[...slug].astro` — restored from stash with **strict locale 404**
- Modify: `apps/web/src/lib/blog-db.ts` — add `locale?: string` to `DbPost`, `DbPostSummary`, `PublishedQueryOptions`/`PublishedPostSummaryQueryOptions`; pass `locale` query param to backend
- Modify: `apps/web/src/pages/internal-api/posts/summary.ts` — read `locale` from `searchParams`, forward
- Modify: `apps/web/src/components/PostCard.astro` — accept `locale?: string`, build hrefs as `/${locale}/blog/${slug}/`
- Modify: `apps/web/src/components/public/BlogArchiveFilters.tsx` — accept `locale` prop, include it in summary requests and post-link hrefs

- [ ] **Step 1: Restore `[locale]` pages and tighten locale validation**

```bash
mkdir -p "apps/web/src/pages/[locale]/blog"
git show 'stash@{0}^3:apps/web/src/pages/[locale]/blog/index.astro' > "apps/web/src/pages/[locale]/blog/index.astro"
git show 'stash@{0}^3:apps/web/src/pages/[locale]/blog/[...slug].astro' > "apps/web/src/pages/[locale]/blog/[...slug].astro"
```

In each restored file, **replace** the silent `normalizePublicLocale(Astro.params.locale)` call with strict validation:

```typescript
import { isSupportedPublicLocale, type PublicLocale } from "../../../lib/i18n/locales";

const rawLocale = Astro.params.locale;
if (!rawLocale || !isSupportedPublicLocale(rawLocale)) {
  return new Response(null, { status: 404 });
}
const locale: PublicLocale = rawLocale;
```

(Path depth: `index.astro` is `pages/[locale]/blog/index.astro` → 3 `..`; `[...slug].astro` is the same.)

- [ ] **Step 2: Modify `blog-db.ts`**

Apply only the `lib/blog-db.ts` portion of the stash diff carefully — main has rewritten this file (±135 lines). Use the stash hunks as a guide but resolve into current main shape:

- Add `locale?: string` to `DbPost`, `DbPostSummary`.
- Add `locale?: string` to whatever option object `listPublishedDbPostSummaryPage` and `getPublishedDbPostBySlug` accept.
- In the request URL builders, append `params.set('locale', normalizedLocale)` when present.

```bash
cd apps/web
npm run typecheck
```

Resolve any type errors before continuing.

- [ ] **Step 3: Modify `pages/internal-api/posts/summary.ts`**

Add:

```typescript
const locale = url.searchParams.get("locale")?.trim().toLowerCase() ?? "";
```

Pass `locale` into the `listPublishedDbPostSummaryPage(...)` options.

- [ ] **Step 4: Modify `PostCard.astro`**

Add `locale?: string` to `Props`, default `"ko"`, compute `const localizedPostHref = \`/${locale}/blog/${post.slug}/\`;`, replace both `href={\`/blog/${post.slug}/\`}` occurrences with `href={localizedPostHref}`.

- [ ] **Step 5: Modify `BlogArchiveFilters.tsx`**

Add `locale?: string` to `BlogArchiveFiltersProps`, default `"ko"`. In `buildSummaryRequestUrl`, accept `locale: string` and `params.set("locale", locale.trim().toLowerCase())` when truthy. In the post-link rendering, use `href={\`/${locale}/blog/${post.slug}/\`}`. Add `locale` to the `useEffect` dependency array used for refresh.

- [ ] **Step 6: Wire `[locale]/blog/index.astro` to pass locale into the archive island and into summary fetches**

In the restored `index.astro`, ensure the call to `listPublishedDbPostSummaryPage({ ..., locale })` passes the `locale` const, and `<BlogArchiveFilters ... locale={locale} />` receives it. Build `alternates` via `buildLocalizedAlternates({ pathnameByLocale: Object.fromEntries(SUPPORTED_PUBLIC_LOCALES.map((l) => [l, \`/${l}/blog/\`])), canonicalBase: new URL(SITE_URL) })` and pass through to `<BaseLayout>`.

- [ ] **Step 7: Run tests**

```bash
cd apps/web
node --test tests/locale-routing-and-seo.test.mjs tests/blog-archive-ui.test.mjs tests/blog-post-navigation.test.mjs
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Manual smoke**

```bash
npm run dev
```

Visit `http://localhost:4321/ko/blog/`, `/en/blog/`, `/ja/blog/`, `/zh/blog/`, `/xx/blog/` (must 404). Confirm `<html lang>` matches each locale, `<link rel="alternate">` tags appear, and post cards link to `/${locale}/blog/${slug}/`.

- [ ] **Step 9: Commit**

```bash
git add "apps/web/src/pages/[locale]" apps/web/src/lib/blog-db.ts apps/web/src/pages/internal-api/posts/summary.ts apps/web/src/components/PostCard.astro apps/web/src/components/public/BlogArchiveFilters.tsx
git commit -m "feat(web): add locale-prefixed blog routes and propagate locale through data layer"
```

---

### Task 10: Web — redirect legacy `/blog/...` → `/ko/blog/...`

The design doc allows removing unprefixed public routes. Use 301 redirects so external links and SEO continue to resolve.

**Files:**
- Modify: `apps/web/src/pages/blog/index.astro` — replace contents with a 301 redirect to `/ko/blog/`
- Modify: `apps/web/src/pages/blog/[...slug].astro` — replace contents with a 301 redirect to `/ko/blog/${slug}/`

- [ ] **Step 1: Replace `apps/web/src/pages/blog/index.astro`**

```astro
---
return Astro.redirect("/ko/blog/", 301);
---
```

- [ ] **Step 2: Replace `apps/web/src/pages/blog/[...slug].astro`**

```astro
---
const slug = Astro.params.slug ?? "";
return Astro.redirect(`/ko/blog/${slug}/`, 301);
---
```

- [ ] **Step 3: Smoke test**

```bash
cd apps/web
npm run dev
curl -I http://localhost:4321/blog/
curl -I http://localhost:4321/blog/some-slug/
```

Expected: `HTTP/1.1 301 Moved Permanently`, `Location: /ko/blog/...`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/blog/
git commit -m "feat(web): 301 legacy /blog routes to /ko/blog"
```

---

### Task 11: Admin writer — locale-aware payload (Task 7 in original plan)

The admin writer is source-first per the design. We just need the writer to send `locale='ko'` (and let backend defaults handle the group/source linkage).

**Files:**
- Modify: `apps/web/src/lib/admin/new-post-page/types.ts` — add optional `locale?: string` (default `"ko"`) on the publish-settings/draft type
- Modify: `apps/web/src/lib/admin/new-post-page/posts-api.ts` — include `locale` field in the `PostCreate` request body
- Modify: `apps/web/src/lib/admin/new-post-page/submit.ts` — default `locale = "ko"` on submit
- Modify: existing admin writer tests if they assert the JSON payload shape (`apps/web/tests/admin-writer-script.test.mjs`)

- [ ] **Step 1: Read current files**

Open the three writer files. Find the type definition for the post draft, the function that builds the create/update payload, and the submit handler.

- [ ] **Step 2: Add `locale: "ko"` default to the create payload**

Wherever the request body for `POST /api/v1/posts` is assembled, add `locale: "ko"` as a default if not present. Same for the update path.

- [ ] **Step 3: Run admin writer tests**

```bash
cd apps/web
node --test tests/admin-writer-script.test.mjs tests/admin-writer-page.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/admin/new-post-page/
git commit -m "feat(web): default admin writer to ko locale on post create/update"
```

---

### Task 12: Language toggle, sitemap alternates, final verification

**Files:**
- Create: `apps/web/src/components/public/LanguageToggle.astro` — explicit locale switch links built from current path
- Modify: `apps/web/src/layouts/BlogPost.astro` — render `<LanguageToggle locale={locale} alternates={alternates} />`
- Modify: `apps/web/src/pages/[locale]/blog/index.astro` — render `<LanguageToggle ... />` near the archive header
- Modify: `apps/web/astro.config.mjs` — if a sitemap integration is configured, ensure `i18n` (or `customPages`) emits all four locale prefixes for blog/index and blog/[slug]
- Modify: existing sitemap generator (`apps/web/src/pages/sitemap-*.xml.ts` or wherever sitemap is produced)

- [ ] **Step 1: Locate the sitemap generator**

```bash
cd apps/web
ls src/pages/ | grep -i sitemap
cat astro.config.mjs
```

Identify whether the sitemap is produced via `@astrojs/sitemap` integration (config-only) or a custom route. The next steps depend on which.

- [ ] **Step 2 (sitemap integration path): Configure i18n in `astro.config.mjs`**

If `@astrojs/sitemap` is in the integrations list, configure:

```javascript
sitemap({
  i18n: {
    defaultLocale: 'ko',
    locales: { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' },
  },
}),
```

If a custom sitemap route exists, instead append per-locale URLs for every blog post: emit `/ko/blog/<slug>/`, `/en/blog/<slug>/`, `/ja/blog/<slug>/`, `/zh/blog/<slug>/` and add `<xhtml:link rel="alternate" hreflang>` for each.

- [ ] **Step 3: Build `LanguageToggle.astro`**

```astro
---
import { SUPPORTED_PUBLIC_LOCALES } from "../../lib/i18n/locales";

interface Props {
  locale: string;
  alternates: Array<{ hrefLang: string; href: URL | string }>;
}

const { locale, alternates } = Astro.props;
const visible = alternates.filter((a) => a.hrefLang !== "x-default" && a.hrefLang !== locale);
---
<nav aria-label="Language" class="flex gap-2 text-xs text-slate-500">
  {visible.map((alt) => (
    <a class="underline-offset-2 hover:underline" hreflang={alt.hrefLang} href={alt.href.toString()}>
      {alt.hrefLang}
    </a>
  ))}
</nav>
```

- [ ] **Step 4: Render `LanguageToggle` in `BlogPost.astro` and `[locale]/blog/index.astro`**

Place near the archive nav / metadata block. Pass `locale` and `alternates` through.

- [ ] **Step 5: Verify all targeted tests**

```bash
cd apps/api
uv run pytest -q

cd ../web
node --test
npm run typecheck
npm run build
```

Expected: PASS across the board.

- [ ] **Step 6: Manual verification**

Run `npm run dev`, then verify:

- `/ko/blog/foo/` and `/en/blog/foo/` render with correct `<html lang>`, `og:locale`, and `<link rel="alternate">` tags.
- Language toggle links route to sibling locales without 500.
- Sitemap (`/sitemap-index.xml` or similar) lists all four locale URLs per post.
- `curl -I /blog/` returns 301 to `/ko/blog/`.

- [ ] **Step 7: Drop the stash**

```bash
git stash list
git stash drop stash@{0}
```

The `.local/translations-stash.patch` backup remains on disk if recovery is ever needed.

- [ ] **Step 8: Final commit + open PR (optional, ask user before pushing)**

```bash
git add apps/web/src/components/public/LanguageToggle.astro apps/web/src/layouts/BlogPost.astro "apps/web/src/pages/[locale]/blog/index.astro" apps/web/astro.config.mjs apps/web/src/pages/sitemap*.ts
git commit -m "feat(web): add language toggle and sitemap alternates"
```

Do **not** push or open a PR without confirmation from the user.

---

## Self-review checklist (run before handing off)

- [ ] Migration revision id (`20260503_0013`) and `down_revision` (`20260324_0012`) match the current chain — verify with `uv run alembic heads`.
- [ ] No file is restored verbatim from `stash@{0}` if main has diverged. Confirm specifically: `BaseHead.astro`, `BaseLayout.astro`, `BlogPost.astro`, `repositories/post_repository.py`, `lib/blog-db.ts` all written on top of current main, not the stash parent.
- [ ] `[locale]/blog/index.astro` and `[...slug].astro` 404 unknown locales (no silent normalize).
- [ ] `LanguageToggle.astro` does not link to `x-default` and skips the current locale.
- [ ] Admin and internal API routes (`/api/v1/...`, `/internal-api/...`, `/admin/...`) are **not** locale-prefixed.
- [ ] Legacy `/blog/...` routes return 301 to `/ko/blog/...`.
- [ ] All tests in `apps/api/tests/` and `apps/web/tests/` pass; `npm run typecheck` and `npm run build` are green.
- [ ] No accidental commits to `main`. Branch is `feature/site-translations`.

---

## Out of scope (follow-up plans)

The design doc applies locale prefixing to home, blog archive/detail, **projects index/detail**, and **series index/detail**. This plan covers blog only — matching the stash's scope. Projects and series locale-prefixing should be a separate plan once this lands. The i18n / SEO helpers (Task 6) are designed to be reusable for those.

---

## Risks tracked

- **Provider config**: `NoopTranslationProvider` is currently constructed in `get_post_service` per-request. When a real provider lands (e.g., Anthropic), move construction to a module-level singleton or app-state so credential loading happens once.
- **SSR-only routes**: The repo runs Astro in SSR mode (`output: 'server'`). `[locale]/blog/...` works as dynamic routes. If anyone later switches to hybrid/static, add `getStaticPaths()` enumerating `SUPPORTED_PUBLIC_LOCALES`.
- **Translation status / source kind unused at the start**: Columns are added per the design doc but no code writes anything but defaults. That's intentional — the columns exist so the future provider integration doesn't require another migration. Cheaper to add now.
- **Internal links elsewhere**: Other components (footer, related-posts widgets, RSS) may still hardcode `/blog/...`. The 301 redirect catches them at request time, but Task 12 manual verification should at least click through the public navigation once to surface broken links.
