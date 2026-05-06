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

    monkeypatch.setattr(db, "close", lambda: None)
    monkeypatch.setattr(scheduler, "SessionLocal", lambda: db)
    monkeypatch.setattr(scheduler.settings, "slug_redirect_min_age_days", 90, raising=False)
    monkeypatch.setattr(scheduler.settings, "slug_redirect_idle_days", 30, raising=False)

    summary = scheduler.purge_expired_redirects()

    assert summary == {"deleted_post_redirects": 1, "deleted_series_redirects": 1}
    assert db.scalars(select(PostSlugRedirect)).all() == []
    assert db.scalars(select(SeriesSlugRedirect)).all() == []
