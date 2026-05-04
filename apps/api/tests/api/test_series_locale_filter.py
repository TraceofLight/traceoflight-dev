from __future__ import annotations

import uuid
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import admin_credential, media, post, post_comment, series, site_profile, tag  # noqa: F401
from app.models.post import (
    Post,
    PostContentKind,
    PostLocale,
    PostStatus,
    PostTranslationSourceKind,
    PostTranslationStatus,
    PostVisibility,
)
from app.models.series import Series, SeriesPost
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
        slug="x", title="원본", description="설명",
        cover_image_url=None, locale=PostLocale.KO, translation_group_id=group,
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
    ))
    db.add(Series(
        slug="x", title="EN", description="EN desc",
        cover_image_url=None, locale=PostLocale.EN, translation_group_id=group,
        translation_status=PostTranslationStatus.SYNCED,
        translation_source_kind=PostTranslationSourceKind.MACHINE,
    ))
    db.commit()

    ko_only = repo.list(include_private=True, locale=PostLocale.KO)
    en_only = repo.list(include_private=True, locale=PostLocale.EN)
    assert [s["title"] for s in ko_only] == ["원본"]
    assert [s["title"] for s in en_only] == ["EN"]


def test_series_get_by_slug_filters_by_locale() -> None:
    """`get_by_slug` must return the locale-specific sibling row, not the first
    matching slug (which would always be the Korean source)."""
    db = _build_session()
    repo = SeriesRepository(db)
    group = uuid.uuid4()

    ko_post = Post(
        slug="p1-ko", title="포스트", excerpt=None, body_markdown="본문",
        cover_image_url=None, locale=PostLocale.KO,
        status=PostStatus.PUBLISHED, visibility=PostVisibility.PUBLIC,
        content_kind=PostContentKind.BLOG, translation_group_id=uuid.uuid4(),
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
    )
    en_post = Post(
        slug="p1-en", title="Post", excerpt=None, body_markdown="Body",
        cover_image_url=None, locale=PostLocale.EN,
        status=PostStatus.PUBLISHED, visibility=PostVisibility.PUBLIC,
        content_kind=PostContentKind.BLOG, translation_group_id=ko_post.translation_group_id,
        source_post_id=None,
        translation_status=PostTranslationStatus.SYNCED,
        translation_source_kind=PostTranslationSourceKind.MACHINE,
    )
    db.add_all([ko_post, en_post])
    db.flush()

    ko_series = Series(
        slug="x", title="원본", description="설명",
        cover_image_url=None, locale=PostLocale.KO, translation_group_id=group,
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
    )
    en_series = Series(
        slug="x", title="EN", description="EN desc",
        cover_image_url=None, locale=PostLocale.EN, translation_group_id=group,
        translation_status=PostTranslationStatus.SYNCED,
        translation_source_kind=PostTranslationSourceKind.MACHINE,
    )
    db.add_all([ko_series, en_series])
    db.flush()
    db.add(SeriesPost(series_id=ko_series.id, post_id=ko_post.id, order_index=1))
    db.add(SeriesPost(series_id=en_series.id, post_id=en_post.id, order_index=1))
    db.commit()

    en = repo.get_by_slug(slug="x", include_private=True, locale=PostLocale.EN)
    ko = repo.get_by_slug(slug="x", include_private=True, locale=PostLocale.KO)
    assert en is not None and en["title"] == "EN"
    assert ko is not None and ko["title"] == "원본"


def test_series_admin_reorder_lists_only_korean_sources() -> None:
    """Admin reorder must see one row per series-group (the Korean source)."""
    db = _build_session()
    repo = SeriesRepository(db)
    group = uuid.uuid4()
    db.add(Series(
        slug="x", title="원본", description="설명",
        cover_image_url=None, locale=PostLocale.KO, translation_group_id=group,
        translation_status=PostTranslationStatus.SOURCE,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
    ))
    db.add(Series(
        slug="x", title="EN", description="EN desc",
        cover_image_url=None, locale=PostLocale.EN, translation_group_id=group,
        translation_status=PostTranslationStatus.SYNCED,
        translation_source_kind=PostTranslationSourceKind.MACHINE,
    ))
    db.commit()

    sources = repo.list_admin_sources()
    assert [s.title for s in sources] == ["원본"]
