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
