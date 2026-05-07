# Slug Redirect System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an admin renames a post/series slug, the old URL keeps working via a 301 redirect. Old redirect rows are reclaimed automatically once they have aged out and stopped receiving traffic.

**Architecture:** Two new SQLAlchemy tables (`post_slug_redirects`, `series_slug_redirects`) store `(locale, old_slug) → target_id` foreign keys. The write path hooks `PostService.create_post`/`update_post_by_slug` and the analogous series methods. The read path adds three FastAPI endpoints (`/posts/redirects/{slug}`, `/projects/redirects/{slug}`, `/series/redirects/{slug}`) consumed by the existing Astro detail pages from their 404 fallback branches. A daily in-process scheduler (modeled on `draft_cleanup_scheduler`) deletes rows older than `min_age_days` whose `last_hit_at` is null or older than `idle_days`.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Postgres (prod) / SQLite in-memory (tests), pytest, Astro 5, TypeScript, vitest. Spec: `docs/superpowers/specs/2026-05-06-slug-redirect-system-design.md`.

---

## File Map

**API — create:**
- `apps/api/alembic/versions/20260506_0018_add_slug_redirect_tables.py`
- `apps/api/src/app/models/slug_redirect.py`
- `apps/api/src/app/repositories/slug_redirect_repository.py`
- `apps/api/src/app/services/slug_redirect_cleanup_scheduler.py`
- `apps/api/tests/repositories/test_slug_redirect_repository.py`
- `apps/api/tests/services/test_post_service_slug_redirect.py`
- `apps/api/tests/services/test_series_service_slug_redirect.py`
- `apps/api/tests/services/test_slug_redirect_cleanup_scheduler.py`
- `apps/api/tests/api/test_post_redirects_api.py`
- `apps/api/tests/api/test_series_redirects_api.py`

**API — modify:**
- `apps/api/src/app/core/config.py` — add settings.
- `apps/api/src/app/services/post_service.py` — service hooks.
- `apps/api/src/app/services/series_service.py` — service hooks.
- `apps/api/src/app/api/v1/endpoints/posts.py` — blog redirect endpoint.
- `apps/api/src/app/api/v1/endpoints/projects.py` — project redirect endpoint.
- `apps/api/src/app/api/v1/endpoints/series.py` — series redirect endpoint.
- `apps/api/src/app/main.py` — wire scheduler.

**Web — modify:**
- `apps/web/src/lib/blog-db.ts` — `resolvePostSlugRedirect` helper.
- `apps/web/src/lib/projects.ts` — `resolveProjectSlugRedirect` helper.
- `apps/web/src/lib/series-db.ts` — `resolveSeriesSlugRedirect` helper.
- `apps/web/src/pages/[locale]/blog/[...slug].astro` — 404 fallback redirect.
- `apps/web/src/pages/[locale]/series/[slug].astro` — 404 fallback redirect.
- `apps/web/src/pages/[locale]/projects/[slug].astro` — 404 fallback redirect.

---

## Test conventions

- API tests run on SQLite in-memory (`create_engine("sqlite+pysqlite:///:memory:")` + `Base.metadata.create_all`). All SQL must be dialect-portable (no Postgres-specific UPSERT). Use SQLAlchemy ORM/core; avoid raw SQL.
- Run a single API test file with `cd apps/api && python -m pytest tests/<path>::<name> -v`.
- Run all API tests with `cd apps/api && python -m pytest -v`.
- Run web typecheck with `cd apps/web && npm run typecheck`.

---

## Task 1: Settings — `SLUG_REDIRECT_*` defaults

**Files:**
- Modify: `apps/api/src/app/core/config.py`
- Test: `apps/api/tests/services/test_slug_redirect_cleanup_scheduler.py` (created in Task 13; covered indirectly)

This task is mechanical — add two `Field` declarations. Tested transitively by the scheduler tests in Task 13.

- [ ] **Step 1: Add settings fields**

In `apps/api/src/app/core/config.py`, add these fields after the existing `media_orphan_retention_days` field (around line 47):

```python
    slug_redirect_min_age_days: int = Field(default=90, alias='SLUG_REDIRECT_MIN_AGE_DAYS')
    slug_redirect_idle_days: int = Field(default=30, alias='SLUG_REDIRECT_IDLE_DAYS')
```

- [ ] **Step 2: Verify settings loads**

