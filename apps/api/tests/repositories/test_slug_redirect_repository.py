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
    repo.record_post_rename(old_slug="c", new_slug="a-new", locale=PostLocale.KO, target_post_id=p2.id)
    db.commit()

    rows = db.scalars(select(PostSlugRedirect).order_by(PostSlugRedirect.old_slug)).all()
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
