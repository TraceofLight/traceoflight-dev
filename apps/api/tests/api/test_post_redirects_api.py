from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

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
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
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