Run: `cd apps/api && python -c "from app.core.config import settings; print(settings.slug_redirect_min_age_days, settings.slug_redirect_idle_days)"`
Expected: `90 30`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app/core/config.py
git commit -m "feat(redirects): add SLUG_REDIRECT_MIN_AGE_DAYS / IDLE_DAYS settings"
```

---

## Task 2: Alembic migration — `post_slug_redirects` and `series_slug_redirects`

**Files:**
- Create: `apps/api/alembic/versions/20260506_0018_add_slug_redirect_tables.py`

The `post_locale` enum already exists (created in 0013). The migration must reference it without recreating, hence `create_type=False` on `sa.Enum`.

- [ ] **Step 1: Write the migration file**

Create `apps/api/alembic/versions/20260506_0018_add_slug_redirect_tables.py`:

```python
"""add slug redirect tables

Revision ID: 20260506_0018
Revises: 20260504_0017
Create Date: 2026-05-06 12:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260506_0018"
down_revision = "20260504_0017"
branch_labels = None
depends_on = None


def _locale_enum() -> sa.Enum:
    # Reference the enum created by 20260503_0013; do not re-create the type.
    return sa.Enum("ko", "en", "ja", "zh", name="post_locale", create_type=False)


def upgrade() -> None:
    op.create_table(
        "post_slug_redirects",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("locale", _locale_enum(), nullable=False),
        sa.Column("old_slug", sa.String(length=160), nullable=False),
        sa.Column("target_post_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_hit_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["target_post_id"],
            ["posts.id"],
            name="fk_post_slug_redirects_target_post_id",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("locale", "old_slug", name="uq_post_slug_redirects_locale_old_slug"),
    )
    op.create_index(
        "ix_post_slug_redirects_target_post_id",
        "post_slug_redirects",
        ["target_post_id"],
    )

    op.create_table(
        "series_slug_redirects",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("locale", _locale_enum(), nullable=False),
        sa.Column("old_slug", sa.String(length=160), nullable=False),
        sa.Column("target_series_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_hit_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["target_series_id"],
            ["series.id"],
            name="fk_series_slug_redirects_target_series_id",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("locale", "old_slug", name="uq_series_slug_redirects_locale_old_slug"),
    )
    op.create_index(
        "ix_series_slug_redirects_target_series_id",
        "series_slug_redirects",
        ["target_series_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_series_slug_redirects_target_series_id", table_name="series_slug_redirects")
    op.drop_table("series_slug_redirects")
    op.drop_index("ix_post_slug_redirects_target_post_id", table_name="post_slug_redirects")
    op.drop_table("post_slug_redirects")
```

- [ ] **Step 2: Verify migration syntactically loads**

Run: `cd apps/api && python -c "import importlib.util; spec = importlib.util.spec_from_file_location('m', 'alembic/versions/20260506_0018_add_slug_redirect_tables.py'); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); print(m.revision, m.down_revision)"`
Expected: `20260506_0018 20260504_0017`

- [ ] **Step 3: Commit**

```bash
git add apps/api/alembic/versions/20260506_0018_add_slug_redirect_tables.py
git commit -m "feat(redirects): add post_slug_redirects and series_slug_redirects tables"
```

---

## Task 3: Models — `PostSlugRedirect` and `SeriesSlugRedirect`

**Files:**
- Create: `apps/api/src/app/models/slug_redirect.py`
- Modify: `apps/api/src/app/models/__init__.py`
- Test: `apps/api/tests/repositories/test_slug_redirect_repository.py` (covered in Task 4)

- [ ] **Step 1: Write the model file**

Create `apps/api/src/app/models/slug_redirect.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin
from app.models.post import PostLocale, _enum_values


class PostSlugRedirect(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "post_slug_redirects"
    __table_args__ = (
        UniqueConstraint("locale", "old_slug", name="uq_post_slug_redirects_locale_old_slug"),
    )

    locale: Mapped[PostLocale] = mapped_column(
        Enum(PostLocale, name="post_locale", values_callable=_enum_values),
        nullable=False,
    )
    old_slug: Mapped[str] = mapped_column(String(160), nullable=False)
    target_post_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    last_hit_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class SeriesSlugRedirect(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "series_slug_redirects"
    __table_args__ = (
        UniqueConstraint("locale", "old_slug", name="uq_series_slug_redirects_locale_old_slug"),
    )

    locale: Mapped[PostLocale] = mapped_column(
        Enum(PostLocale, name="post_locale", values_callable=_enum_values),
        nullable=False,
    )
    old_slug: Mapped[str] = mapped_column(String(160), nullable=False)
    target_series_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("series.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    last_hit_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
```

Note: `created_at` is set explicitly by the repository (Step 1 of write path resets it), not via `server_default`. This keeps SQLite-in-memory tests deterministic.

- [ ] **Step 2: Verify import + metadata registration**

Run: `cd apps/api && python -c "from app.db.base import Base; import app.models.slug_redirect as m; assert 'post_slug_redirects' in Base.metadata.tables; assert 'series_slug_redirects' in Base.metadata.tables; print('ok')"`
Expected: `ok`

(The existing `app/models/__init__.py` does not register individual model modules — repositories import them directly when the app boots, and tests use a `# noqa: F401` import block to force registration before `Base.metadata.create_all`. We follow the same convention.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app/models/slug_redirect.py
git commit -m "feat(redirects): add PostSlugRedirect and SeriesSlugRedirect models"
```

---

## Task 4: Repository — `SlugRedirectRepository`

**Files:**
- Create: `apps/api/src/app/repositories/slug_redirect_repository.py`
- Create: `apps/api/tests/repositories/test_slug_redirect_repository.py`

The repository owns three operations per resource: `record_rename` (delete-then-insert UPSERT), `delete_by_new_slug` (Step 2 cleanup), `lookup_with_target` (resolve and join). Plus `record_hit` and `purge_expired` used by the API layer and the scheduler.

- [ ] **Step 1: Write the failing test for `record_rename`**

Create `apps/api/tests/repositories/test_slug_redirect_repository.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import admin_credential, media, post, post_comment, project_profile, series, site_profile, slug_redirect, tag  # noqa: F401
from app.models.post import (
    Post,
    PostContentKind,
    PostLocale,
    PostStatus,
    PostTranslationSourceKind,
    PostTranslationStatus,
    PostVisibility,
)
from app.models.series import Series
from app.models.slug_redirect import PostSlugRedirect, SeriesSlugRedirect
from app.repositories.slug_redirect_repository import SlugRedirectRepository


def _build_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def _make_post(slug: str, locale: PostLocale = PostLocale.KO, content_kind: PostContentKind = PostContentKind.BLOG) -> Post:
    now = datetime.now(timezone.utc)
    return Post(
        slug=slug,
        title=f"Post {slug}",
        body_markdown="body",
        locale=locale,
        content_kind=content_kind,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        published_at=now,
    )


def _make_series(slug: str, locale: PostLocale = PostLocale.KO) -> Series:
    return Series(
        slug=slug,
        title=f"Series {slug}",
        description="desc",
        locale=locale,
        translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
    )


def test_record_post_rename_creates_redirect_row() -> None:
    db = _build_session()
    post = _make_post("new-slug")
    db.add(post)
    db.flush()

    repo = SlugRedirectRepository(db)
    repo.record_post_rename(old_slug="old-slug", new_slug="new-slug", locale=PostLocale.KO, target_post_id=post.id)
    db.commit()

    rows = db.scalars(select(PostSlugRedirect)).all()
    assert len(rows) == 1
    assert rows[0].old_slug == "old-slug"
    assert rows[0].locale == PostLocale.KO
    assert rows[0].target_post_id == post.id
    assert rows[0].hit_count == 0
    assert rows[0].last_hit_at is None
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && python -m pytest tests/repositories/test_slug_redirect_repository.py::test_record_post_rename_creates_redirect_row -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.repositories.slug_redirect_repository'`

- [ ] **Step 3: Implement the repository**

Create `apps/api/src/app/repositories/slug_redirect_repository.py`:

```python
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models.post import Post, PostContentKind, PostLocale, PostStatus, PostVisibility
from app.models.series import Series
from app.models.slug_redirect import PostSlugRedirect, SeriesSlugRedirect


@dataclass(frozen=True)
class RedirectResolution:
    redirect_id: uuid.UUID
    target_slug: str


class SlugRedirectRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ---- Post side ------------------------------------------------------

    def record_post_rename(
        self,
        *,
        old_slug: str,
        new_slug: str,
        locale: PostLocale,
        target_post_id: uuid.UUID,
    ) -> None:
        # Step 1: UPSERT (delete + insert keeps SQLite + Postgres parity).
        self.db.execute(
            delete(PostSlugRedirect).where(
                PostSlugRedirect.locale == locale,
                PostSlugRedirect.old_slug == old_slug,
            )
        )
        self.db.add(
            PostSlugRedirect(
                locale=locale,
                old_slug=old_slug,
                target_post_id=target_post_id,
                created_at=datetime.now(timezone.utc),
                last_hit_at=None,
                hit_count=0,
            )
        )
        # Step 2: drop redirects whose old_slug == new_slug (this post just claimed it).
        self.db.execute(
            delete(PostSlugRedirect).where(
                PostSlugRedirect.locale == locale,
                PostSlugRedirect.old_slug == new_slug,
            )
        )
        self.db.flush()

    def claim_post_slug(self, *, slug: str, locale: PostLocale) -> None:
        """Step 2 only: used on post creation when a brand-new slug is claimed."""
        self.db.execute(
            delete(PostSlugRedirect).where(
                PostSlugRedirect.locale == locale,
                PostSlugRedirect.old_slug == slug,
            )
        )
        self.db.flush()

    def lookup_post_redirect(
        self,
        *,
        old_slug: str,
        locale: PostLocale,
        content_kind: PostContentKind,
    ) -> RedirectResolution | None:
        stmt = (
            select(PostSlugRedirect.id, Post.slug)
            .join(Post, Post.id == PostSlugRedirect.target_post_id)
            .where(
                PostSlugRedirect.locale == locale,
                PostSlugRedirect.old_slug == old_slug,
                Post.content_kind == content_kind,
                Post.status == PostStatus.PUBLISHED,
                Post.visibility == PostVisibility.PUBLIC,
            )
        )
        row = self.db.execute(stmt).first()
        if row is None:
            return None
        return RedirectResolution(redirect_id=row[0], target_slug=row[1])

    def record_post_hit(self, *, redirect_id: uuid.UUID) -> None:
        self.db.execute(
            update(PostSlugRedirect)
            .where(PostSlugRedirect.id == redirect_id)
            .values(
                hit_count=PostSlugRedirect.hit_count + 1,
                last_hit_at=datetime.now(timezone.utc),
            )
        )
        self.db.commit()

    def purge_expired_post_redirects(self, *, min_age_days: int, idle_days: int) -> int:
        now = datetime.now(timezone.utc)
        age_cutoff = now - timedelta(days=max(1, min_age_days))
        idle_cutoff = now - timedelta(days=max(1, idle_days))
        stmt = delete(PostSlugRedirect).where(
            PostSlugRedirect.created_at < age_cutoff,
            (PostSlugRedirect.last_hit_at.is_(None))
            | (PostSlugRedirect.last_hit_at < idle_cutoff),
        )
        result = self.db.execute(stmt)
        self.db.commit()
        return int(result.rowcount or 0)

    # ---- Series side ----------------------------------------------------

    def record_series_rename(
        self,
        *,
        old_slug: str,
        new_slug: str,
        locale: PostLocale,
        target_series_id: uuid.UUID,
    ) -> None:
        self.db.execute(
            delete(SeriesSlugRedirect).where(
                SeriesSlugRedirect.locale == locale,
                SeriesSlugRedirect.old_slug == old_slug,
            )
        )
        self.db.add(
            SeriesSlugRedirect(
                locale=locale,
                old_slug=old_slug,
                target_series_id=target_series_id,
                created_at=datetime.now(timezone.utc),
                last_hit_at=None,
                hit_count=0,
            )
        )
        self.db.execute(
            delete(SeriesSlugRedirect).where(
                SeriesSlugRedirect.locale == locale,
                SeriesSlugRedirect.old_slug == new_slug,
            )
        )
        self.db.flush()

    def claim_series_slug(self, *, slug: str, locale: PostLocale) -> None:
        self.db.execute(
            delete(SeriesSlugRedirect).where(
                SeriesSlugRedirect.locale == locale,
                SeriesSlugRedirect.old_slug == slug,
            )
        )
        self.db.flush()

    def lookup_series_redirect(
        self,
        *,
        old_slug: str,
        locale: PostLocale,
    ) -> RedirectResolution | None:
        stmt = (
            select(SeriesSlugRedirect.id, Series.slug)
            .join(Series, Series.id == SeriesSlugRedirect.target_series_id)
            .where(
                SeriesSlugRedirect.locale == locale,
                SeriesSlugRedirect.old_slug == old_slug,
            )
        )
        row = self.db.execute(stmt).first()
        if row is None:
            return None
        return RedirectResolution(redirect_id=row[0], target_slug=row[1])

    def record_series_hit(self, *, redirect_id: uuid.UUID) -> None:
        self.db.execute(
            update(SeriesSlugRedirect)
            .where(SeriesSlugRedirect.id == redirect_id)
            .values(
                hit_count=SeriesSlugRedirect.hit_count + 1,
                last_hit_at=datetime.now(timezone.utc),
            )
        )
        self.db.commit()

    def purge_expired_series_redirects(self, *, min_age_days: int, idle_days: int) -> int:
        now = datetime.now(timezone.utc)
        age_cutoff = now - timedelta(days=max(1, min_age_days))
        idle_cutoff = now - timedelta(days=max(1, idle_days))
        stmt = delete(SeriesSlugRedirect).where(
            SeriesSlugRedirect.created_at < age_cutoff,
            (SeriesSlugRedirect.last_hit_at.is_(None))
            | (SeriesSlugRedirect.last_hit_at < idle_cutoff),
        )
        result = self.db.execute(stmt)
        self.db.commit()
        return int(result.rowcount or 0)
```

- [ ] **Step 4: Run the first test, verify it passes**

Run: `cd apps/api && python -m pytest tests/repositories/test_slug_redirect_repository.py::test_record_post_rename_creates_redirect_row -v`
Expected: PASS

- [ ] **Step 5: Add the remaining repository tests**

Append to `apps/api/tests/repositories/test_slug_redirect_repository.py`:

```python
def test_record_post_rename_replaces_existing_redirect_for_old_slug() -> None:
    db = _build_session()
    p1 = _make_post("p1")
    p2 = _make_post("p2")
    db.add_all([p1, p2])
    db.flush()
    repo = SlugRedirectRepository(db)

    repo.record_post_rename(old_slug="legacy", new_slug="p1", locale=PostLocale.KO, target_post_id=p1.id)
    repo.record_post_rename(old_slug="legacy", new_slug="p2", locale=PostLocale.KO, target_post_id=p2.id)
    db.commit()

    rows = db.scalars(select(PostSlugRedirect)).all()
    assert len(rows) == 1
    assert rows[0].target_post_id == p2.id


def test_record_post_rename_drops_redirect_on_new_slug() -> None:
    db = _build_session()
    p1 = _make_post("a")
    db.add(p1)
    db.flush()
    repo = SlugRedirectRepository(db)
    # Pre-existing redirect (a) → some prior post: simulate it manually.
    db.add(
        PostSlugRedirect(
            locale=PostLocale.KO,
            old_slug="a",
            target_post_id=p1.id,
            created_at=datetime.now(timezone.utc),
        )
    )
    db.flush()

    p2 = _make_post("a-new")
    db.add(p2)
    db.flush()
    # p2 is renamed from c → a-new and now claims slug "a-new".
    # The Step 2 delete should drop a redirect on "a-new" if any existed.
    repo.record_post_rename(old_slug="c", new_slug="a-new", locale=PostLocale.KO, target_post_id=p2.id)
    db.commit()

    rows = db.scalars(select(PostSlugRedirect).order_by(PostSlugRedirect.old_slug)).all()
    # (a) → p1 untouched, (c) → p2 added, no row for "a-new".
    slugs = sorted(r.old_slug for r in rows)
    assert slugs == ["a", "c"]


def test_lookup_post_redirect_returns_target_slug() -> None:
    db = _build_session()
    p = _make_post("current")
    db.add(p)
    db.flush()
    repo = SlugRedirectRepository(db)
    repo.record_post_rename(old_slug="legacy", new_slug="current", locale=PostLocale.KO, target_post_id=p.id)
    db.commit()

    resolution = repo.lookup_post_redirect(old_slug="legacy", locale=PostLocale.KO, content_kind=PostContentKind.BLOG)
    assert resolution is not None
    assert resolution.target_slug == "current"


def test_lookup_post_redirect_filters_by_content_kind() -> None:
    db = _build_session()
    p = _make_post("current", content_kind=PostContentKind.PROJECT)
    db.add(p)
    db.flush()
    repo = SlugRedirectRepository(db)
    repo.record_post_rename(old_slug="legacy", new_slug="current", locale=PostLocale.KO, target_post_id=p.id)
    db.commit()

    blog_lookup = repo.lookup_post_redirect(old_slug="legacy", locale=PostLocale.KO, content_kind=PostContentKind.BLOG)
    project_lookup = repo.lookup_post_redirect(old_slug="legacy", locale=PostLocale.KO, content_kind=PostContentKind.PROJECT)
    assert blog_lookup is None
    assert project_lookup is not None


def test_lookup_post_redirect_isolates_locales() -> None:
    db = _build_session()
    ko_post = _make_post("current", locale=PostLocale.KO)
    en_post = _make_post("current", locale=PostLocale.EN)
    db.add_all([ko_post, en_post])
    db.flush()
    repo = SlugRedirectRepository(db)
    repo.record_post_rename(old_slug="legacy", new_slug="current", locale=PostLocale.KO, target_post_id=ko_post.id)
    db.commit()

    ko_resolution = repo.lookup_post_redirect(old_slug="legacy", locale=PostLocale.KO, content_kind=PostContentKind.BLOG)
    en_resolution = repo.lookup_post_redirect(old_slug="legacy", locale=PostLocale.EN, content_kind=PostContentKind.BLOG)
    assert ko_resolution is not None
    assert en_resolution is None


def test_record_post_hit_increments_counters() -> None:
    db = _build_session()
    p = _make_post("current")
    db.add(p)
    db.flush()
    repo = SlugRedirectRepository(db)
    repo.record_post_rename(old_slug="legacy", new_slug="current", locale=PostLocale.KO, target_post_id=p.id)
    db.commit()
    resolution = repo.lookup_post_redirect(old_slug="legacy", locale=PostLocale.KO, content_kind=PostContentKind.BLOG)
    assert resolution is not None

    repo.record_post_hit(redirect_id=resolution.redirect_id)
    repo.record_post_hit(redirect_id=resolution.redirect_id)

    row = db.scalars(select(PostSlugRedirect)).one()
    assert row.hit_count == 2
    assert row.last_hit_at is not None


def test_purge_expired_post_redirects_respects_min_age_and_idle() -> None:
    db = _build_session()
    p = _make_post("current")
    db.add(p)
    db.flush()
    now = datetime.now(timezone.utc)
    fresh = PostSlugRedirect(
        locale=PostLocale.KO, old_slug="fresh", target_post_id=p.id,
        created_at=now - timedelta(days=10),
    )
    aged_unhit = PostSlugRedirect(
        locale=PostLocale.KO, old_slug="aged-unhit", target_post_id=p.id,
        created_at=now - timedelta(days=120),
    )
    aged_recently_hit = PostSlugRedirect(
        locale=PostLocale.KO, old_slug="aged-hit", target_post_id=p.id,
        created_at=now - timedelta(days=120),
        last_hit_at=now - timedelta(days=5),
    )
    aged_long_idle = PostSlugRedirect(
        locale=PostLocale.KO, old_slug="aged-idle", target_post_id=p.id,
        created_at=now - timedelta(days=120),
        last_hit_at=now - timedelta(days=60),
    )
    db.add_all([fresh, aged_unhit, aged_recently_hit, aged_long_idle])
    db.commit()
    repo = SlugRedirectRepository(db)

    deleted = repo.purge_expired_post_redirects(min_age_days=90, idle_days=30)

    remaining = sorted(r.old_slug for r in db.scalars(select(PostSlugRedirect)).all())
    # fresh: kept (too young). aged-unhit: deleted. aged-hit: kept (recent hit).
    # aged-idle: deleted (idle > 30d).
    assert deleted == 2
    assert remaining == ["aged-hit", "fresh"]


def test_record_series_rename_and_lookup_series_redirect() -> None:
    db = _build_session()
    s = _make_series("current")
    db.add(s)
    db.flush()
    repo = SlugRedirectRepository(db)
    repo.record_series_rename(old_slug="legacy", new_slug="current", locale=PostLocale.KO, target_series_id=s.id)
    db.commit()

    resolution = repo.lookup_series_redirect(old_slug="legacy", locale=PostLocale.KO)
    assert resolution is not None
    assert resolution.target_slug == "current"


def test_claim_post_slug_drops_existing_redirect() -> None:
    db = _build_session()
    p = _make_post("current")
    db.add(p)
    db.flush()
    db.add(PostSlugRedirect(
        locale=PostLocale.KO, old_slug="claimed", target_post_id=p.id,
        created_at=datetime.now(timezone.utc),
    ))
    db.commit()
    repo = SlugRedirectRepository(db)

    repo.claim_post_slug(slug="claimed", locale=PostLocale.KO)
    db.commit()

    assert db.scalars(select(PostSlugRedirect)).all() == []
```

- [ ] **Step 6: Run all repository tests**

Run: `cd apps/api && python -m pytest tests/repositories/test_slug_redirect_repository.py -v`
Expected: 8 PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/repositories/slug_redirect_repository.py apps/api/tests/repositories/test_slug_redirect_repository.py
git commit -m "feat(redirects): add SlugRedirectRepository with TDD coverage"
```

---

## Task 5: Wire repository into deps

**Files:**
- Modify: `apps/api/src/app/api/deps.py`

The repository is constructed inline within service factories that need it (Tasks 6/8) and within endpoint handlers (Tasks 10–12). Add a single helper to centralize that.

- [ ] **Step 1: Add the factory**

In `apps/api/src/app/api/deps.py`, after the existing imports add:

```python
from app.repositories.slug_redirect_repository import SlugRedirectRepository
```

Then add this function alongside the other `get_*` factories:

```python
def get_slug_redirect_repository(db: Session = Depends(get_db)) -> SlugRedirectRepository:
    return SlugRedirectRepository(db)
```

- [ ] **Step 2: Verify import**

Run: `cd apps/api && python -c "from app.api.deps import get_slug_redirect_repository; print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app/api/deps.py
git commit -m "feat(redirects): expose SlugRedirectRepository via deps factory"
```

---

## Task 6: Hook `PostService.update_post_by_slug`

**Files:**
- Modify: `apps/api/src/app/services/post_service.py`
- Test: `apps/api/tests/services/test_post_service_slug_redirect.py`

The service receives the repository at construction time. We pass `SlugRedirectRepository | None` so existing test stubs that don't pass it still work.

- [ ] **Step 1: Write the failing service test**

Create `apps/api/tests/services/test_post_service_slug_redirect.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import admin_credential, media, post, post_comment, project_profile, series, site_profile, slug_redirect, tag  # noqa: F401
from app.models.post import PostContentKind, PostLocale, PostStatus, PostVisibility
from app.models.slug_redirect import PostSlugRedirect
from app.repositories.post_repository import PostRepository
from app.repositories.slug_redirect_repository import SlugRedirectRepository
from app.schemas.post import PostCreate
from app.services.post_service import PostService


def _build_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def _post_create_payload(slug: str) -> PostCreate:
    return PostCreate(
        slug=slug,
        title=f"Post {slug}",
        excerpt=None,
        body_markdown="body",
        cover_image_url=None,
        content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        locale=PostLocale.KO,
        translation_group_id=uuid.uuid4(),
        source_post_id=None,
        published_at=datetime.now(timezone.utc),
        tags=[],
    )


def test_update_post_with_slug_change_records_redirect() -> None:
    db = _build_session()
    post_repo = PostRepository(db)
    redirect_repo = SlugRedirectRepository(db)
    service = PostService(repo=post_repo, slug_redirect_repo=redirect_repo)

    created = service.create_post(_post_create_payload("original"))
    db.refresh(created)

    update_payload = _post_create_payload("renamed")
    update_payload.translation_group_id = created.translation_group_id
    service.update_post_by_slug("original", update_payload)

    rows = db.scalars(select(PostSlugRedirect)).all()
    assert len(rows) == 1
    assert rows[0].old_slug == "original"
    assert rows[0].target_post_id == created.id


def test_update_post_without_slug_change_does_not_record_redirect() -> None:
    db = _build_session()
    post_repo = PostRepository(db)
    redirect_repo = SlugRedirectRepository(db)
    service = PostService(repo=post_repo, slug_redirect_repo=redirect_repo)

    created = service.create_post(_post_create_payload("stable"))
    update_payload = _post_create_payload("stable")
    update_payload.translation_group_id = created.translation_group_id
    service.update_post_by_slug("stable", update_payload)

    rows = db.scalars(select(PostSlugRedirect)).all()
    assert rows == []


def test_update_post_to_slug_with_existing_redirect_drops_that_redirect() -> None:
    db = _build_session()
    post_repo = PostRepository(db)
    redirect_repo = SlugRedirectRepository(db)
    service = PostService(repo=post_repo, slug_redirect_repo=redirect_repo)

    # X.slug = a → b leaves redirect (a → X.id).
    x = service.create_post(_post_create_payload("a"))
    update_x = _post_create_payload("b")
    update_x.translation_group_id = x.translation_group_id
    service.update_post_by_slug("a", update_x)
    # Y.slug = c → a should now claim slug "a" and remove the (a → X) redirect.
    y = service.create_post(_post_create_payload("c"))
    update_y = _post_create_payload("a")
    update_y.translation_group_id = y.translation_group_id
    service.update_post_by_slug("c", update_y)

    rows = sorted(
        db.scalars(select(PostSlugRedirect)).all(), key=lambda row: row.old_slug
    )
    # (a → X) was removed when Y claimed slug "a"; (c → Y) was added.
    assert [(r.old_slug, r.target_post_id) for r in rows] == [("c", y.id)]


def test_create_post_drops_existing_redirect_on_claimed_slug() -> None:
    db = _build_session()
    post_repo = PostRepository(db)
    redirect_repo = SlugRedirectRepository(db)
    service = PostService(repo=post_repo, slug_redirect_repo=redirect_repo)

    x = service.create_post(_post_create_payload("a"))
    update_x = _post_create_payload("b")
    update_x.translation_group_id = x.translation_group_id
    service.update_post_by_slug("a", update_x)
    # Sanity: redirect (a → X) exists.
    assert db.scalars(select(PostSlugRedirect)).all()

    # Brand-new post claims slug "a"; redirect must be dropped.
    service.create_post(_post_create_payload("a"))

    assert db.scalars(select(PostSlugRedirect)).all() == []
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `cd apps/api && python -m pytest tests/services/test_post_service_slug_redirect.py -v`
Expected: FAIL — `TypeError: PostService.__init__() got an unexpected keyword argument 'slug_redirect_repo'`

- [ ] **Step 3: Update `PostService` signature and hooks**

In `apps/api/src/app/services/post_service.py`:

Replace the import block at the top of the file (lines 1-9) with:

```python
from __future__ import annotations

from app.core.text import normalize_optional_text
from app.models.post import PostContentKind, PostLocale, PostStatus, PostVisibility
from app.repositories.post_repository import PostRepository
from app.repositories.slug_redirect_repository import SlugRedirectRepository
from app.schemas.post import PostCreate
from app.services.indexnow_service import IndexNowService
from app.services.post_translation_service import PostTranslationService
from app.services.series_projection_cache import request_series_projection_refresh
```

Replace the `__init__` (lines 13-21) with:

```python
    def __init__(
        self,
        repo: PostRepository,
        translation_service: PostTranslationService | None = None,
        indexnow_service: IndexNowService | None = None,
        slug_redirect_repo: SlugRedirectRepository | None = None,
    ) -> None:
        self.repo = repo
        self.translation_service = translation_service
        self.indexnow_service = indexnow_service
        self.slug_redirect_repo = slug_redirect_repo
```

Replace `create_post` (lines 127-134) with:

```python
    def create_post(self, payload: PostCreate):
        if self.slug_redirect_repo is not None:
            self.slug_redirect_repo.claim_post_slug(slug=payload.slug, locale=payload.locale)
        created = self.repo.create(payload)
        self.repo.db.commit()
        self._sync_translations(created)
        self._ping_indexnow(created)
        if normalize_optional_text(getattr(created, "series_title", None)) is not None:
            request_series_projection_refresh("post-created-series-assigned")
        return created
```

Replace `update_post_by_slug` (lines 136-161) with:

```python
    def update_post_by_slug(self, slug: str, payload: PostCreate):
        before = self.repo.get_by_slug(slug=slug)
        if before is None:
            return None

        before_series = normalize_optional_text(getattr(before, "series_title", None))
        before_published_at = getattr(before, "published_at", None)
        before_id = before.id
        before_locale = before.locale
        before_slug = before.slug

        updated = self.repo.update_by_slug(current_slug=slug, payload=payload)
        if updated is None:
            return None

        if self.slug_redirect_repo is not None and updated.slug != before_slug:
            self.slug_redirect_repo.record_post_rename(
                old_slug=before_slug,
                new_slug=updated.slug,
                locale=before_locale,
                target_post_id=before_id,
            )
        self.repo.db.commit()
        self._sync_translations(updated)
        self._ping_indexnow(updated)

        after_series = normalize_optional_text(getattr(updated, "series_title", None))
        after_published_at = getattr(updated, "published_at", None)

        should_refresh = before_series != after_series
        if not should_refresh and before_series is not None:
            should_refresh = before_published_at != after_published_at

        if should_refresh:
            request_series_projection_refresh("post-updated-series-changed")

        return updated
```

Note: `record_post_rename` calls `db.flush()` internally; the existing `db.commit()` at the end of the service flushes both the post update and the redirect insert atomically.

- [ ] **Step 4: Run the new tests, verify they pass**

Run: `cd apps/api && python -m pytest tests/services/test_post_service_slug_redirect.py -v`
Expected: 4 PASS

- [ ] **Step 5: Run pre-existing post service tests to confirm no regression**

Run: `cd apps/api && python -m pytest tests/api/test_posts_admin_edit_delete.py tests/api/test_post_summaries_api.py -v`
Expected: all PASS

- [ ] **Step 6: Wire the dep**

Edit `apps/api/src/app/api/deps.py` `get_post_service`:

```python
def get_post_service(db: Session = Depends(get_db)) -> PostService:
    return PostService(
        repo=PostRepository(db),
        translation_service=PostTranslationService(queue=_get_translation_queue()),
        indexnow_service=_get_indexnow_service(),
        slug_redirect_repo=SlugRedirectRepository(db),
    )
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/services/post_service.py apps/api/src/app/api/deps.py apps/api/tests/services/test_post_service_slug_redirect.py
git commit -m "feat(redirects): record redirect on post slug rename and slug claim"
```

---

## Task 7: Hook `SeriesService.update_series_by_slug` and `create_series`

**Files:**
- Modify: `apps/api/src/app/services/series_service.py`
- Modify: `apps/api/src/app/api/deps.py`
- Test: `apps/api/tests/services/test_series_service_slug_redirect.py`

- [ ] **Step 1: Write the failing series service test**

Create `apps/api/tests/services/test_series_service_slug_redirect.py`:

```python
from __future__ import annotations

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import admin_credential, media, post, post_comment, project_profile, series, site_profile, slug_redirect, tag  # noqa: F401
from app.models.slug_redirect import SeriesSlugRedirect
from app.repositories.series_repository import SeriesRepository
from app.repositories.slug_redirect_repository import SlugRedirectRepository
from app.schemas.series import SeriesUpsert
from app.services.series_service import SeriesService


def _build_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def _series_payload(slug: str) -> SeriesUpsert:
    # SeriesUpsert exposes only slug/title/description/cover_image_url; locale,
    # translation_group_id, etc. take ORM defaults at creation time.
    return SeriesUpsert(
        slug=slug,
        title=f"Series {slug}",
        description="desc",
        cover_image_url=None,
    )


def test_update_series_with_slug_change_records_redirect() -> None:
    db = _build_session()
    series_repo = SeriesRepository(db)
    redirect_repo = SlugRedirectRepository(db)
    service = SeriesService(repo=series_repo, slug_redirect_repo=redirect_repo)

    created = service.create_series(_series_payload("original"))
    service.update_series_by_slug("original", _series_payload("renamed"))

    rows = db.scalars(select(SeriesSlugRedirect)).all()
    assert len(rows) == 1
    assert rows[0].old_slug == "original"
    assert rows[0].target_series_id == created["id"]


def test_create_series_drops_existing_redirect_on_claimed_slug() -> None:
    db = _build_session()
    series_repo = SeriesRepository(db)
    redirect_repo = SlugRedirectRepository(db)
    service = SeriesService(repo=series_repo, slug_redirect_repo=redirect_repo)

    service.create_series(_series_payload("a"))
    service.update_series_by_slug("a", _series_payload("b"))
    assert db.scalars(select(SeriesSlugRedirect)).all()

    service.create_series(_series_payload("a"))

    assert db.scalars(select(SeriesSlugRedirect)).all() == []
```

- [ ] **Step 2: Run, verify failure**

Run: `cd apps/api && python -m pytest tests/services/test_series_service_slug_redirect.py -v`
Expected: FAIL — `TypeError: SeriesService.__init__() got an unexpected keyword argument 'slug_redirect_repo'`

- [ ] **Step 3: Update `SeriesService`**

In `apps/api/src/app/services/series_service.py`:

Add to imports:

```python
from app.repositories.slug_redirect_repository import SlugRedirectRepository
```

Replace `__init__`:

```python
    def __init__(
        self,
        repo: SeriesRepository,
        translation_service: SeriesTranslationService | None = None,
        slug_redirect_repo: SlugRedirectRepository | None = None,
    ) -> None:
        self.repo = repo
        self.translation_service = translation_service
        self.slug_redirect_repo = slug_redirect_repo
```

Replace `create_series`:

```python
    def create_series(self, payload: SeriesUpsert):
        if self.slug_redirect_repo is not None:
            self.slug_redirect_repo.claim_series_slug(slug=payload.slug, locale=payload.locale)
        result = self.repo.create(payload)
        self.repo.db.commit()
        self._sync_translations(result)
        return result
```

Replace `update_series_by_slug`:

```python
    def update_series_by_slug(self, slug: str, payload: SeriesUpsert):
        before = self.repo.get_by_slug(slug=slug, include_private=True)
        if before is None:
            return None
        before_id = before["id"]
        before_locale = before["locale"]
        before_slug = before["slug"]

        result = self.repo.update_by_slug(current_slug=slug, payload=payload)
        if result is None:
            return None

        new_slug = result["slug"]
        if self.slug_redirect_repo is not None and new_slug != before_slug:
            self.slug_redirect_repo.record_series_rename(
                old_slug=before_slug,
                new_slug=new_slug,
                locale=before_locale,
                target_series_id=before_id,
            )
        self.repo.db.commit()
        self._sync_translations(result)
        return result
```

Note: `SeriesRepository.get_by_slug` / `create` / `update_by_slug` return a `dict[str, object]` (serialized series payload), not the ORM row. The keys `id`, `slug`, `locale` are populated by `_serialize_series` (see `apps/api/src/app/repositories/series_repository.py:58-70`). The `_sync_translations` helper already handles dict-or-ORM via `getattr` fallback.

- [ ] **Step 4: Run tests**

Run: `cd apps/api && python -m pytest tests/services/test_series_service_slug_redirect.py tests/api/test_series_api.py -v`
Expected: PASS

- [ ] **Step 5: Wire the dep**

Edit `apps/api/src/app/api/deps.py` `get_series_service`:

```python
def get_series_service(db: Session = Depends(get_db)) -> SeriesService:
    return SeriesService(
        repo=SeriesRepository(db),
        translation_service=get_series_translation_service(),
        slug_redirect_repo=SlugRedirectRepository(db),
    )
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app/services/series_service.py apps/api/src/app/api/deps.py apps/api/tests/services/test_series_service_slug_redirect.py
git commit -m "feat(redirects): record redirect on series slug rename and slug claim"
```

---

## Task 8: API endpoints — `/posts/redirects/{old_slug}` and `/projects/redirects/{old_slug}`

**Files:**
- Modify: `apps/api/src/app/api/v1/endpoints/posts.py`
- Modify: `apps/api/src/app/api/v1/endpoints/projects.py`
- Test: `apps/api/tests/api/test_post_redirects_api.py`

Two endpoints share the same lookup logic with different `content_kind` filter. They both update the hit counter on success and return `{"target_slug": "..."}`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/api/test_post_redirects_api.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.api.deps import get_slug_redirect_repository
from app.db.base import Base
from app.main import app
from app.models import admin_credential, media, post, post_comment, project_profile, series, site_profile, slug_redirect, tag  # noqa: F401
from app.models.post import (
    Post,
    PostContentKind,
    PostLocale,
    PostStatus,
    PostTranslationSourceKind,
    PostTranslationStatus,
    PostVisibility,
)
from app.models.slug_redirect import PostSlugRedirect
from app.repositories.slug_redirect_repository import SlugRedirectRepository


def _build_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def _make_published_post(slug: str, content_kind: PostContentKind = PostContentKind.BLOG) -> Post:
    now = datetime.now(timezone.utc)
    return Post(
        slug=slug,
        title=f"Post {slug}",
        body_markdown="body",
        locale=PostLocale.KO,
        content_kind=content_kind,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        published_at=now,
    )


def _override_repo(db: Session) -> SlugRedirectRepository:
    repo = SlugRedirectRepository(db)
    app.dependency_overrides[get_slug_redirect_repository] = lambda: repo
    return repo


def test_post_redirect_endpoint_returns_target_slug() -> None:
    db = _build_session()
    p = _make_published_post("current-blog")
    db.add(p)
    db.flush()
    repo = _override_repo(db)
    repo.record_post_rename(old_slug="legacy", new_slug="current-blog", locale=PostLocale.KO, target_post_id=p.id)
    db.commit()

    client = TestClient(app)
    response = client.get("/api/v1/web-service/posts/redirects/legacy?locale=ko")

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == {"target_slug": "current-blog"}


def test_post_redirect_endpoint_returns_404_when_no_redirect() -> None:
    db = _build_session()
    _override_repo(db)

    client = TestClient(app)
    response = client.get("/api/v1/web-service/posts/redirects/missing?locale=ko")

    app.dependency_overrides.clear()
    assert response.status_code == 404


def test_post_redirect_endpoint_filters_by_content_kind_blog() -> None:
    db = _build_session()
    project_post = _make_published_post("current-project", content_kind=PostContentKind.PROJECT)
    db.add(project_post)
    db.flush()
    repo = _override_repo(db)
    repo.record_post_rename(old_slug="legacy", new_slug="current-project", locale=PostLocale.KO, target_post_id=project_post.id)
    db.commit()

    client = TestClient(app)
    blog_response = client.get("/api/v1/web-service/posts/redirects/legacy?locale=ko")
    project_response = client.get("/api/v1/web-service/projects/redirects/legacy?locale=ko")

    app.dependency_overrides.clear()
    assert blog_response.status_code == 404
    assert project_response.status_code == 200
    assert project_response.json() == {"target_slug": "current-project"}


def test_post_redirect_endpoint_increments_hit_count() -> None:
    db = _build_session()
    p = _make_published_post("current-blog")
    db.add(p)
    db.flush()
    repo = _override_repo(db)
    repo.record_post_rename(old_slug="legacy", new_slug="current-blog", locale=PostLocale.KO, target_post_id=p.id)
    db.commit()

    client = TestClient(app)
    client.get("/api/v1/web-service/posts/redirects/legacy?locale=ko")
    client.get("/api/v1/web-service/posts/redirects/legacy?locale=ko")

    app.dependency_overrides.clear()
    row = db.scalars(select(PostSlugRedirect)).one()
    assert row.hit_count == 2
    assert row.last_hit_at is not None
```

- [ ] **Step 2: Run, verify failure**

Run: `cd apps/api && python -m pytest tests/api/test_post_redirects_api.py -v`
Expected: FAIL — endpoints not yet defined; tests get 404 from FastAPI router.

- [ ] **Step 3: Add the blog redirect endpoint**

In `apps/api/src/app/api/v1/endpoints/posts.py`, add at the bottom of the file (after the existing routes):

```python
class _RedirectResponse(dict[str, str]):
    pass


@router.get(
    '/redirects/{old_slug}',
    summary='Resolve old blog slug to current blog slug',
    description='Resolve a redirect from an old blog slug to the canonical current slug. Returns 404 if no redirect exists or the target is no longer a published, public blog post.',
    responses={
        200: {'description': 'Redirect resolved', 'content': {'application/json': {'example': {'target_slug': 'current-slug'}}}},
        404: {'description': 'No active redirect for this slug'},
    },
)
def resolve_post_redirect(
    old_slug: str,
    locale: PostLocale = Query(...),
    redirect_repo: 'SlugRedirectRepository' = Depends(get_slug_redirect_repository),  # noqa: F821
) -> dict[str, str]:
    resolution = redirect_repo.lookup_post_redirect(
        old_slug=old_slug,
        locale=locale,
        content_kind=PostContentKind.BLOG,
    )
    if resolution is None:
        raise HTTPException(status_code=404, detail='no redirect for this slug')
    redirect_repo.record_post_hit(redirect_id=resolution.redirect_id)
    return {'target_slug': resolution.target_slug}
```

Then add the imports the new handler needs at the top of the file (alongside existing imports):

```python
from app.api.deps import get_slug_redirect_repository
from app.repositories.slug_redirect_repository import SlugRedirectRepository
```

Remove the `'SlugRedirectRepository'` forward-reference quotes after adding the import (the type reference becomes `redirect_repo: SlugRedirectRepository = Depends(...)`).

The final handler signature:

```python
def resolve_post_redirect(
    old_slug: str,
    locale: PostLocale = Query(...),
    redirect_repo: SlugRedirectRepository = Depends(get_slug_redirect_repository),
) -> dict[str, str]:
```

Note on routing: this route path `/redirects/{old_slug}` is registered _before_ `/{slug}` — wait, FastAPI dispatch is order-of-declaration when both match. Since the existing `/{slug}` route is declared earlier in the file, place the new redirect route **above** the `/{slug}` route. Move the new route to appear before the existing `@router.get('/{slug}', ...)` decorator at line 147, so `/redirects/legacy` does not get captured by `/{slug}` first.

- [ ] **Step 4: Add the projects redirect endpoint**

In `apps/api/src/app/api/v1/endpoints/projects.py`, add the equivalent endpoint with `content_kind=PostContentKind.PROJECT`:

```python
from app.api.deps import get_slug_redirect_repository
from app.repositories.slug_redirect_repository import SlugRedirectRepository
from app.models.post import PostContentKind, PostLocale


@router.get(
    '/redirects/{old_slug}',
    summary='Resolve old project slug to current project slug',
    description='Resolve a redirect from an old project slug to the canonical current slug. Returns 404 if no redirect exists or the target is no longer a project post.',
    responses={
        200: {'description': 'Redirect resolved'},
        404: {'description': 'No active redirect for this slug'},
    },
)
def resolve_project_redirect(
    old_slug: str,
    locale: PostLocale = Query(...),
    redirect_repo: SlugRedirectRepository = Depends(get_slug_redirect_repository),
) -> dict[str, str]:
    resolution = redirect_repo.lookup_post_redirect(
        old_slug=old_slug,
        locale=locale,
        content_kind=PostContentKind.PROJECT,
    )
    if resolution is None:
        raise HTTPException(status_code=404, detail='no redirect for this slug')
    redirect_repo.record_post_hit(redirect_id=resolution.redirect_id)
    return {'target_slug': resolution.target_slug}
```

Verify imports already present in `projects.py`: `Depends`, `Query`, `HTTPException`. Add any missing.

Place this route **before** any existing `/{slug}` route in `projects.py`.

- [ ] **Step 5: Run tests**

Run: `cd apps/api && python -m pytest tests/api/test_post_redirects_api.py -v`
Expected: 4 PASS

- [ ] **Step 6: Run pre-existing post/project tests to confirm no regression**

Run: `cd apps/api && python -m pytest tests/api/test_posts_admin_edit_delete.py tests/api/test_projects_api.py tests/api/test_projects_locale_filter.py -v`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/api/v1/endpoints/posts.py apps/api/src/app/api/v1/endpoints/projects.py apps/api/tests/api/test_post_redirects_api.py
git commit -m "feat(redirects): add /posts/redirects and /projects/redirects endpoints"
```

---

## Task 9: API endpoint — `/series/redirects/{old_slug}`

**Files:**
- Modify: `apps/api/src/app/api/v1/endpoints/series.py`
- Test: `apps/api/tests/api/test_series_redirects_api.py`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/api/test_series_redirects_api.py`:

```python
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.api.deps import get_slug_redirect_repository
from app.db.base import Base
from app.main import app
from app.models import admin_credential, media, post, post_comment, project_profile, series, site_profile, slug_redirect, tag  # noqa: F401
from app.models.post import PostLocale, PostTranslationSourceKind, PostTranslationStatus
from app.models.series import Series
from app.models.slug_redirect import SeriesSlugRedirect
from app.repositories.slug_redirect_repository import SlugRedirectRepository


def _build_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def _make_series(slug: str) -> Series:
    return Series(
        slug=slug,
        title=f"Series {slug}",
        description="desc",
        locale=PostLocale.KO,
        translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
    )


def _override_repo(db: Session) -> SlugRedirectRepository:
    repo = SlugRedirectRepository(db)
    app.dependency_overrides[get_slug_redirect_repository] = lambda: repo
    return repo


def test_series_redirect_endpoint_returns_target_slug() -> None:
    db = _build_session()
    s = _make_series("current-series")
    db.add(s)
    db.flush()
    repo = _override_repo(db)
    repo.record_series_rename(old_slug="legacy", new_slug="current-series", locale=PostLocale.KO, target_series_id=s.id)
    db.commit()

    client = TestClient(app)
    response = client.get("/api/v1/web-service/series/redirects/legacy?locale=ko")

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == {"target_slug": "current-series"}


def test_series_redirect_endpoint_returns_404_when_missing() -> None:
    db = _build_session()
    _override_repo(db)

    client = TestClient(app)
    response = client.get("/api/v1/web-service/series/redirects/missing?locale=ko")

    app.dependency_overrides.clear()
    assert response.status_code == 404


def test_series_redirect_endpoint_records_hit() -> None:
    db = _build_session()
    s = _make_series("current-series")
    db.add(s)
    db.flush()
    repo = _override_repo(db)
    repo.record_series_rename(old_slug="legacy", new_slug="current-series", locale=PostLocale.KO, target_series_id=s.id)
    db.commit()

    client = TestClient(app)
    client.get("/api/v1/web-service/series/redirects/legacy?locale=ko")

    app.dependency_overrides.clear()
    row = db.scalars(select(SeriesSlugRedirect)).one()
    assert row.hit_count == 1
    assert row.last_hit_at is not None
```

- [ ] **Step 2: Run, verify failure**

Run: `cd apps/api && python -m pytest tests/api/test_series_redirects_api.py -v`
Expected: FAIL — endpoint missing.

- [ ] **Step 3: Add the series redirect endpoint**

In `apps/api/src/app/api/v1/endpoints/series.py`, add (before any existing `/{slug}` route):

```python
from app.api.deps import get_slug_redirect_repository
from app.models.post import PostLocale
from app.repositories.slug_redirect_repository import SlugRedirectRepository


@router.get(
    '/redirects/{old_slug}',
    summary='Resolve old series slug to current series slug',
    description='Resolve a redirect from an old series slug to the canonical current slug. Returns 404 if no redirect exists.',
    responses={
        200: {'description': 'Redirect resolved'},
        404: {'description': 'No active redirect for this slug'},
    },
)
def resolve_series_redirect(
    old_slug: str,
    locale: PostLocale = Query(...),
    redirect_repo: SlugRedirectRepository = Depends(get_slug_redirect_repository),
) -> dict[str, str]:
    resolution = redirect_repo.lookup_series_redirect(old_slug=old_slug, locale=locale)
    if resolution is None:
        raise HTTPException(status_code=404, detail='no redirect for this slug')
    redirect_repo.record_series_hit(redirect_id=resolution.redirect_id)
    return {'target_slug': resolution.target_slug}
```

Verify the existing imports include `Depends`, `Query`, `HTTPException` from FastAPI. Add any missing.

- [ ] **Step 4: Run tests**

Run: `cd apps/api && python -m pytest tests/api/test_series_redirects_api.py tests/api/test_series_api.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/api/v1/endpoints/series.py apps/api/tests/api/test_series_redirects_api.py
git commit -m "feat(redirects): add /series/redirects endpoint"
```

---

## Task 10: Cleanup scheduler

**Files:**
- Create: `apps/api/src/app/services/slug_redirect_cleanup_scheduler.py`
- Create: `apps/api/tests/services/test_slug_redirect_cleanup_scheduler.py`
- Modify: `apps/api/src/app/main.py`

The scheduler reuses the same window-based scheduling logic as `draft_cleanup_scheduler` but runs `purge_expired_post_redirects` and `purge_expired_series_redirects` once per day.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/services/test_slug_redirect_cleanup_scheduler.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import admin_credential, media, post, post_comment, project_profile, series, site_profile, slug_redirect, tag  # noqa: F401
from app.models.post import (
    Post,
    PostContentKind,
    PostLocale,
    PostStatus,
    PostTranslationSourceKind,
    PostTranslationStatus,
    PostVisibility,
)
from app.models.series import Series
from app.models.slug_redirect import PostSlugRedirect, SeriesSlugRedirect
from app.services import slug_redirect_cleanup_scheduler as scheduler


def _persist_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def _make_post(slug: str) -> Post:
    now = datetime.now(timezone.utc)
    return Post(
        slug=slug, title=slug, body_markdown="body",
        locale=PostLocale.KO, content_kind=PostContentKind.BLOG,
        status=PostStatus.PUBLISHED, visibility=PostVisibility.PUBLIC,
        translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        published_at=now,
    )


def _make_series(slug: str) -> Series:
    return Series(
        slug=slug, title=slug, description="d",
        locale=PostLocale.KO, translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
    )


def test_purge_expired_redirects_drains_post_and_series_tables(monkeypatch) -> None:
    db = _persist_session()
    p = _make_post("p")
    s = _make_series("s")
    db.add_all([p, s])
    db.flush()
    now = datetime.now(timezone.utc)
    db.add_all([
        PostSlugRedirect(
            locale=PostLocale.KO, old_slug="aged",
            target_post_id=p.id, created_at=now - timedelta(days=120),
        ),
        SeriesSlugRedirect(
            locale=PostLocale.KO, old_slug="aged",
            target_series_id=s.id, created_at=now - timedelta(days=120),
        ),
    ])
    db.commit()

    monkeypatch.setattr(scheduler, "SessionLocal", lambda: db)
    monkeypatch.setattr(scheduler.settings, "slug_redirect_min_age_days", 90, raising=False)
    monkeypatch.setattr(scheduler.settings, "slug_redirect_idle_days", 30, raising=False)

    summary = scheduler.purge_expired_redirects()

    assert summary == {"deleted_post_redirects": 1, "deleted_series_redirects": 1}
    assert db.scalars(select(PostSlugRedirect)).all() == []
    assert db.scalars(select(SeriesSlugRedirect)).all() == []
```

- [ ] **Step 2: Run, verify failure**

Run: `cd apps/api && python -m pytest tests/services/test_slug_redirect_cleanup_scheduler.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.slug_redirect_cleanup_scheduler'`

- [ ] **Step 3: Implement the scheduler**

Create `apps/api/src/app/services/slug_redirect_cleanup_scheduler.py`:

```python
from __future__ import annotations

import asyncio
import logging
import random
from contextlib import suppress
from datetime import date, datetime, time, timedelta

from app.core.config import settings
from app.db.session import SessionLocal
from app.repositories.slug_redirect_repository import SlugRedirectRepository

logger = logging.getLogger(__name__)


def _normalize_hour(value: int) -> int:
    return max(0, min(23, int(value)))


def _next_run_at(now_local: datetime, last_run_local_date: date | None = None) -> datetime:
    start_hour = _normalize_hour(settings.draft_cleanup_start_hour)
    end_hour = _normalize_hour(settings.draft_cleanup_end_hour)
    if end_hour < start_hour:
        start_hour, end_hour = end_hour, start_hour

    candidate_date = now_local.date()
    if last_run_local_date is not None and candidate_date <= last_run_local_date:
        candidate_date = last_run_local_date + timedelta(days=1)

    while True:
        window_start = datetime.combine(
            candidate_date,
            time(hour=start_hour, minute=0, second=0),
            tzinfo=now_local.tzinfo,
        )
        window_end = datetime.combine(
            candidate_date,
            time(hour=end_hour, minute=59, second=59),
            tzinfo=now_local.tzinfo,
        )

        if candidate_date == now_local.date():
            if now_local > window_end:
                candidate_date += timedelta(days=1)
                continue
            schedule_start = max(window_start, now_local + timedelta(seconds=1))
        else:
            schedule_start = window_start

        if schedule_start > window_end:
            candidate_date += timedelta(days=1)
            continue

        start_ts = schedule_start.timestamp()
        end_ts = max(window_end.timestamp(), start_ts + 1)
        target_ts = random.uniform(start_ts, end_ts)
        return datetime.fromtimestamp(target_ts, tz=now_local.tzinfo)


def purge_expired_redirects() -> dict[str, int]:
    min_age_days = max(1, int(settings.slug_redirect_min_age_days))
    idle_days = max(1, int(settings.slug_redirect_idle_days))

    db = SessionLocal()
    try:
        repo = SlugRedirectRepository(db)
        deleted_posts = repo.purge_expired_post_redirects(
            min_age_days=min_age_days, idle_days=idle_days,
        )
        deleted_series = repo.purge_expired_series_redirects(
            min_age_days=min_age_days, idle_days=idle_days,
        )
    finally:
        # Tests may pass a long-lived Session via monkeypatched SessionLocal;
        # closing here is harmless because each call is self-contained.
        db.close()
    return {
        "deleted_post_redirects": deleted_posts,
        "deleted_series_redirects": deleted_series,
    }


async def run_slug_redirect_cleanup_loop(stop_event: asyncio.Event) -> None:
    last_run_local_date: date | None = None

    while not stop_event.is_set():
        now_local = datetime.now().astimezone()
        next_run_at = _next_run_at(now_local, last_run_local_date)
        delay_seconds = max(1.0, (next_run_at - now_local).total_seconds())
        logger.info('slug redirect cleanup scheduled for %s', next_run_at.isoformat())

        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(stop_event.wait(), timeout=delay_seconds)
            break

        try:
            summary = await asyncio.to_thread(purge_expired_redirects)
            logger.info(
                'slug redirect cleanup completed: deleted_post_redirects=%s deleted_series_redirects=%s',
                summary["deleted_post_redirects"],
                summary["deleted_series_redirects"],
            )
        except asyncio.CancelledError:
            raise
        except Exception:  # pragma: no cover
            logger.exception('slug redirect cleanup failed')
        finally:
            last_run_local_date = datetime.now().astimezone().date()
```

Note: the test monkeypatches `scheduler.SessionLocal` to return the existing in-memory session and patches `db.close()` is harmless because the test holds its own reference. The pattern follows `draft_cleanup_scheduler.py`.

Adjust the test to bypass the `db.close()` call: in the test, after `monkeypatch.setattr(scheduler, "SessionLocal", lambda: db)`, also `monkeypatch.setattr(db, "close", lambda: None)` — but a simpler approach is to wrap the session in a class-like object. Update the test step accordingly:

In `tests/services/test_slug_redirect_cleanup_scheduler.py`, before the `monkeypatch.setattr(scheduler, "SessionLocal", ...)` line, add:

```python
    monkeypatch.setattr(db, "close", lambda: None)
```

- [ ] **Step 4: Run scheduler tests**

Run: `cd apps/api && python -m pytest tests/services/test_slug_redirect_cleanup_scheduler.py -v`
Expected: PASS

- [ ] **Step 5: Wire into main.py**

In `apps/api/src/app/main.py`, replace lines 13-14 with:

```python
from app.services.draft_cleanup_scheduler import run_draft_cleanup_loop
from app.services.series_projection_cache import run_series_projection_loop
from app.services.slug_redirect_cleanup_scheduler import run_slug_redirect_cleanup_loop
```

Replace the lifespan body (lines 32-45) with:

```python
@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    stop_event = asyncio.Event()
    cleanup_task = asyncio.create_task(run_draft_cleanup_loop(stop_event))
    series_projection_task = asyncio.create_task(run_series_projection_loop(stop_event))
    slug_redirect_cleanup_task = asyncio.create_task(run_slug_redirect_cleanup_loop(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        for task in (cleanup_task, series_projection_task, slug_redirect_cleanup_task):
            task.cancel()
        for task in (cleanup_task, series_projection_task, slug_redirect_cleanup_task):
            with suppress(asyncio.CancelledError):
                await task
```

- [ ] **Step 6: Verify the lifespan still loads**

Run: `cd apps/api && python -c "from app.main import app; print('lifespan ok', app.title)"`
Expected: `lifespan ok traceoflight-api`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app/services/slug_redirect_cleanup_scheduler.py apps/api/src/app/main.py apps/api/tests/services/test_slug_redirect_cleanup_scheduler.py
git commit -m "feat(redirects): daily cleanup scheduler and main.py wiring"
```

---

## Task 11: Web — `resolvePostSlugRedirect` helper

**Files:**
- Modify: `apps/web/src/lib/blog-db.ts`

The web side calls the API endpoint when a slug lookup returns null. Helper returns `string | null`.

- [ ] **Step 1: Add the helper**

Append to `apps/web/src/lib/blog-db.ts` after `getPublishedDbPostBySlug`:

```typescript
export async function resolvePostSlugRedirect(
  slug: string,
  locale: string,
): Promise<string | null> {
  const params = new URLSearchParams({ locale });
  const response = await requestBackend(
    `/posts/redirects/${encodeURIComponent(slug)}?${params.toString()}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`failed to resolve post redirect: ${response.status}`);
  }
  const body = (await response.json()) as { target_slug?: string };
  return body.target_slug ?? null;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/blog-db.ts
git commit -m "feat(redirects): add resolvePostSlugRedirect helper"
```

---

## Task 12: Web — `resolveProjectSlugRedirect` helper

**Files:**
- Modify: `apps/web/src/lib/projects.ts`

- [ ] **Step 1: Locate the request import in `projects.ts`**

Run: `grep -n "requestBackend" apps/web/src/lib/projects.ts | head -3`
Expected: shows the existing `requestBackend` import. If absent, add the import:

```typescript
import { requestBackend } from "./backend-api";
```

- [ ] **Step 2: Add the helper**

Append at the end of `apps/web/src/lib/projects.ts`:

```typescript
export async function resolveProjectSlugRedirect(
  slug: string,
  locale: string,
): Promise<string | null> {
  const params = new URLSearchParams({ locale });
  const response = await requestBackend(
    `/projects/redirects/${encodeURIComponent(slug)}?${params.toString()}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`failed to resolve project redirect: ${response.status}`);
  }
  const body = (await response.json()) as { target_slug?: string };
  return body.target_slug ?? null;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/projects.ts
git commit -m "feat(redirects): add resolveProjectSlugRedirect helper"
```

---

## Task 13: Web — `resolveSeriesSlugRedirect` helper

**Files:**
- Modify: `apps/web/src/lib/series-db.ts`

- [ ] **Step 1: Add the helper**

Append at the end of `apps/web/src/lib/series-db.ts`:

```typescript
export async function resolveSeriesSlugRedirect(
  slug: string,
  locale: string,
): Promise<string | null> {
  const params = new URLSearchParams({ locale });
  const response = await requestBackend(
    `/series/redirects/${encodeURIComponent(slug)}?${params.toString()}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`failed to resolve series redirect: ${response.status}`);
  }
  const body = (await response.json()) as { target_slug?: string };
  return body.target_slug ?? null;
}
```

If `requestBackend` is not yet imported in `series-db.ts`, add `import { requestBackend } from "./backend-api";` at the top.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/series-db.ts
git commit -m "feat(redirects): add resolveSeriesSlugRedirect helper"
```

---

## Task 14: Wire blog page 404 fallback

**Files:**
- Modify: `apps/web/src/pages/[locale]/blog/[...slug].astro`

- [ ] **Step 1: Add fallback redirect lookup**

Open `apps/web/src/pages/[locale]/blog/[...slug].astro`. Add `resolvePostSlugRedirect` to the existing destructured import from `lib/blog-db`:

```astro
import { getPublishedDbPostBySlug, renderDbMarkdown, resolvePostSlugRedirect } from "../../../lib/blog-db";
```

The current page has this sequence (around lines 33-57):

```astro
try {
  dbPost = await getPublishedDbPostBySlug(slug, {
    includePrivate: isAdminViewer,
    locale,
  });
} catch {
  dbPost = null;
}

let dbPostHtml: string | null = null;
let dbSeriesPostsForSidebar: Awaited<ReturnType<typeof loadSeriesSidebarPosts>> = [];
let commentsData = emptyPostCommentThreadList();

if (dbPost) {
  ...
} else {
  Astro.response.status = 404;
}
```

Insert a redirect-fallback block **between** the try/catch and the `let dbPostHtml` line. The new block runs only when `dbPost` is null and short-circuits with a 301 if the redirect lookup succeeds:

```astro
if (!dbPost) {
  const redirectTarget = await resolvePostSlugRedirect(slug, locale);
  if (redirectTarget) {
    return Astro.redirect(`/${locale}/blog/${redirectTarget}/`, 301);
  }
}
```

If `redirectTarget` is null, control falls through to the existing `else { Astro.response.status = 404; }` branch unchanged.

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/[locale]/blog/[...slug].astro
git commit -m "feat(redirects): blog page falls back to slug redirect before 404"
```

---

## Task 15: Wire series page 404 fallback

**Files:**
- Modify: `apps/web/src/pages/[locale]/series/[slug].astro`

- [ ] **Step 1: Add fallback**

Open `apps/web/src/pages/[locale]/series/[slug].astro`. Append `resolveSeriesSlugRedirect` to the existing series-db import:

```astro
import { getSeriesBySlug, resolveSeriesSlugRedirect } from "../../../lib/series-db";
```

Replace this existing block (around line 67-69):

```astro
if (!series) {
  Astro.response.status = 404;
}
```

with:

```astro
if (!series) {
  const redirectTarget = await resolveSeriesSlugRedirect(slug, locale);
  if (redirectTarget) {
    return Astro.redirect(`/${locale}/series/${redirectTarget}/`, 301);
  }
  Astro.response.status = 404;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/[locale]/series/[slug].astro
git commit -m "feat(redirects): series page falls back to slug redirect before 404"
```

---

## Task 16: Wire projects page 404 fallback

**Files:**
- Modify: `apps/web/src/pages/[locale]/projects/[slug].astro`

- [ ] **Step 1: Add fallback**

Open `apps/web/src/pages/[locale]/projects/[slug].astro`. Append `resolveProjectSlugRedirect` to the existing projects import:

```astro
import { getPublishedDbProjectBySlug, resolveProjectSlugRedirect } from "../../../lib/projects";
```

Replace the existing block:

```astro
if (!project) {
  Astro.response.status = 404;
}
```

with:

```astro
if (!project) {
  const redirectTarget = await resolveProjectSlugRedirect(slug, locale);
  if (redirectTarget) {
    return Astro.redirect(`/${locale}/projects/${redirectTarget}/`, 301);
  }
  Astro.response.status = 404;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/[locale]/projects/[slug].astro
git commit -m "feat(redirects): projects page falls back to slug redirect before 404"
```

---

## Task 17: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full API test suite**

Run: `cd apps/api && python -m pytest -v`
Expected: all PASS, no new warnings beyond pre-existing.

- [ ] **Step 2: Web typecheck**

Run: `cd apps/web && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Web guard tests**

Run: `cd apps/web && npm run test:guards`
Expected: PASS

- [ ] **Step 4: Manual smoke verification**

Document a manual verification checklist in the commit message. The reviewer should confirm:

1. Apply migrations: `cd apps/api && alembic upgrade head` — must succeed.
2. Start API + web in dev mode.
3. Create a post via admin with slug `task-test`.
4. Visit `/ko/blog/task-test/` — 200.
5. Rename it to `task-test-renamed` via admin edit.
6. Visit `/ko/blog/task-test/` — 301 to `/ko/blog/task-test-renamed/` → 200.
7. Rename again to `task-test-final`.
8. Visit both `/ko/blog/task-test/` and `/ko/blog/task-test-renamed/` — both 301 to `/ko/blog/task-test-final/` (single hop each).
9. Repeat for a series (rename + visit) and a project.

- [ ] **Step 5: Final summary commit**

If any extra docs or follow-ups surface during smoke testing, commit them. Otherwise this task ends with no further commit.

---

## Open follow-ups (out of plan)

- Admin UI redirect-list management page (deferred — cleanup task makes it unnecessary in the common case).
- Sitemap exposure of recent old slugs (out of scope — search engines discover redirects by crawling).
- Comments API URL (`GET /posts/{slug}/comments`) redirect resolution (out of scope — page hydrates after the public 301).
