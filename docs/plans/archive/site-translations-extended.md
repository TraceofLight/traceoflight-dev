# Site Translations Extended Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing blog-only multilingual coverage to home, projects, and series — including locale-prefixed routes, full DeepL-backed translation of project bodies and series metadata, and a typed UI dictionary that translates every hard-coded chrome string.

**Architecture:** Generalize the existing post translation worker into a strategy-based pipeline so `Post` and `Series` share the same hash → translate → upsert flow. Add locale + translation metadata to `series` (mirroring the existing `posts` schema). Build a typed `Dictionary` (one TS file per locale) for hard-coded UI text, structurally enforced by `typeof ko`. Mount five new locale-prefixed Astro routes (home, projects index/detail, series index/detail) and 301-redirect their unprefixed legacy paths.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, rq, DeepL SDK, Astro 5 (SSR), TypeScript, React, Node test runner, pytest, fakeredis.

**Reference:** `docs/plans/site-translations-extended-design.md` — architectural decisions and rationale.

---

## Pre-flight

- **Worktree:** `D:\Projects\Github\traceoflight-dev\.worktrees\site-translations-extended` (branch `feature/site-translations-extended`).
- **Authorization:** user has explicitly authorized free action on non-main branches. Don't push, don't merge to main.
- **Existing assets** (already on this branch's parent commit):
  - `posts.locale`, translation linkage columns, alembic migrations 0013/0014/0015 — landed.
  - `apps/api/src/app/services/{translation_provider,translation_queue,translation_worker,post_translation_service,post_translation_markdown,translation_hash,deepl_translation_provider}.py` — landed.
  - `apps/web/src/lib/i18n/{locales,pathnames}.ts`, `apps/web/src/lib/seo/localized-urls.ts` — landed.
  - `apps/web/src/pages/[locale]/blog/*` and legacy `/blog/*` redirects — landed.
  - `LanguageToggle.astro`, locale-aware sitemap — landed.
- **Latest alembic head**: `20260504_0015` (slug-locale composite). New migrations chain off this.
- **All `git` commands assume cwd = repo root inside the worktree.** Test commands prefixed `cd apps/api` or `cd apps/web` are scoped to that step; return to worktree root before any subsequent `git add`.

---

## File map

### Backend — new

```
apps/api/src/app/services/translation_strategy.py
apps/api/src/app/services/series_translation_service.py
apps/api/alembic/versions/20260504_0016_add_series_locales.py
apps/api/tests/services/test_translation_strategy.py
apps/api/tests/services/test_series_translation_service.py
apps/api/tests/services/test_series_translation_worker.py
apps/api/tests/api/test_series_locale_filter.py
```

### Backend — modify

```
apps/api/src/app/services/translation_worker.py     (dispatch on kind)
apps/api/src/app/services/translation_queue.py      (kind argument)
apps/api/src/app/services/post_translation_service.py  (uses queue.enqueue with kind="post")
apps/api/src/app/api/deps.py                        (wire series translation service)
apps/api/src/app/services/series_service.py        (call sync on create/update)
apps/api/src/app/repositories/series_repository.py (locale filtering)
apps/api/src/app/models/series.py                   (locale columns + __table_args__)
apps/api/src/app/schemas/series.py                  (locale fields)
apps/api/src/app/api/v1/endpoints/series.py        (admin reorder ko-only)
```

### Frontend — new

```
apps/web/src/lib/i18n/dict/ko.ts          (source of truth)
apps/web/src/lib/i18n/dict/en.ts
apps/web/src/lib/i18n/dict/ja.ts
apps/web/src/lib/i18n/dict/zh.ts
apps/web/src/lib/i18n/dictionary.ts       (pickDictionary helper)
apps/web/src/lib/i18n/format.ts           (Intl date formatter)
apps/web/src/pages/[locale]/index.astro
apps/web/src/pages/[locale]/projects/index.astro
apps/web/src/pages/[locale]/projects/[slug].astro
apps/web/src/pages/[locale]/series/index.astro
apps/web/src/pages/[locale]/series/[slug].astro
apps/web/tests/dictionary.test.mjs
apps/web/tests/locale-pages-extended.test.mjs
```

### Frontend — modify

```
apps/web/src/pages/index.astro                     (replace with 301 → /ko/)
apps/web/src/pages/projects/index.astro            (301 → /ko/projects/)
apps/web/src/pages/projects/[slug].astro           (301 → /ko/projects/${slug}/)
apps/web/src/pages/series/index.astro              (301 → /ko/series/)
apps/web/src/pages/series/[slug].astro             (301 → /ko/series/${slug}/)
apps/web/src/pages/sitemap.xml.ts                  (home/projects/series locale alternates)
apps/web/src/components/PostCard.astro             (dictionary-driven labels)
apps/web/src/components/public/BlogArchiveFilters.tsx
apps/web/src/components/public/LanguageToggle.astro
apps/web/src/layouts/BlogPost.astro                (dictionary-driven layout chrome)
apps/web/src/components/EmptyStateNotice.astro     (if hard-coded Korean)
apps/web/src/pages/404.astro                       (dictionary-driven copy)
apps/web/src/lib/admin/new-post-page/...            (no change — admin stays Korean)
```

---

### Task 1: Worker generalization — `TranslationStrategy` protocol + `PostTranslationStrategy`

Refactor the existing post-only worker into a strategy-based pipeline so series can plug in without copy-paste.

**Files:**
- Create: `apps/api/src/app/services/translation_strategy.py`
- Create: `apps/api/tests/services/test_translation_strategy.py`
- Modify: `apps/api/src/app/services/translation_worker.py`

- [ ] **Step 1: Write failing strategy unit tests**

`apps/api/tests/services/test_translation_strategy.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.post import (
    Post, PostContentKind, PostLocale, PostStatus, PostTranslationSourceKind,
    PostTranslationStatus, PostVisibility,
)
from app.services.translation_hash import compute_source_hash
from app.services.translation_strategy import PostTranslationStrategy


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        yield db


def _korean_post(db: Session, slug: str = "p", body: str = "안녕") -> Post:
    p = Post(
        slug=slug, title="제목", excerpt="짧음", body_markdown=body,
        cover_image_url=None, content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED, visibility=PostVisibility.PUBLIC,
        locale=PostLocale.KO, translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        published_at=datetime.now(timezone.utc),
    )
    db.add(p); db.commit(); db.refresh(p); return p


def test_post_strategy_load_source_returns_post(session) -> None:
    p = _korean_post(session)
    strategy = PostTranslationStrategy()
    loaded = strategy.load_source(session, p.id)
    assert loaded is not None and loaded.id == p.id


def test_post_strategy_is_translatable_for_korean_source(session) -> None:
    p = _korean_post(session)
    strategy = PostTranslationStrategy()
    assert strategy.is_translatable_source(p) is True


def test_post_strategy_skips_non_korean(session) -> None:
    p = _korean_post(session); p.locale = PostLocale.EN; session.commit()
    strategy = PostTranslationStrategy()
    assert strategy.is_translatable_source(p) is False


def test_post_strategy_compute_hash_matches_helper(session) -> None:
    p = _korean_post(session)
    strategy = PostTranslationStrategy()
    expected = compute_source_hash(title=p.title, excerpt=p.excerpt, body_markdown=p.body_markdown)
    assert strategy.compute_source_hash(p) == expected


def test_post_strategy_upsert_creates_sibling_with_translation(session) -> None:
    p = _korean_post(session)
    strategy = PostTranslationStrategy()
    sibling = strategy.upsert_sibling(
        session, source=p, sibling=None, target_locale=PostLocale.EN,
        translated_fields={"title": "T", "excerpt": "E", "body_markdown": "B"},
        source_hash="abc",
    )
    assert sibling.title == "T" and sibling.locale == PostLocale.EN
    assert sibling.translation_status == PostTranslationStatus.SYNCED
    assert sibling.translation_source_kind == PostTranslationSourceKind.MACHINE


def test_post_strategy_upsert_replicates_project_profile(session) -> None:
    """When the source has a project_profile, the sibling must mirror it."""
    from app.models.post import ProjectProfile  # adjust import to actual location
    p = _korean_post(session)
    p.content_kind = PostContentKind.PROJECT
    profile = ProjectProfile(
        post_id=p.id, period_label="2026.05", role_summary="dev",
        project_intro="intro", card_image_url="x", highlights_json=[],
        resource_links_json=[],
    )
    session.add(profile); session.commit()
    strategy = PostTranslationStrategy()
    sibling = strategy.upsert_sibling(
        session, source=p, sibling=None, target_locale=PostLocale.EN,
        translated_fields={"title": "T", "excerpt": None, "body_markdown": "B"},
        source_hash="abc",
    )
    session.commit()
    assert sibling.project_profile is not None
    assert sibling.project_profile.period_label == "2026.05"
    assert sibling.project_profile.role_summary == "dev"
```

(Adjust the `ProjectProfile` import path to match the actual module — search the codebase if needed.)

- [ ] **Step 2: Run tests; confirm fail**

```bash
cd apps/api
.venv/Scripts/python -m pytest tests/services/test_translation_strategy.py -q
```

Expected: ImportError on `translation_strategy`.

- [ ] **Step 3: Implement `translation_strategy.py`**

Create `apps/api/src/app/services/translation_strategy.py`. Define a `Protocol` + `PostTranslationStrategy` concrete class. Move the existing post-specific upsert logic (currently in `translation_worker._upsert_sibling` and `_mark_failed`) into the post strategy, and add `project_profile` replication.

```python
"""Strategy interface for translating different kinds of records (post, series).
The translation worker invokes a strategy to load, hash, translate, and upsert
sibling rows for any translatable record, keeping a single shared mask → DeepL
→ unmask → upsert pipeline."""

from __future__ import annotations

import uuid
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.post import (
    Post, PostLocale, PostTranslationSourceKind, PostTranslationStatus,
)
from app.services.translation_hash import compute_source_hash


class TranslationStrategy(Protocol):
    kind: str

    def load_source(self, db: Session, source_id: uuid.UUID) -> Any | None: ...
    def is_translatable_source(self, source: Any) -> bool: ...
    def find_sibling(self, db: Session, source: Any, target_locale: PostLocale) -> Any | None: ...
    def compute_source_hash(self, source: Any) -> str: ...
    def get_translatable_fields(self, source: Any) -> dict[str, str | None]: ...
    def upsert_sibling(
        self, db: Session, *, source, sibling, target_locale, translated_fields, source_hash,
    ) -> Any: ...
    def mark_failed(self, db: Session, *, source, target_locale, source_hash) -> None: ...


class PostTranslationStrategy:
    kind = "post"

    def load_source(self, db, source_id):
        return db.scalar(select(Post).where(Post.id == source_id))

    def is_translatable_source(self, source) -> bool:
        if source is None:
            return False
        if source.locale != PostLocale.KO:
            return False
        if source.source_post_id is not None:
            return False
        return True

    def find_sibling(self, db, source, target_locale):
        return db.scalar(
            select(Post).where(
                Post.translation_group_id == source.translation_group_id,
                Post.locale == target_locale,
            )
        )

    def compute_source_hash(self, source) -> str:
        return compute_source_hash(
            title=source.title, excerpt=source.excerpt, body_markdown=source.body_markdown,
        )

    def get_translatable_fields(self, source) -> dict[str, str | None]:
        return {
            "title": source.title,
            "excerpt": source.excerpt,
            "body_markdown": source.body_markdown,
        }

    def upsert_sibling(self, db, *, source, sibling, target_locale, translated_fields, source_hash):
        if sibling is None:
            sibling = Post(
                slug=source.slug, locale=target_locale,
                translation_group_id=source.translation_group_id,
                source_post_id=source.id,
                translation_source_kind=PostTranslationSourceKind.MACHINE,
            )
            db.add(sibling)
        # Always sync non-translated fields from source
        sibling.cover_image_url = source.cover_image_url
        sibling.top_media_kind = source.top_media_kind
        sibling.top_media_image_url = source.top_media_image_url
        sibling.top_media_youtube_url = source.top_media_youtube_url
        sibling.top_media_video_url = source.top_media_video_url
        sibling.series_title = source.series_title
        sibling.content_kind = source.content_kind
        sibling.status = source.status
        sibling.visibility = source.visibility
        sibling.published_at = source.published_at
        if translated_fields is not None:
            sibling.title = translated_fields["title"]
            sibling.excerpt = translated_fields["excerpt"]
            sibling.body_markdown = translated_fields["body_markdown"]
            sibling.translated_from_hash = source_hash
            sibling.translation_status = PostTranslationStatus.SYNCED
        elif sibling.translated_from_hash != source_hash:
            sibling.translated_from_hash = source_hash
        # Replicate project_profile when present
        self._sync_project_profile(db, source=source, sibling=sibling)
        return sibling

    def _sync_project_profile(self, db, *, source, sibling) -> None:
        source_profile = getattr(source, "project_profile", None)
        if source_profile is None:
            return
        # Lazy import to avoid circular deps
        from app.models.post import ProjectProfile  # adjust import
        target_profile = getattr(sibling, "project_profile", None)
        if target_profile is None:
            target_profile = ProjectProfile(post_id=sibling.id)
            db.add(target_profile)
        for field in (
            "period_label", "role_summary", "project_intro", "card_image_url",
            "highlights_json", "resource_links_json", "youtube_url", "detail_video_url",
            "detail_image_url", "detail_media_kind",
        ):
            if hasattr(source_profile, field):
                setattr(target_profile, field, getattr(source_profile, field))

    def mark_failed(self, db, *, source, target_locale, source_hash) -> None:
        sibling = self.find_sibling(db, source, target_locale)
        if sibling is None:
            sibling = Post(
                slug=source.slug, locale=target_locale,
                translation_group_id=source.translation_group_id,
                source_post_id=source.id,
                title=source.title, excerpt=source.excerpt,
                body_markdown=source.body_markdown,
                cover_image_url=source.cover_image_url,
                top_media_kind=source.top_media_kind,
                top_media_image_url=source.top_media_image_url,
                top_media_youtube_url=source.top_media_youtube_url,
                top_media_video_url=source.top_media_video_url,
                series_title=source.series_title,
                content_kind=source.content_kind,
                status=source.status, visibility=source.visibility,
                published_at=source.published_at,
                translation_source_kind=PostTranslationSourceKind.MACHINE,
            )
            db.add(sibling)
        sibling.translation_status = PostTranslationStatus.FAILED
```

(Adjust the `ProjectProfile` import path to match the actual module. If the codebase puts it in `app.models.project_profile` or similar, use that.)

- [ ] **Step 4: Refactor `translation_worker.py` to use the strategy**

Replace post-specific calls with strategy dispatch:

```python
"""rq job: translate one source record (post or series) into one target locale.
Strategy-driven so each kind owns load/hash/upsert details."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from typing import Any, Generator

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.post import PostLocale, PostTranslationStatus
from app.services.post_translation_markdown import (
    mask_markdown_translation_segments, unmask_markdown_translation_segments,
)
from app.services.translation_provider import (
    NoopTranslationProvider, TranslationProvider,
)
from app.services.translation_strategy import (
    PostTranslationStrategy, TranslationStrategy,
)

_LOCALE_BY_KEY = {"en": PostLocale.EN, "ja": PostLocale.JA, "zh": PostLocale.ZH}


def _strategies() -> dict[str, TranslationStrategy]:
    # Lazy series strategy import — added in Task 7
    strategies: dict[str, TranslationStrategy] = {"post": PostTranslationStrategy()}
    try:
        from app.services.translation_strategy import SeriesTranslationStrategy
        strategies["series"] = SeriesTranslationStrategy()
    except ImportError:
        pass
    return strategies


@contextmanager
def _open_session() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _get_provider() -> TranslationProvider:
    if not settings.deepl_api_key:
        return NoopTranslationProvider()
    from app.services.deepl_translation_provider import DeeplTranslationProvider
    return DeeplTranslationProvider(api_key=settings.deepl_api_key)


def translate_to_locale(kind: str, source_id: str, target_locale: str) -> None:
    target_locale_enum = _LOCALE_BY_KEY.get(target_locale)
    if target_locale_enum is None:
        raise ValueError(f"unsupported target locale {target_locale!r}")
    strategy = _strategies().get(kind)
    if strategy is None:
        raise ValueError(f"unknown translation kind {kind!r}")

    with _open_session() as db:
        source = strategy.load_source(db, uuid.UUID(source_id))
        if source is None or not strategy.is_translatable_source(source):
            return
        sibling = strategy.find_sibling(db, source, target_locale_enum)
        source_hash = strategy.compute_source_hash(source)

        needs_translation = (
            sibling is None
            or sibling.translation_status == PostTranslationStatus.FAILED
            or sibling.translated_from_hash != source_hash
        )

        try:
            translated = _translate(strategy, source, target_locale) if needs_translation else None
            if needs_translation and translated is None:
                return
            strategy.upsert_sibling(
                db, source=source, sibling=sibling,
                target_locale=target_locale_enum,
                translated_fields=translated, source_hash=source_hash,
            )
            db.commit()
        except Exception:
            db.rollback()
            strategy.mark_failed(
                db, source=source, target_locale=target_locale_enum, source_hash=source_hash,
            )
            db.commit()
            raise


def _translate(
    strategy: TranslationStrategy, source: Any, target_locale: str,
) -> dict[str, Any] | None:
    fields = strategy.get_translatable_fields(source)
    body_text = fields.get("body_markdown") or ""
    masked = mask_markdown_translation_segments(body_text)

    class _MaskedView:
        title = fields.get("title")
        excerpt = fields.get("excerpt")
        body_markdown = masked.text

    provider = _get_provider()
    result = provider.translate_post(_MaskedView(), target_locale)
    if result is None:
        return None
    body = result.get("body_markdown", "") or ""
    if masked.replacements:
        body = unmask_markdown_translation_segments(body, masked.replacements)
    return {
        "title": result.get("title", "") or "",
        "excerpt": result.get("excerpt"),
        "body_markdown": body,
    }


# Backwards-compat alias for callers / rq jobs already in flight
def translate_post_to_locale(source_post_id: str, target_locale: str) -> None:
    translate_to_locale("post", source_post_id, target_locale)
```

The `translate_post_to_locale` shim keeps any in-flight rq job referring to the old function name from breaking. New enqueues should use `translate_to_locale` via the queue helper updated in Task 4.

- [ ] **Step 5: Run all backend tests; confirm green**

```bash
cd apps/api
.venv/Scripts/python -m pytest -q
```

Expected: 192 (existing) + 6 (new strategy tests) ≈ 198 passed. Existing post worker tests must still pass — they test through `translate_post_to_locale` which now delegates.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app/services/translation_strategy.py \
        apps/api/src/app/services/translation_worker.py \
        apps/api/tests/services/test_translation_strategy.py
git commit -m "refactor(api): generalize translation worker via strategy protocol"
```

---

### Task 2: `TranslationQueue` accepts `kind` argument

Add a `kind` parameter so callers explicitly enqueue post jobs vs series jobs. Default to `"post"` for backwards compatibility.

**Files:**
- Modify: `apps/api/src/app/services/translation_queue.py`
- Modify: `apps/api/tests/services/test_translation_queue.py`
- Modify: `apps/api/src/app/services/post_translation_service.py`

- [ ] **Step 1: Update `translation_queue.py`**

```python
"""Thin sync wrapper around rq for translation jobs."""

from __future__ import annotations

import uuid
from typing import Any

from rq import Queue
from rq.job import Job

_JOB_FUNC_PATH = "app.services.translation_worker.translate_to_locale"


class TranslationQueue:
    def __init__(self, *, connection: Any, name: str = "translations") -> None:
        self._queue = Queue(name=name, connection=connection)

    def enqueue_translation_job(
        self, *, source_post_id: uuid.UUID | str, target_locale: str, kind: str = "post",
    ) -> Job:
        return self._queue.enqueue(_JOB_FUNC_PATH, kind, str(source_post_id), target_locale)
```

- [ ] **Step 2: Update existing queue tests + add `kind` test**

In `apps/api/tests/services/test_translation_queue.py`, update existing assertions on `func_name` / `args` to match the new function path and signature, and add:

```python
def test_enqueue_with_kind_series(fake_redis) -> None:
    queue = TranslationQueue(connection=fake_redis, name="translations")
    job = queue.enqueue_translation_job(
        source_post_id=uuid.uuid4(), target_locale="ja", kind="series",
    )
    assert job.func_name == "app.services.translation_worker.translate_to_locale"
    assert job.args[0] == "series"


def test_enqueue_default_kind_is_post(fake_redis) -> None:
    queue = TranslationQueue(connection=fake_redis, name="translations")
    job = queue.enqueue_translation_job(
        source_post_id=uuid.uuid4(), target_locale="en",
    )
    assert job.args[0] == "post"
```

- [ ] **Step 3: Run focused tests**

```bash
cd apps/api
.venv/Scripts/python -m pytest tests/services/test_translation_queue.py -q
```

Expected: 6 passed (4 original + 2 new).

- [ ] **Step 4: Run full backend suite**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: same green count as Task 1, no regressions. The `PostTranslationService.sync_source_post` calls `enqueue_translation_job` without `kind=` — defaulting to `"post"` keeps existing behavior identical.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/services/translation_queue.py \
        apps/api/tests/services/test_translation_queue.py
git commit -m "feat(api): TranslationQueue carries kind (post|series) on enqueue"
```

---

### Task 3: Series locale migration (`20260504_0016_add_series_locales`)

Mirror the posts schema on the series table.

**Files:**
- Create: `apps/api/alembic/versions/20260504_0016_add_series_locales.py`
- Modify: `apps/api/src/app/models/series.py`

- [ ] **Step 1: Inspect current `series` schema**

```bash
grep -n "Mapped\|UniqueConstraint\|__table_args__\|^class Series\|slug:" \
  apps/api/src/app/models/series.py
```

Note the slug declaration and any existing constraints. The new migration must use the actual existing constraint name when dropping uniqueness.

Also locate existing series migrations to confirm the chain:

```bash
ls apps/api/alembic/versions/ | grep -i series
```

- [ ] **Step 2: Add columns to the model**

In `apps/api/src/app/models/series.py`, add `import uuid`, add `ForeignKey, UniqueConstraint` to the existing sqlalchemy import, add the new columns inside `class Series(...)` after the existing fields:

```python
locale: Mapped[PostLocale] = mapped_column(
    Enum(PostLocale, name="post_locale", values_callable=_enum_values),
    index=True, nullable=False, default=PostLocale.KO,
)
translation_group_id: Mapped[uuid.UUID] = mapped_column(
    index=True, nullable=False, default=uuid.uuid4,
)
source_series_id: Mapped[uuid.UUID | None] = mapped_column(
    ForeignKey("series.id", ondelete="SET NULL"), nullable=True, index=True,
)
translation_status: Mapped[PostTranslationStatus] = mapped_column(
    Enum(PostTranslationStatus, name="post_translation_status", values_callable=_enum_values),
    nullable=False, default=PostTranslationStatus.SOURCE,
)
translation_source_kind: Mapped[PostTranslationSourceKind] = mapped_column(
    Enum(PostTranslationSourceKind, name="post_translation_source_kind", values_callable=_enum_values),
    nullable=False, default=PostTranslationSourceKind.MANUAL,
)
translated_from_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
```

(`PostLocale`, `PostTranslationStatus`, `PostTranslationSourceKind`, `_enum_values` are imported from `app.models.post`. Series and Post share the enum types — reusing the same Postgres enum types is intentional.)

Drop the existing single-column slug uniqueness from the model declaration (if `unique=True` is on slug). Add `__table_args__` with composite UNIQUE on `(slug, locale)`:

```python
__table_args__ = (
    UniqueConstraint("slug", "locale", name="uq_series_slug_locale"),
)
```

- [ ] **Step 3: Write migration**

`apps/api/alembic/versions/20260504_0016_add_series_locales.py`:

```python
"""add series locale + translation linkage

Revision ID: 20260504_0016
Revises: 20260504_0015
Create Date: 2026-05-04 14:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260504_0016"
down_revision = "20260504_0015"
branch_labels = None
depends_on = None


# UPDATE this if Step 1 revealed a different existing constraint/index name on series.slug
LEGACY_SERIES_SLUG_INDEX_NAME = "ix_series_slug"
COMPOSITE_UNIQUE_NAME = "uq_series_slug_locale"


def upgrade() -> None:
    locale_enum = sa.Enum("ko", "en", "ja", "zh", name="post_locale", create_type=False)
    status_enum = sa.Enum("source", "synced", "stale", "failed", name="post_translation_status", create_type=False)
    kind_enum = sa.Enum("manual", "machine", name="post_translation_source_kind", create_type=False)

    op.add_column("series", sa.Column("locale", locale_enum, nullable=True))
    op.add_column("series", sa.Column("translation_group_id", sa.Uuid(), nullable=True))
    op.add_column("series", sa.Column("source_series_id", sa.Uuid(), nullable=True))
    op.add_column("series", sa.Column("translation_status", status_enum, nullable=True))
    op.add_column("series", sa.Column("translation_source_kind", kind_enum, nullable=True))
    op.add_column("series", sa.Column("translated_from_hash", sa.String(length=64), nullable=True))

    op.execute("""
        UPDATE series
        SET locale = 'ko',
            translation_group_id = id,
            translation_status = 'source',
            translation_source_kind = 'manual'
        WHERE locale IS NULL
    """)

    op.alter_column("series", "locale", nullable=False)
    op.alter_column("series", "translation_group_id", nullable=False)
    op.alter_column("series", "translation_status", nullable=False)
    op.alter_column("series", "translation_source_kind", nullable=False)

    op.create_index("ix_series_locale", "series", ["locale"])
    op.create_index("ix_series_translation_group_id", "series", ["translation_group_id"])
    op.create_index("ix_series_source_series_id", "series", ["source_series_id"])
    op.create_foreign_key(
        "fk_series_source_series_id_series",
        "series", "series", ["source_series_id"], ["id"], ondelete="SET NULL",
    )

    # Replace single-column slug uniqueness with (slug, locale) composite
    op.drop_index(LEGACY_SERIES_SLUG_INDEX_NAME, table_name="series")
    op.create_unique_constraint(COMPOSITE_UNIQUE_NAME, "series", ["slug", "locale"])


def downgrade() -> None:
    op.drop_constraint(COMPOSITE_UNIQUE_NAME, "series", type_="unique")
    op.create_index(LEGACY_SERIES_SLUG_INDEX_NAME, "series", ["slug"], unique=True)

    op.drop_constraint("fk_series_source_series_id_series", "series", type_="foreignkey")
    op.drop_index("ix_series_source_series_id", table_name="series")
    op.drop_index("ix_series_translation_group_id", table_name="series")
    op.drop_index("ix_series_locale", table_name="series")

    op.drop_column("series", "translated_from_hash")
    op.drop_column("series", "translation_source_kind")
    op.drop_column("series", "translation_status")
    op.drop_column("series", "source_series_id")
    op.drop_column("series", "translation_group_id")
    op.drop_column("series", "locale")
```

The enum types (`post_locale`, `post_translation_status`, `post_translation_source_kind`) already exist from migration 0013 — `create_type=False` reuses them.

- [ ] **Step 4: Verify offline `--sql`**

```bash
cd apps/api
SQLALCHEMY_URL="postgresql+psycopg://stub@localhost/stub" \
ADMIN_SESSION_SECRET=test ADMIN_LOGIN_ID=test ADMIN_LOGIN_PASSWORD_HASH=test \
.venv/Scripts/python -m alembic upgrade 20260504_0015:20260504_0016 --sql 2>&1 | tail -30
```

Expected: `ALTER TABLE series ADD COLUMN locale ...`, `UPDATE series SET locale='ko', ...`, `ALTER TABLE series ALTER COLUMN locale SET NOT NULL`, three `CREATE INDEX`, `ADD CONSTRAINT`, `DROP INDEX ix_series_slug`, `ADD CONSTRAINT uq_series_slug_locale`.

If Step 1 revealed a different legacy constraint name on series.slug, update `LEGACY_SERIES_SLUG_INDEX_NAME` in the migration before this step.

- [ ] **Step 5: Run full pytest; confirm no regressions**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: same green count.

- [ ] **Step 6: Commit**

```bash
git add apps/api/alembic/versions/20260504_0016_add_series_locales.py \
        apps/api/src/app/models/series.py
git commit -m "feat(api): add locale + translation linkage columns to series"
```

---

### Task 4: `SeriesTranslationStrategy`

**Files:**
- Modify: `apps/api/src/app/services/translation_strategy.py` (add `SeriesTranslationStrategy` class)
- Modify: `apps/api/tests/services/test_translation_strategy.py` (add series strategy tests)

- [ ] **Step 1: Write failing series strategy tests**

Append to `apps/api/tests/services/test_translation_strategy.py`:

```python
from app.models.series import Series  # adjust if model lives elsewhere
from app.services.translation_strategy import SeriesTranslationStrategy


def _korean_series(db: Session, slug: str = "s") -> Series:
    s = Series(
        slug=slug, title="시리즈", description="설명",
        cover_image_url=None, post_count=0,
        locale=PostLocale.KO, translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
    )
    db.add(s); db.commit(); db.refresh(s); return s


def test_series_strategy_load_source(session) -> None:
    s = _korean_series(session)
    strategy = SeriesTranslationStrategy()
    loaded = strategy.load_source(session, s.id)
    assert loaded is not None and loaded.id == s.id


def test_series_strategy_skips_non_korean(session) -> None:
    s = _korean_series(session); s.locale = PostLocale.EN; session.commit()
    strategy = SeriesTranslationStrategy()
    assert strategy.is_translatable_source(s) is False


def test_series_strategy_translatable_fields_includes_title_and_description(session) -> None:
    s = _korean_series(session)
    strategy = SeriesTranslationStrategy()
    fields = strategy.get_translatable_fields(s)
    assert fields == {"title": "시리즈", "excerpt": None, "body_markdown": "설명"}


def test_series_strategy_upsert_creates_sibling(session) -> None:
    s = _korean_series(session)
    strategy = SeriesTranslationStrategy()
    sibling = strategy.upsert_sibling(
        session, source=s, sibling=None, target_locale=PostLocale.JA,
        translated_fields={"title": "シリーズ", "excerpt": None, "body_markdown": "説明"},
        source_hash="abc",
    )
    session.commit()
    assert sibling.title == "シリーズ"
    assert sibling.description == "説明"
    assert sibling.locale == PostLocale.JA
    assert sibling.translation_status == PostTranslationStatus.SYNCED
    assert sibling.cover_image_url == s.cover_image_url
```

- [ ] **Step 2: Run; confirm fail**

```bash
cd apps/api
.venv/Scripts/python -m pytest tests/services/test_translation_strategy.py -q
```

Expected: ImportError on `SeriesTranslationStrategy`.

- [ ] **Step 3: Implement `SeriesTranslationStrategy`**

Append to `apps/api/src/app/services/translation_strategy.py`:

```python
from app.models.series import Series  # adjust import path


class SeriesTranslationStrategy:
    """Translate series rows. Maps:
      title       <-> title
      description <-> body_markdown (the worker's mask/unmask treats this as body)
      (no excerpt — series have no excerpt field)
    Non-translated metadata (cover_image_url, post_count, etc.) is synced to the
    sibling on every run."""

    kind = "series"

    def load_source(self, db, source_id):
        return db.scalar(select(Series).where(Series.id == source_id))

    def is_translatable_source(self, source) -> bool:
        if source is None:
            return False
        if source.locale != PostLocale.KO:
            return False
        if source.source_series_id is not None:
            return False
        return True

    def find_sibling(self, db, source, target_locale):
        return db.scalar(
            select(Series).where(
                Series.translation_group_id == source.translation_group_id,
                Series.locale == target_locale,
            )
        )

    def compute_source_hash(self, source) -> str:
        return compute_source_hash(
            title=source.title, excerpt=None, body_markdown=source.description or "",
        )

    def get_translatable_fields(self, source) -> dict[str, str | None]:
        return {
            "title": source.title,
            "excerpt": None,
            "body_markdown": source.description or "",
        }

    def upsert_sibling(self, db, *, source, sibling, target_locale, translated_fields, source_hash):
        if sibling is None:
            sibling = Series(
                slug=source.slug, locale=target_locale,
                translation_group_id=source.translation_group_id,
                source_series_id=source.id,
                translation_source_kind=PostTranslationSourceKind.MACHINE,
            )
            db.add(sibling)
        # Sync non-translated fields
        sibling.cover_image_url = source.cover_image_url
        sibling.post_count = source.post_count
        # Other non-translated columns the Series model has (e.g. order_index)
        # should also be copied here. Keep this list mirrored to the model.
        if hasattr(source, "order_index"):
            sibling.order_index = source.order_index

        if translated_fields is not None:
            sibling.title = translated_fields["title"]
            # Description maps from body_markdown
            sibling.description = translated_fields["body_markdown"]
            sibling.translated_from_hash = source_hash
            sibling.translation_status = PostTranslationStatus.SYNCED
        elif sibling.translated_from_hash != source_hash:
            sibling.translated_from_hash = source_hash
        return sibling

    def mark_failed(self, db, *, source, target_locale, source_hash) -> None:
        sibling = self.find_sibling(db, source, target_locale)
        if sibling is None:
            sibling = Series(
                slug=source.slug, locale=target_locale,
                translation_group_id=source.translation_group_id,
                source_series_id=source.id,
                title=source.title, description=source.description,
                cover_image_url=source.cover_image_url,
                post_count=source.post_count,
                translation_source_kind=PostTranslationSourceKind.MACHINE,
            )
            db.add(sibling)
        sibling.translation_status = PostTranslationStatus.FAILED
```

(Adjust the `Series` import path. If the Series model has additional non-translated columns the test fixture didn't show, add them to the sync block above.)

- [ ] **Step 4: Run tests; confirm pass**

```bash
.venv/Scripts/python -m pytest tests/services/test_translation_strategy.py -q
```

Expected: 4 (post strategy) + 4 (series strategy) = 8 passed.

- [ ] **Step 5: Run full backend suite**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: full suite green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app/services/translation_strategy.py \
        apps/api/tests/services/test_translation_strategy.py
git commit -m "feat(api): add SeriesTranslationStrategy"
```

---

### Task 5: `SeriesTranslationService` + deps wiring

Mirror `PostTranslationService` for series.

**Files:**
- Create: `apps/api/src/app/services/series_translation_service.py`
- Create: `apps/api/tests/services/test_series_translation_service.py`
- Modify: `apps/api/src/app/api/deps.py`

- [ ] **Step 1: Write failing service tests**

`apps/api/tests/services/test_series_translation_service.py`:

```python
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from app.services.series_translation_service import (
    SeriesTranslationService, SERIES_TARGET_LOCALES,
)


@dataclass
class _Series:
    id: Any
    locale: str
    source_series_id: Any | None = None
    title: str = "t"
    description: str = "d"


class _StubQueue:
    def __init__(self) -> None:
        self.calls: list[tuple[Any, str, str]] = []

    def enqueue_translation_job(self, *, source_post_id, target_locale, kind):
        self.calls.append((source_post_id, target_locale, kind))
        return ("enqueued", source_post_id, target_locale, kind)


def test_sync_source_series_enqueues_3_jobs() -> None:
    queue = _StubQueue()
    svc = SeriesTranslationService(queue=queue)
    s = _Series(id=uuid.uuid4(), locale="ko")
    result = svc.sync_source_series(s)
    assert len(result) == len(SERIES_TARGET_LOCALES)
    assert all(call[2] == "series" for call in queue.calls)
    assert [c[1] for c in queue.calls] == list(SERIES_TARGET_LOCALES)


def test_sync_skips_non_korean() -> None:
    queue = _StubQueue()
    svc = SeriesTranslationService(queue=queue)
    s = _Series(id=uuid.uuid4(), locale="en")
    assert svc.sync_source_series(s) == []


def test_sync_skips_translation_variants() -> None:
    queue = _StubQueue()
    svc = SeriesTranslationService(queue=queue)
    s = _Series(id=uuid.uuid4(), locale="ko", source_series_id=uuid.uuid4())
    assert svc.sync_source_series(s) == []


def test_sync_no_queue_is_noop() -> None:
    svc = SeriesTranslationService(queue=None)
    s = _Series(id=uuid.uuid4(), locale="ko")
    assert svc.sync_source_series(s) == []


def test_sync_handles_orm_str_enum_locale() -> None:
    """Same regression guard as the post side: PostLocale.KO must compare equal to 'ko'."""
    from app.models.post import PostLocale
    @dataclass
    class _OrmSeries:
        id: Any; locale: PostLocale; source_series_id: Any | None = None
    queue = _StubQueue()
    svc = SeriesTranslationService(queue=queue)
    s = _OrmSeries(id=uuid.uuid4(), locale=PostLocale.KO)
    assert len(svc.sync_source_series(s)) == 3
```

- [ ] **Step 2: Run; confirm fail**

```bash
.venv/Scripts/python -m pytest tests/services/test_series_translation_service.py -q
```

Expected: ImportError.

- [ ] **Step 3: Implement service**

`apps/api/src/app/services/series_translation_service.py`:

```python
"""Coordinator: when a Korean source series is created/updated, enqueue one
translation job per target locale onto the translation queue."""

from __future__ import annotations

from typing import Any

SERIES_TARGET_LOCALES = ("en", "ja", "zh")


class SeriesTranslationService:
    def __init__(self, queue: Any | None = None) -> None:
        self.queue = queue

    def sync_source_series(self, series) -> list[Any]:  # type: ignore[no-untyped-def]
        if self.queue is None:
            return []
        locale_obj = getattr(series, "locale", None)
        locale_raw = getattr(locale_obj, "value", locale_obj)
        locale = str(locale_raw or "").strip().lower()
        source_series_id = getattr(series, "source_series_id", None)
        if locale != "ko" or source_series_id is not None:
            return []
        jobs: list[Any] = []
        for target_locale in SERIES_TARGET_LOCALES:
            jobs.append(
                self.queue.enqueue_translation_job(
                    source_post_id=getattr(series, "id"),
                    target_locale=target_locale,
                    kind="series",
                )
            )
        return jobs
```

- [ ] **Step 4: Wire into deps.py**

In `apps/api/src/app/api/deps.py`, add to the existing translation queue setup:

```python
from app.services.series_translation_service import SeriesTranslationService

# (… existing _get_translation_queue() …)

def get_series_translation_service() -> SeriesTranslationService:
    return SeriesTranslationService(queue=_get_translation_queue())
```

And update `get_series_service` (or wherever `SeriesService` is constructed) to receive this:

```python
def get_series_service(db: Session = Depends(get_db)) -> SeriesService:
    return SeriesService(
        repo=SeriesRepository(db),
        translation_service=get_series_translation_service(),
    )
```

`SeriesService` will gain the `translation_service` parameter in Task 6.

- [ ] **Step 5: Run focused tests**

```bash
.venv/Scripts/python -m pytest tests/services/test_series_translation_service.py -q
```

Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app/services/series_translation_service.py \
        apps/api/tests/services/test_series_translation_service.py \
        apps/api/src/app/api/deps.py
git commit -m "feat(api): add SeriesTranslationService and deps wiring"
```

---

### Task 6: `SeriesService` triggers translation on create/update

**Files:**
- Modify: `apps/api/src/app/services/series_service.py`
- Modify: `apps/api/tests/services/test_series_service.py` (or create if absent)

- [ ] **Step 1: Locate the existing `SeriesService` create/update methods**

```bash
grep -n "def create\|def update\|class SeriesService" \
  apps/api/src/app/services/series_service.py
```

Identify the entry points where new/edited series rows are saved.

- [ ] **Step 2: Add `_sync_translations` helper (mirroring PostService)**

In `apps/api/src/app/services/series_service.py`, add:

```python
from app.services.series_translation_service import SeriesTranslationService

class SeriesService:
    def __init__(
        self,
        repo: SeriesRepository,
        translation_service: SeriesTranslationService | None = None,
    ) -> None:
        self.repo = repo
        self.translation_service = translation_service

    def _sync_translations(self, series) -> None:
        if self.translation_service is None:
            return
        locale_obj = getattr(series, "locale", None)
        locale_raw = getattr(locale_obj, "value", locale_obj)
        locale = str(locale_raw or "").strip().lower()
        source_series_id = getattr(series, "source_series_id", None)
        if locale != "ko" or source_series_id is not None:
            return
        try:
            self.translation_service.sync_source_series(series)
        except Exception:
            return
```

In `create_series` (or equivalent), after the repo creates and commits, call `self._sync_translations(created)`. Same for `update_series`.

- [ ] **Step 3: Add a regression test**

```python
# In tests/services/test_series_service.py (create or extend)
from dataclasses import dataclass
import uuid
from app.services.series_service import SeriesService


@dataclass
class _SeriesStub:
    slug: str
    locale: str = "ko"
    source_series_id: uuid.UUID | None = None


class _DbStub:
    def commit(self) -> None: pass


class _RepoStub:
    def __init__(self) -> None:
        self.created = _SeriesStub(slug="s")
        self.db = _DbStub()
    def create(self, payload):  # type: ignore[no-untyped-def]
        return self.created


class _TranslationStub:
    def __init__(self) -> None:
        self.calls: list[str] = []
    def sync_source_series(self, s):
        self.calls.append(s.slug)
        return []


def test_series_service_syncs_translations_on_create() -> None:
    repo = _RepoStub()
    tr = _TranslationStub()
    svc = SeriesService(repo=repo, translation_service=tr)
    svc.create_series(payload=object())  # type: ignore[arg-type]
    assert tr.calls == ["s"]
```

- [ ] **Step 4: Run all backend tests**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: full suite green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/services/series_service.py apps/api/tests/services/
git commit -m "feat(api): SeriesService triggers translation enqueue on create/update"
```

---

### Task 7: Series locale-aware repository + admin reorder filter

**Files:**
- Modify: `apps/api/src/app/repositories/series_repository.py`
- Modify: `apps/api/src/app/api/v1/endpoints/series.py`
- Modify: `apps/api/src/app/schemas/series.py`
- Create: `apps/api/tests/api/test_series_locale_filter.py`

- [ ] **Step 1: Write failing repository test**

`apps/api/tests/api/test_series_locale_filter.py`:

```python
from __future__ import annotations

import uuid
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import admin_credential, media, post, post_comment, series, site_profile, tag  # noqa: F401
from app.models.post import PostLocale, PostTranslationStatus, PostTranslationSourceKind
from app.models.series import Series
from app.repositories.series_repository import SeriesRepository


def _build_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def test_series_list_filters_by_locale() -> None:
    db = _build_session()
    repo = SeriesRepository(db)
    group = uuid.uuid4()
    db.add(Series(
        slug="x", title="원본", description="설명", cover_image_url=None,
        post_count=0, locale=PostLocale.KO, translation_group_id=group,
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
    ))
    db.add(Series(
        slug="x", title="EN", description="EN desc", cover_image_url=None,
        post_count=0, locale=PostLocale.EN, translation_group_id=group,
        source_series_id=None,  # not strictly required for the filter test
        translation_status=PostTranslationStatus.SYNCED,
        translation_source_kind=PostTranslationSourceKind.MACHINE,
    ))
    db.commit()

    ko_only = repo.list(locale=PostLocale.KO)
    en_only = repo.list(locale=PostLocale.EN)
    assert [s.title for s in ko_only] == ["원본"]
    assert [s.title for s in en_only] == ["EN"]


def test_series_admin_reorder_lists_only_korean_sources() -> None:
    """Admin reorder must see one row per series-group (the Korean source)."""
    db = _build_session()
    repo = SeriesRepository(db)
    group = uuid.uuid4()
    db.add(Series(
        slug="x", title="원본", description="설명", cover_image_url=None,
        post_count=0, locale=PostLocale.KO, translation_group_id=group,
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
    ))
    db.add(Series(
        slug="x", title="EN", description="EN desc", cover_image_url=None,
        post_count=0, locale=PostLocale.EN, translation_group_id=group,
        translation_status=PostTranslationStatus.SYNCED,
        translation_source_kind=PostTranslationSourceKind.MACHINE,
    ))
    db.commit()

    sources = repo.list_admin_sources()
    assert [s.title for s in sources] == ["원본"]
```

- [ ] **Step 2: Run; confirm fail**

```bash
.venv/Scripts/python -m pytest tests/api/test_series_locale_filter.py -q
```

- [ ] **Step 3: Implement filter on `SeriesRepository`**

In `apps/api/src/app/repositories/series_repository.py`, add `locale` param to whatever method serves public listing. If the existing method is `list(...)` already, add `locale: PostLocale | None = None` parameter that when set filters `where(Series.locale == locale)`. Add `list_admin_sources()` that returns only `Series.locale == PostLocale.KO` (and `Series.source_series_id is None`).

Concretely, find the method matching the test calls and adjust accordingly. Pattern to mirror is `PostRepository.list` which already has `locale: PostLocale | None = None`.

- [ ] **Step 4: Update schemas to expose locale fields**

In `apps/api/src/app/schemas/series.py`, add `locale: PostLocale = Field(default=PostLocale.KO)`, `translation_group_id: uuid.UUID = Field(...)`, `source_series_id: uuid.UUID | None = None` to the `SeriesRead` and (optionally) `SeriesCreate` schemas, mirroring how `PostRead` exposes them.

- [ ] **Step 5: Update endpoint to accept `?locale=` and admin reorder to use sources-only**

In `apps/api/src/app/api/v1/endpoints/series.py`:
- Public list endpoint: add `locale: PostLocale | None = Query(default=None)` and pass through.
- Admin reorder GET (whatever serves the order panel): replace `repo.list(...)` with `repo.list_admin_sources()` so only Korean source rows appear.

- [ ] **Step 6: Run focused + full**

```bash
.venv/Scripts/python -m pytest tests/api/test_series_locale_filter.py -q
.venv/Scripts/python -m pytest -q
```

Both expected green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/repositories/series_repository.py \
        apps/api/src/app/api/v1/endpoints/series.py \
        apps/api/src/app/schemas/series.py \
        apps/api/tests/api/test_series_locale_filter.py
git commit -m "feat(api): series repository + endpoints accept locale; admin reorder ko-only"
```

---

### Task 8: i18n dictionary scaffolding (Korean source of truth)

**Files:**
- Create: `apps/web/src/lib/i18n/dict/ko.ts`
- Create: `apps/web/src/lib/i18n/dictionary.ts`
- Create: `apps/web/src/lib/i18n/format.ts`

- [ ] **Step 1: Build Korean dictionary**

`apps/web/src/lib/i18n/dict/ko.ts`:

```ts
export const ko = {
  nav: {
    blog: "블로그",
    projects: "프로젝트",
    series: "시리즈",
  },
  footer: {
    copyright: "© TraceofLight",
    builtWith: "Built with Astro",
  },
  buttons: {
    readMore: "더 보기",
    backToList: "목록으로",
    save: "저장하기",
    cancel: "취소",
    delete: "삭제",
    edit: "수정",
    search: "검색",
    loadMore: "더 불러오기",
    retry: "다시 시도",
    viewAll: "전체 보기",
  },
  empty: {
    noPosts: "게시글이 없습니다.",
    noResults: "검색 결과가 없습니다.",
    noProjects: "프로젝트가 없습니다.",
    noSeries: "시리즈가 없습니다.",
  },
  blogPost: {
    backToBlog: "블로그로 돌아가기",
    viewAllPosts: "모든 글 보기",
    relatedSeries: "이 시리즈의 다른 글",
    publishedOn: "작성일",
    updatedOn: "수정일",
    minRead: "분 읽기",
  },
  archiveFilters: {
    searchPlaceholder: "검색어를 입력하세요",
    sort: { latest: "최신순", oldest: "오래된순", title: "제목순" },
    visibility: { all: "전체", public: "공개", private: "비공개" },
  },
  languageToggle: {
    ko: "한국어",
    en: "English",
    ja: "日本語",
    zh: "中文",
  },
  notFound: {
    title: "페이지를 찾을 수 없습니다",
    description: "요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.",
    cta: "홈으로 돌아가기",
  },
  projectDetail: {
    role: "역할",
    period: "기간",
    highlights: "하이라이트",
    resources: "리소스",
  },
  seriesDetail: {
    postCount: "글 개수",
    empty: "이 시리즈에는 아직 글이 없습니다.",
  },
  comments: {
    title: "댓글",
    placeholder: "댓글을 입력하세요",
    submit: "댓글 달기",
    empty: "아직 댓글이 없습니다.",
    deleteConfirm: "정말 삭제하시겠습니까?",
  },
  home: {
    intro: "안녕하세요, TraceofLight입니다.",
    recentPosts: "최근 글",
    seeAllPosts: "모든 글 보기",
  },
} as const;

export type Dictionary = typeof ko;
```

- [ ] **Step 2: Build dictionary helper**

`apps/web/src/lib/i18n/dictionary.ts`:

```ts
import { ko } from "./dict/ko";
import { en } from "./dict/en";
import { ja } from "./dict/ja";
import { zh } from "./dict/zh";
import type { PublicLocale } from "./locales";

export type { Dictionary } from "./dict/ko";

const dictionaries = { ko, en, ja, zh } as const;

export function pickDictionary(locale: PublicLocale): typeof ko {
  return dictionaries[locale];
}
```

- [ ] **Step 3: Build date formatter helper**

`apps/web/src/lib/i18n/format.ts`:

```ts
import type { PublicLocale } from "./locales";

const _LOCALE_TAG: Record<PublicLocale, string> = {
  ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN",
};

export function formatDate(value: Date | string | number, locale: PublicLocale): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(_LOCALE_TAG[locale], {
    year: "numeric", month: "long", day: "numeric",
  }).format(date);
}

export function formatDateTime(value: Date | string | number, locale: PublicLocale): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(_LOCALE_TAG[locale], {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(date);
}
```

- [ ] **Step 4: Commit (en/ja/zh come in next task)**

The build will fail if we run typecheck now because `dictionary.ts` imports from non-existent `./dict/{en,ja,zh}`. Skip typecheck until Task 9 lands those files.

```bash
git add apps/web/src/lib/i18n/dict/ko.ts \
        apps/web/src/lib/i18n/dictionary.ts \
        apps/web/src/lib/i18n/format.ts
git commit -m "feat(web): scaffold typed i18n dictionary (Korean source of truth)"
```

---

### Task 9: Manual translations — `en.ts`, `ja.ts`, `zh.ts`

**Files:**
- Create: `apps/web/src/lib/i18n/dict/en.ts`
- Create: `apps/web/src/lib/i18n/dict/ja.ts`
- Create: `apps/web/src/lib/i18n/dict/zh.ts`

- [ ] **Step 1: Create `en.ts`**

```ts
import type { ko } from "./ko";

export const en: typeof ko = {
  nav: { blog: "Blog", projects: "Projects", series: "Series" },
  footer: { copyright: "© TraceofLight", builtWith: "Built with Astro" },
  buttons: {
    readMore: "Read more", backToList: "Back to list",
    save: "Save", cancel: "Cancel", delete: "Delete", edit: "Edit",
    search: "Search", loadMore: "Load more", retry: "Retry", viewAll: "View all",
  },
  empty: {
    noPosts: "No posts yet.", noResults: "No results found.",
    noProjects: "No projects yet.", noSeries: "No series yet.",
  },
  blogPost: {
    backToBlog: "Back to blog", viewAllPosts: "View all posts",
    relatedSeries: "More from this series",
    publishedOn: "Published", updatedOn: "Updated", minRead: "min read",
  },
  archiveFilters: {
    searchPlaceholder: "Search posts",
    sort: { latest: "Latest", oldest: "Oldest", title: "By title" },
    visibility: { all: "All", public: "Public", private: "Private" },
  },
  languageToggle: { ko: "한국어", en: "English", ja: "日本語", zh: "中文" },
  notFound: {
    title: "Page not found",
    description: "The page you're looking for doesn't exist or has moved.",
    cta: "Back to home",
  },
  projectDetail: {
    role: "Role", period: "Period",
    highlights: "Highlights", resources: "Resources",
  },
  seriesDetail: {
    postCount: "Posts", empty: "This series has no posts yet.",
  },
  comments: {
    title: "Comments", placeholder: "Write a comment",
    submit: "Post comment", empty: "No comments yet.",
    deleteConfirm: "Are you sure you want to delete this?",
  },
  home: {
    intro: "Hello, I'm TraceofLight.",
    recentPosts: "Recent posts", seeAllPosts: "See all posts",
  },
} as const;
```

- [ ] **Step 2: Create `ja.ts`**

```ts
import type { ko } from "./ko";

export const ja: typeof ko = {
  nav: { blog: "ブログ", projects: "プロジェクト", series: "シリーズ" },
  footer: { copyright: "© TraceofLight", builtWith: "Built with Astro" },
  buttons: {
    readMore: "続きを読む", backToList: "一覧へ戻る",
    save: "保存", cancel: "キャンセル", delete: "削除", edit: "編集",
    search: "検索", loadMore: "もっと読み込む", retry: "再試行", viewAll: "すべて表示",
  },
  empty: {
    noPosts: "記事がありません。", noResults: "検索結果がありません。",
    noProjects: "プロジェクトがありません。", noSeries: "シリーズがありません。",
  },
  blogPost: {
    backToBlog: "ブログへ戻る", viewAllPosts: "すべての記事を見る",
    relatedSeries: "このシリーズの他の記事",
    publishedOn: "公開日", updatedOn: "更新日", minRead: "分で読了",
  },
  archiveFilters: {
    searchPlaceholder: "記事を検索",
    sort: { latest: "新しい順", oldest: "古い順", title: "タイトル順" },
    visibility: { all: "すべて", public: "公開", private: "非公開" },
  },
  languageToggle: { ko: "한국어", en: "English", ja: "日本語", zh: "中文" },
  notFound: {
    title: "ページが見つかりません",
    description: "お探しのページは存在しないか、移動した可能性があります。",
    cta: "ホームへ戻る",
  },
  projectDetail: {
    role: "役割", period: "期間",
    highlights: "ハイライト", resources: "リソース",
  },
  seriesDetail: {
    postCount: "記事数", empty: "このシリーズにはまだ記事がありません。",
  },
  comments: {
    title: "コメント", placeholder: "コメントを書く",
    submit: "コメント送信", empty: "まだコメントがありません。",
    deleteConfirm: "本当に削除しますか?",
  },
  home: {
    intro: "こんにちは、TraceofLightです。",
    recentPosts: "最近の記事", seeAllPosts: "すべての記事を見る",
  },
} as const;
```

- [ ] **Step 3: Create `zh.ts`**

```ts
import type { ko } from "./ko";

export const zh: typeof ko = {
  nav: { blog: "博客", projects: "项目", series: "系列" },
  footer: { copyright: "© TraceofLight", builtWith: "Built with Astro" },
  buttons: {
    readMore: "阅读更多", backToList: "返回列表",
    save: "保存", cancel: "取消", delete: "删除", edit: "编辑",
    search: "搜索", loadMore: "加载更多", retry: "重试", viewAll: "查看全部",
  },
  empty: {
    noPosts: "还没有文章。", noResults: "没有搜索结果。",
    noProjects: "还没有项目。", noSeries: "还没有系列。",
  },
  blogPost: {
    backToBlog: "返回博客", viewAllPosts: "查看所有文章",
    relatedSeries: "本系列其他文章",
    publishedOn: "发布", updatedOn: "更新", minRead: "分钟阅读",
  },
  archiveFilters: {
    searchPlaceholder: "搜索文章",
    sort: { latest: "最新", oldest: "最早", title: "按标题" },
    visibility: { all: "全部", public: "公开", private: "私密" },
  },
  languageToggle: { ko: "한국어", en: "English", ja: "日本語", zh: "中文" },
  notFound: {
    title: "页面未找到",
    description: "您查找的页面不存在或已被移动。",
    cta: "返回首页",
  },
  projectDetail: {
    role: "角色", period: "时间",
    highlights: "亮点", resources: "资源",
  },
  seriesDetail: {
    postCount: "文章数", empty: "本系列还没有文章。",
  },
  comments: {
    title: "评论", placeholder: "写下评论",
    submit: "发表评论", empty: "还没有评论。",
    deleteConfirm: "确定要删除吗?",
  },
  home: {
    intro: "你好，我是 TraceofLight。",
    recentPosts: "最近文章", seeAllPosts: "查看所有文章",
  },
} as const;
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/web
npm run typecheck
```

Expected: 0 errors. The `: typeof ko` annotation guarantees structural identity — if any locale is missing a key or has an extra one, this fails.

- [ ] **Step 5: Add a runtime sanity test**

`apps/web/tests/dictionary.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";

test("dictionary modules export same key shape", async () => {
  const { ko } = await import("../src/lib/i18n/dict/ko.ts");
  const { en } = await import("../src/lib/i18n/dict/en.ts");
  const { ja } = await import("../src/lib/i18n/dict/ja.ts");
  const { zh } = await import("../src/lib/i18n/dict/zh.ts");

  function flatten(obj, prefix = "") {
    return Object.entries(obj).flatMap(([k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      return typeof v === "object" && v !== null ? flatten(v, key) : [key];
    });
  }

  const koKeys = flatten(ko).sort();
  for (const [name, dict] of [["en", en], ["ja", ja], ["zh", zh]]) {
    const keys = flatten(dict).sort();
    assert.deepEqual(keys, koKeys, `${name} dictionary key shape diverged from ko`);
  }
});
```

(If the test runner cannot import `.ts` directly, swap to `.mts` proxies or run typecheck instead. Astro projects typically configure `tsx`/`vite-node` for this — check `apps/web/package.json` for an existing pattern.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/i18n/dict/en.ts \
        apps/web/src/lib/i18n/dict/ja.ts \
        apps/web/src/lib/i18n/dict/zh.ts \
        apps/web/tests/dictionary.test.mjs
git commit -m "feat(web): add English/Japanese/Chinese UI dictionaries"
```

---

### Task 10: Refactor existing locale-aware components to consume the dictionary

Replace hard-coded Korean strings in `BlogPost.astro`, `PostCard.astro`, `BlogArchiveFilters.tsx`, `LanguageToggle.astro`, and any other already-locale-aware component.

**Files:**
- Modify: `apps/web/src/layouts/BlogPost.astro`
- Modify: `apps/web/src/components/PostCard.astro`
- Modify: `apps/web/src/components/public/BlogArchiveFilters.tsx`
- Modify: `apps/web/src/components/public/LanguageToggle.astro`

- [ ] **Step 1: BlogPost — replace `블로그로 돌아가기`, `모든 글 보기`, `시리즈` chrome with dictionary**

In the script section, add:
```ts
import { pickDictionary } from "../lib/i18n/dictionary";
const t = pickDictionary(locale as PublicLocale);
```

In the JSX, replace `<span>블로그로 돌아가기</span>` with `<span>{t.blogPost.backToBlog}</span>`, similarly for `모든 글 보기` → `t.blogPost.viewAllPosts`, "이 시리즈의 다른 글" or similar series header → `t.blogPost.relatedSeries`.

- [ ] **Step 2: PostCard — replace `읽기` aria-label and any other Korean copy**

Find existing strings like `aria-label={\`${post.title} 읽기\`}` and replace with locale-aware equivalent — the page passes a `t` prop or PostCard takes `locale` prop and looks up itself. Match whichever pattern is cleanest with the rest of the component.

- [ ] **Step 3: BlogArchiveFilters — sort labels, search placeholder, visibility filter**

Hard-coded Korean strings (e.g., `최신순`, `오래된순`) become `t.archiveFilters.sort.latest`, etc. Pass `t` (or the relevant subtree) as a prop from the consuming Astro page so the React island doesn't need its own dictionary import.

- [ ] **Step 4: LanguageToggle — locale labels via dictionary**

The component currently has a hard-coded `LOCALE_LABELS = { ko: "한국어", en: "English", ja: "日本語", zh: "中文" }` map. Replace with `t.languageToggle.ko`, etc.

- [ ] **Step 5: Run web tests**

```bash
cd apps/web
node --test tests/blog-archive-ui.test.mjs tests/blog-post-navigation.test.mjs tests/locale-routing-and-seo.test.mjs
```

Existing tests assert specific Korean strings are present — they'll fail. Update those assertions to allow either the dictionary lookup pattern or the resulting string for the default ko locale.

For tests that read source files looking for literal Korean strings, change them to look for `t.blogPost.backToBlog` references instead (the source is now indirected through the dictionary).

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/layouts/BlogPost.astro \
        apps/web/src/components/PostCard.astro \
        apps/web/src/components/public/BlogArchiveFilters.tsx \
        apps/web/src/components/public/LanguageToggle.astro \
        apps/web/tests/
git commit -m "feat(web): existing locale-aware components consume i18n dictionary"
```

---

### Task 11: Locale-prefixed home page

**Files:**
- Create: `apps/web/src/pages/[locale]/index.astro`
- Create: `apps/web/tests/locale-pages-extended.test.mjs`

- [ ] **Step 1: Inspect current home page**

```bash
cat apps/web/src/pages/index.astro | head -40
```

Note what data it fetches (recent posts summary, project highlights, etc.) and the chrome (greeting, headers).

- [ ] **Step 2: Write failing route assertion**

Create `apps/web/tests/locale-pages-extended.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("locale-prefixed home page exists with strict locale guard", async () => {
  const src = await readFile("src/pages/[locale]/index.astro", "utf8");
  assert.match(src, /isSupportedPublicLocale/);
  assert.match(src, /Astro\.params\.locale/);
  assert.match(src, /pickDictionary/);
});
```

- [ ] **Step 3: Run; confirm fails (file missing)**

```bash
cd apps/web
node --test tests/locale-pages-extended.test.mjs
```

- [ ] **Step 4: Create `pages/[locale]/index.astro`**

Use the existing home page logic, plus locale param handling:

```astro
---
import BaseLayout from "../../layouts/BaseLayout.astro";
import {
  isSupportedPublicLocale, SUPPORTED_PUBLIC_LOCALES, type PublicLocale,
} from "../../lib/i18n/locales";
import { pickDictionary } from "../../lib/i18n/dictionary";
import { buildLocalizedAlternates } from "../../lib/seo/localized-urls";
import { listPublishedDbPostSummaryPage } from "../../lib/blog-db";
import { SITE_URL } from "../../consts";

const rawLocale = Astro.params.locale;
if (!rawLocale || !isSupportedPublicLocale(rawLocale)) {
  return new Response(null, { status: 404 });
}
const locale: PublicLocale = rawLocale;
const t = pickDictionary(locale);

const summaryPage = await listPublishedDbPostSummaryPage({
  locale, limit: 6, offset: 0, sort: "latest",
}).catch(() => ({ items: [], hasMore: false }));

const alternates = buildLocalizedAlternates(
  Object.fromEntries(SUPPORTED_PUBLIC_LOCALES.map((l) => [l, `/${l}/`])),
  new URL(SITE_URL),
);
---

<BaseLayout
  title={t.nav.blog}
  description={t.home.intro}
  bodyClass="page-home"
  locale={locale}
  alternates={alternates}
>
  <section class="mx-auto max-w-3xl px-4 py-12">
    <h1 class="text-3xl font-semibold">{t.home.intro}</h1>
    <h2 class="mt-12 text-xl font-medium">{t.home.recentPosts}</h2>
    <ul class="mt-4 space-y-3">
      {summaryPage.items.map((post) => (
        <li>
          <a href={`/${locale}/blog/${post.slug}/`} class="hover:underline">
            {post.title}
          </a>
        </li>
      ))}
    </ul>
    <a class="mt-8 inline-block underline" href={`/${locale}/blog/`}>
      {t.home.seeAllPosts}
    </a>
  </section>
</BaseLayout>
```

(Adapt the styling and structure to match the current home page's actual visual design — the snippet above is functional but minimal.)

- [ ] **Step 5: Smoke build + test**

```bash
npm run typecheck
node --test tests/locale-pages-extended.test.mjs
npm run build
```

Expected: 0 type errors, test passes, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/[locale]/index.astro apps/web/tests/locale-pages-extended.test.mjs
git commit -m "feat(web): add locale-prefixed home page"
```

---

### Task 12: Locale-prefixed projects pages

**Files:**
- Create: `apps/web/src/pages/[locale]/projects/index.astro`
- Create: `apps/web/src/pages/[locale]/projects/[slug].astro`
- Modify: `apps/web/tests/locale-pages-extended.test.mjs`

- [ ] **Step 1: Append failing test cases**

In `apps/web/tests/locale-pages-extended.test.mjs`, add:

```javascript
test("locale-prefixed projects index exists with strict locale guard", async () => {
  const src = await readFile("src/pages/[locale]/projects/index.astro", "utf8");
  assert.match(src, /isSupportedPublicLocale/);
  assert.match(src, /listPublishedDbProjects/);
  assert.match(src, /pickDictionary/);
});

test("locale-prefixed project detail page exists with strict locale guard", async () => {
  const src = await readFile("src/pages/[locale]/projects/[slug].astro", "utf8");
  assert.match(src, /isSupportedPublicLocale/);
  assert.match(src, /Astro\.params\.slug/);
});
```

- [ ] **Step 2: Run; confirm fail**

- [ ] **Step 3: Create `[locale]/projects/index.astro`**

Mirror the existing `pages/projects/index.astro` shape, but:
1. Validate `Astro.params.locale` (404 unsupported).
2. Pass `locale` to `listPublishedDbProjects({ locale, ... })` (the projects-db helper needs a `locale?` param mirroring `blog-db`'s — if absent yet, add it).
3. Render with `t = pickDictionary(locale)` for any chrome (`t.empty.noProjects`, `t.nav.projects` page title).
4. Build `alternates` for sitemap/SEO.

- [ ] **Step 4: Create `[locale]/projects/[slug].astro`**

Mirror existing `projects/[slug].astro`. Fetch via locale-aware getter, validate locale, fall back to a 404 if the project doesn't exist for the requested locale (rather than silently returning Korean). Use `t.projectDetail.role`/`period`/`highlights`/`resources` for chrome labels.

If `lib/projects.ts` doesn't accept locale yet, extend it:
```ts
export async function listPublishedDbProjects(options: { locale?: string; ... }): Promise<...> {
  const params = new URLSearchParams({ status: "published", content_kind: "project" });
  if (options.locale) params.set("locale", options.locale);
  // ...
}
```

- [ ] **Step 5: Typecheck + tests + build**

```bash
npm run typecheck
node --test tests/locale-pages-extended.test.mjs
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/[locale]/projects/ \
        apps/web/src/lib/projects.ts \
        apps/web/tests/locale-pages-extended.test.mjs
git commit -m "feat(web): add locale-prefixed project index + detail pages"
```

---

### Task 13: Locale-prefixed series pages

**Files:**
- Create: `apps/web/src/pages/[locale]/series/index.astro`
- Create: `apps/web/src/pages/[locale]/series/[slug].astro`
- Modify: `apps/web/src/lib/series-db.ts` (or equivalent — add `locale` parameter)
- Modify: `apps/web/tests/locale-pages-extended.test.mjs`

- [ ] **Step 1: Append failing tests**

```javascript
test("locale-prefixed series index exists", async () => {
  const src = await readFile("src/pages/[locale]/series/index.astro", "utf8");
  assert.match(src, /isSupportedPublicLocale/);
  assert.match(src, /pickDictionary/);
});

test("locale-prefixed series detail exists", async () => {
  const src = await readFile("src/pages/[locale]/series/[slug].astro", "utf8");
  assert.match(src, /isSupportedPublicLocale/);
  assert.match(src, /Astro\.params\.slug/);
});
```

- [ ] **Step 2: Run; confirm fail**

- [ ] **Step 3: Add `locale` to `lib/series-db.ts`**

```ts
export async function listSeries(options: { locale?: string; limit?: number; offset?: number } = {}) {
  const params = new URLSearchParams();
  if (options.limit != null) params.set("limit", String(options.limit));
  if (options.offset != null) params.set("offset", String(options.offset));
  if (options.locale) params.set("locale", options.locale);
  const response = await requestBackend(`/series?${params.toString()}`);
  // ... existing parsing
}

export async function getSeriesBySlug(slug: string, options: { locale?: string } = {}) {
  const params = new URLSearchParams();
  if (options.locale) params.set("locale", options.locale);
  const response = await requestBackend(`/series/${encodeURIComponent(slug)}?${params.toString()}`);
  // ... existing parsing
}
```

- [ ] **Step 4: Create `[locale]/series/index.astro` + `[slug].astro`**

Standard locale guard + dictionary chrome + locale-aware series fetch. Series detail page lists posts within the series, also filtered to the current locale. Build alternates.

- [ ] **Step 5: Typecheck + tests + build**

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/[locale]/series/ \
        apps/web/src/lib/series-db.ts \
        apps/web/tests/locale-pages-extended.test.mjs
git commit -m "feat(web): add locale-prefixed series index + detail pages"
```

---

### Task 14: Legacy 301 redirects (home, projects, series)

**Files:**
- Modify: `apps/web/src/pages/index.astro`
- Modify: `apps/web/src/pages/projects/index.astro`
- Modify: `apps/web/src/pages/projects/[slug].astro`
- Modify: `apps/web/src/pages/series/index.astro`
- Modify: `apps/web/src/pages/series/[slug].astro`

- [ ] **Step 1: Replace each legacy page with a 301 redirect**

`apps/web/src/pages/index.astro`:
```astro
---
return Astro.redirect("/ko/", 301);
---
```

`apps/web/src/pages/projects/index.astro`:
```astro
---
return Astro.redirect("/ko/projects/", 301);
---
```

`apps/web/src/pages/projects/[slug].astro`:
```astro
---
const slug = Astro.params.slug ?? "";
return Astro.redirect(`/ko/projects/${slug}/`, 301);
---
```

`apps/web/src/pages/series/index.astro`:
```astro
---
return Astro.redirect("/ko/series/", 301);
---
```

`apps/web/src/pages/series/[slug].astro`:
```astro
---
const slug = Astro.params.slug ?? "";
return Astro.redirect(`/ko/series/${slug}/`, 301);
---
```

- [ ] **Step 2: Update / add tests asserting redirects**

In `apps/web/tests/locale-pages-extended.test.mjs`:
```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const REDIRECT_FIXTURES = [
  ["src/pages/index.astro", "/ko/"],
  ["src/pages/projects/index.astro", "/ko/projects/"],
  ["src/pages/projects/[slug].astro", "/ko/projects/${slug}/"],
  ["src/pages/series/index.astro", "/ko/series/"],
  ["src/pages/series/[slug].astro", "/ko/series/${slug}/"],
];

for (const [path, target] of REDIRECT_FIXTURES) {
  test(`${path} 301-redirects to ${target}`, async () => {
    const src = await readFile(path, "utf8");
    assert.match(src, /Astro\.redirect\(/);
    assert.match(src, /301/);
  });
}
```

- [ ] **Step 3: Build + smoke**

```bash
cd apps/web
npm run typecheck
npm run build
```

If you have a local dev environment, additional check:
```bash
npm run dev &
sleep 5
curl -sS -o /dev/null -w "/ HTTP %{http_code} → %{redirect_url}\n" -I http://localhost:4321/
curl -sS -o /dev/null -w "/projects HTTP %{http_code} → %{redirect_url}\n" -I http://localhost:4321/projects
curl -sS -o /dev/null -w "/series HTTP %{http_code} → %{redirect_url}\n" -I http://localhost:4321/series
kill %1 2>/dev/null
```
Expected: 301 redirects to `/ko/...` for each.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/index.astro \
        apps/web/src/pages/projects/index.astro \
        apps/web/src/pages/projects/[slug].astro \
        apps/web/src/pages/series/index.astro \
        apps/web/src/pages/series/[slug].astro \
        apps/web/tests/locale-pages-extended.test.mjs
git commit -m "feat(web): 301-redirect legacy /, /projects/*, /series/* to /ko/..."
```

---

### Task 15: Sitemap — emit per-locale URLs for home, projects, series

**Files:**
- Modify: `apps/web/src/pages/sitemap.xml.ts`
- Modify: `apps/web/tests/sitemap-route.test.mjs`

- [ ] **Step 1: Update sitemap to emit per-locale entries**

Replace existing static entries (`/`, `/projects`, `/series`) with locale-prefixed equivalents. For projects + series, only emit URLs for actual stored sibling rows (matches the existing blog pattern):

```typescript
// in apps/web/src/pages/sitemap.xml.ts

// Home — always 4 locales (page exists for each)
const homeAlternates = buildBlogAlternates((l) => `/${l}/`);
const homeEntries: SitemapEntry[] = SUPPORTED_PUBLIC_LOCALES.map((l) => ({
  path: `/${l}/`,
  alternates: homeAlternates,
}));

// Project entries — one URL per actual stored locale (no alternates emitted
// for partially-translated sets, mirroring the post pattern)
const projectEntries: SitemapEntry[] = projects.map((project) => ({
  path: `/${project.locale ?? "ko"}/projects/${project.slug}/`,
  // no alternates: only emit URLs for rows that actually exist
}));

// Project index — always 4 locales
const projectIndexAlternates = buildBlogAlternates((l) => `/${l}/projects/`);
const projectIndexEntries: SitemapEntry[] = SUPPORTED_PUBLIC_LOCALES.map((l) => ({
  path: `/${l}/projects/`, alternates: projectIndexAlternates,
}));

// Series detail entries — one URL per actual stored locale
const seriesDetailEntries: SitemapEntry[] = series.map((s) => ({
  path: `/${s.locale ?? "ko"}/series/${s.slug}/`,
  lastmod: s.updatedAt.toISOString(),
}));

// Series index — always 4 locales
const seriesIndexAlternates = buildBlogAlternates((l) => `/${l}/series/`);
const seriesIndexEntries: SitemapEntry[] = SUPPORTED_PUBLIC_LOCALES.map((l) => ({
  path: `/${l}/series/`, alternates: seriesIndexAlternates,
}));

const entries: SitemapEntry[] = [
  ...homeEntries,
  ...projectIndexEntries, ...projectEntries,
  ...seriesIndexEntries, ...seriesDetailEntries,
  ...blogIndexEntries, ...postEntries,
];
```

(Adjust to the existing structure of `sitemap.xml.ts`. The functions `buildBlogAlternates` and `SitemapEntry` already exist from the blog work.)

Note: the projects + series detail entries DO NOT carry alternates — the same convention as posts. When/if all four sibling rows exist for a project or series, you can populate alternates via grouping by `translation_group_id`, but until then we emit only what actually exists.

- [ ] **Step 2: Update sitemap test**

In `apps/web/tests/sitemap-route.test.mjs`, extend the mock to return at least one project + one series in addition to the existing post fixture, and add assertions:
- Home: 4 locale URLs
- `/ko/projects/`, `/en/projects/`, `/ja/projects/`, `/zh/projects/` all emitted (index)
- Project detail: only the actual stored locale (e.g., if mock returns only ko, only `/ko/projects/foo/` is emitted)
- Same for series

- [ ] **Step 3: Run sitemap test**

```bash
cd apps/web
node --test tests/sitemap-route.test.mjs
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/sitemap.xml.ts apps/web/tests/sitemap-route.test.mjs
git commit -m "feat(web): sitemap emits per-locale URLs for home, projects, series"
```

---

### Task 16: Backfill projects + series translations

This is a **manual operational step** (not a code change). Run on production after the new code deploys.

**Prerequisites:**
- Tasks 1–15 deployed via Jenkins (api + worker images rebuilt with strategy refactor + series migration applied)
- `DEEPL_API_KEY` set in production `.env.api`

- [ ] **Step 1: Re-enqueue project posts**

```bash
ssh -i "/c/Users/heejun_kim/Desktop/ssh-keys/traceoflight/traceoflight.key" -o BatchMode=yes ubuntu@144.24.82.120 "docker exec -i traceoflight-api python -u" <<'PY'
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.post import Post, PostLocale, PostStatus, PostVisibility, PostContentKind
from app.api.deps import _get_translation_queue

queue = _get_translation_queue()
assert queue is not None, "Redis queue unavailable"
with SessionLocal() as db:
    project_sources = db.scalars(
        select(Post).where(
            Post.locale == PostLocale.KO,
            Post.source_post_id.is_(None),
            Post.status == PostStatus.PUBLISHED,
            Post.visibility == PostVisibility.PUBLIC,
            Post.content_kind == PostContentKind.PROJECT,
        )
    ).all()
    print(f"Project sources: {len(project_sources)}")
    for s in project_sources:
        for t in ("en", "ja", "zh"):
            queue.enqueue_translation_job(
                source_post_id=s.id, target_locale=t, kind="post",
            )
    print(f"Enqueued {len(project_sources) * 3} project translation jobs")
PY
```

- [ ] **Step 2: Enqueue series**

```bash
ssh -i "..." ubuntu@144.24.82.120 "docker exec -i traceoflight-api python -u" <<'PY'
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models.series import Series
from app.models.post import PostLocale
from app.api.deps import _get_translation_queue

queue = _get_translation_queue()
assert queue is not None
with SessionLocal() as db:
    series_sources = db.scalars(
        select(Series).where(
            Series.locale == PostLocale.KO,
            Series.source_series_id.is_(None),
        )
    ).all()
    print(f"Series sources: {len(series_sources)}")
    for s in series_sources:
        for t in ("en", "ja", "zh"):
            queue.enqueue_translation_job(
                source_post_id=s.id, target_locale=t, kind="series",
            )
    print(f"Enqueued {len(series_sources) * 3} series translation jobs")
PY
```

- [ ] **Step 3: Monitor progress**

```bash
ssh -i "..." ubuntu@144.24.82.120 "docker logs -f traceoflight-translation-worker"
```

Or count siblings via DB:
```bash
ssh -i "..." ubuntu@144.24.82.120 "docker exec traceoflight-api python -c '
from sqlalchemy import select, func
from app.db.session import SessionLocal
from app.models.post import Post, PostLocale, PostContentKind
from app.models.series import Series
db = SessionLocal()
print(\"Project siblings:\", db.scalar(select(func.count()).where(Post.content_kind==PostContentKind.PROJECT, Post.locale!=PostLocale.KO)))
print(\"Series siblings:\", db.scalar(select(func.count()).where(Series.locale!=PostLocale.KO)))
'"
```

Expected after worker drains queue: project siblings = 6 (2 projects × 3 locales), series siblings = N × 3 (where N is the existing series count).

- [ ] **Step 4: No commit**

Backfill is a one-time operational step, not a code change.

---

### Task 17: End-to-end live verification

**Prerequisites:** Tasks 1–16 deployed and backfill complete.

- [ ] **Step 1: Each new public surface returns 200 across all four locales**

```bash
for path in / /projects/ /series/ /projects/sky-runner/ /series/<some-existing-slug>/; do
  for loc in ko en ja zh; do
    curl -sS -o /dev/null -w "${loc}${path} HTTP %{http_code}\n" \
      "https://www.traceoflight.dev/${loc}${path}"
  done
done
```

Expected: all 200.

- [ ] **Step 2: Unsupported locale returns 404**

```bash
for path in / /projects/ /series/; do
  curl -sS -o /dev/null -w "/xx${path} HTTP %{http_code}\n" \
    "https://www.traceoflight.dev/xx${path}"
done
```

Expected: 404.

- [ ] **Step 3: Legacy paths redirect**

```bash
for path in / /projects /projects/sky-runner /series; do
  curl -sS -o /dev/null -w "${path} HTTP %{http_code} → %{redirect_url}\n" -I \
    "https://www.traceoflight.dev${path}"
done
```

Expected: 301 to `/ko${path}/`.

- [ ] **Step 4: Sitemap contains expected entries**

```bash
curl -sS https://www.traceoflight.dev/sitemap.xml | head -100
```

Spot-check: home (4 locale roots), at least one project URL per locale that has stored siblings, blog entries.

- [ ] **Step 5: LanguageToggle works on the new pages**

Manually open `/en/projects/sky-runner/` in a browser and click each locale label. Each click should land on the equivalent URL with the correct locale and translated content.

- [ ] **Step 6: Admin reorder UI shows one row per series**

Log in as admin, navigate to series order panel. Confirm only the Korean source rows appear. Each series should appear exactly once regardless of how many sibling locales exist.

- [ ] **Step 7: No commit**

Verification is a one-time check, not a code change. If any step fails, file a follow-up task and fix before merging.

---

## Self-review checklist

- [ ] All 4 dictionaries have identical key shapes (TypeScript-enforced; runtime test in Task 9 confirms).
- [ ] Migration `20260504_0016` revision/down_revision matches the chain.
- [ ] `series` model `__table_args__` and migration both create `uq_series_slug_locale`.
- [ ] `translation_worker.translate_to_locale("post", ...)` produces identical behavior to the old `translate_post_to_locale(...)` for existing posts (Task 1 keeps the alias).
- [ ] All `[locale]/` pages enforce strict 404 on unsupported locales (Task 11–13 use `isSupportedPublicLocale`).
- [ ] Legacy `/`, `/projects/*`, `/series/*` all return 301 to `/ko/...` (Task 14).
- [ ] Sitemap project + series detail entries only emit URLs for actual stored sibling rows (Task 15 mirrors blog pattern).
- [ ] Admin reorder filters to `locale='ko'` (Task 7).
- [ ] Project worker replicates `project_profile` to siblings (Task 1 strategy).
- [ ] No regressions in existing post/series tests after refactor.

---

## Risks tracked

- **Strategy refactor coverage**: existing post tests must pass after the refactor without modification. Task 1 verifies this. If any post test breaks, the refactor changed semantics and needs to be unwound to behavioral parity.
- **DeepL quota**: backfill (Task 16) consumes ~12K chars (2 projects × ~2K × 3 locales) + ~2K chars (5 series × ~150 × 3) ≈ 14K total. Comfortably within 1M budget.
- **`project_profile` replication for in-flight admin edits**: if admin edits source `project_profile` after sibling exists, `_sync_project_profile` overwrites sibling profile fields verbatim every run. Translated body still re-translates only on hash change. This is the desired behavior.
- **Series reorder during translation**: if backfill is running while admin reorders, the worker's metadata sync (`order_index`) might race with the reorder write. Mitigation: backfill completes in seconds for the small series count; admin can wait, or re-save series order if needed (re-sync to siblings happens automatically).
- **Dictionary key drift over time**: TypeScript catches structural divergence at compile time. New keys must be added to all four locales — there is no fallback to ko at runtime.
- **404 vs empty page on `/[locale]/projects/missing-slug/`**: the project detail page returns 404 if the project doesn't exist for that locale, even if it exists in Korean. Users can still access the Korean version directly via `/ko/projects/missing-slug/`. This is intentional per design — translated URLs are honest about translation availability.
