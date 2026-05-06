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
