from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.deps import get_slug_redirect_repository
from app.db.base import Base
from app.main import app
from app.models import admin_credential, media, post, post_comment, project_profile, series, site_profile, slug_redirect, tag  # noqa: F401
from app.models.post import PostLocale, PostTranslationSourceKind, PostTranslationStatus
from app.models.series import Series
from app.models.slug_redirect import SeriesSlugRedirect
from app.repositories.slug_redirect_repository import SlugRedirectRepository


def _build_session() -> Session:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
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
