from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.deps import get_project_service
from app.db.base import Base
from app.main import app
from app.models import admin_credential, media, post, post_comment, series, site_profile, tag  # noqa: F401
from app.models.post import PostContentKind, PostLocale, PostStatus, PostTranslationSourceKind, PostTranslationStatus, PostVisibility
from app.models.post import Post
from app.repositories.post_repository import PostRepository
from app.repositories.series_repository import SeriesRepository
from app.services.project_service import ProjectService


def _build_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def _make_project(slug: str, locale: PostLocale, translation_group_id: uuid.UUID) -> Post:
    now = datetime.now(timezone.utc)
    return Post(
        slug=slug,
        title=f"Project {locale.value}",
        excerpt="excerpt",
        body_markdown="body",
        cover_image_url=None,
        content_kind=PostContentKind.PROJECT,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        locale=locale,
        translation_group_id=translation_group_id,
        translation_status=PostTranslationStatus.SOURCE if locale == PostLocale.KO else PostTranslationStatus.SYNCED,
        translation_source_kind=PostTranslationSourceKind.MANUAL,
        published_at=now,
    )


# --- Repository-level tests ---------------------------------------------------

def test_post_repo_list_filters_project_by_locale_ko() -> None:
    db = _build_session()
    repo = PostRepository(db)
    group = uuid.uuid4()
    db.add(_make_project("proj-ko", PostLocale.KO, group))
    db.add(_make_project("proj-en", PostLocale.EN, group))
    db.commit()

    ko_only = repo.list(content_kind=PostContentKind.PROJECT, locale=PostLocale.KO)
    assert len(ko_only) == 1
    assert ko_only[0].slug == "proj-ko"


def test_post_repo_list_filters_project_by_locale_en() -> None:
    db = _build_session()
    repo = PostRepository(db)
    group = uuid.uuid4()
    db.add(_make_project("proj-ko", PostLocale.KO, group))
    db.add(_make_project("proj-en", PostLocale.EN, group))
    db.commit()

    en_only = repo.list(content_kind=PostContentKind.PROJECT, locale=PostLocale.EN)
    assert len(en_only) == 1
    assert en_only[0].slug == "proj-en"


def test_post_repo_list_no_locale_returns_all_projects() -> None:
    db = _build_session()
    repo = PostRepository(db)
    group = uuid.uuid4()
    db.add(_make_project("proj-ko", PostLocale.KO, group))
    db.add(_make_project("proj-en", PostLocale.EN, group))
    db.commit()

    all_projects = repo.list(content_kind=PostContentKind.PROJECT)
    assert len(all_projects) == 2


# --- API-level tests (stub service with locale forwarded) ---------------------

class _LocaleAwareStubProjectService:
    def __init__(self) -> None:
        self.list_called_with: dict[str, object] | None = None
        self.get_called_with: dict[str, object] | None = None

    def list_projects(self, limit=20, offset=0, include_private=False, locale=None):  # type: ignore[no-untyped-def]
        self.list_called_with = {
            "limit": limit,
            "offset": offset,
            "include_private": include_private,
            "locale": locale,
        }
        return []

    def get_project_by_slug(self, slug: str, include_private=False, locale=None):  # type: ignore[no-untyped-def]
        self.get_called_with = {
            "slug": slug,
            "include_private": include_private,
            "locale": locale,
        }
        return None

    def replace_project_order(self, project_slugs: list[str]):  # type: ignore[no-untyped-def]
        return []


def _client_with_service(service: _LocaleAwareStubProjectService) -> TestClient:
    app.dependency_overrides[get_project_service] = lambda: service
    return TestClient(app)


def test_list_projects_passes_locale_to_service() -> None:
    service = _LocaleAwareStubProjectService()
    client = _client_with_service(service)

    response = client.get("/api/v1/web-service/projects?locale=ko")

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.list_called_with is not None
    assert service.list_called_with["locale"] == PostLocale.KO


def test_list_projects_no_locale_passes_none_to_service() -> None:
    service = _LocaleAwareStubProjectService()
    client = _client_with_service(service)

    response = client.get("/api/v1/web-service/projects")

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert service.list_called_with is not None
    assert service.list_called_with["locale"] is None


def test_get_project_by_slug_passes_locale_to_service() -> None:
    service = _LocaleAwareStubProjectService()
    client = _client_with_service(service)

    response = client.get("/api/v1/web-service/projects/my-proj?locale=en")

    app.dependency_overrides.clear()
    assert response.status_code == 404  # stub returns None → 404
    assert service.get_called_with is not None
    assert service.get_called_with["locale"] == PostLocale.EN


def test_list_projects_invalid_locale_returns_422() -> None:
    service = _LocaleAwareStubProjectService()
    client = _client_with_service(service)

    response = client.get("/api/v1/web-service/projects?locale=xx")

    app.dependency_overrides.clear()
    assert response.status_code == 422
